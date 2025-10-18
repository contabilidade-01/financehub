import { useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiTokensList } from "@/components/settings/ApiTokensList";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import React, { useState } from "react";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { UnsavedChangesModal } from "@/components/ui/UnsavedChangesModal";
import { useLocalization, useTranslation } from "@/contexts/LocalizationContext";

const createProfileSchema = (t: (key: string, fallback: string) => string) =>
  z.object({
    nome: z.string().min(1, t('settings.validation.name_required', 'O nome é obrigatório')),
    email: z.string().email(t('settings.validation.email_invalid', 'E-mail inválido')),
    telefone: z
      .string()
      .optional()
      .refine((val) => {
        if (!val || val.trim() === '') return true;
        const digits = val.replace(/\D/g, '');
        return digits.length === 10 || digits.length === 11;
      }, t('settings.validation.phone_invalid', 'Telefone deve ter DDD e número válido (10 ou 11 dígitos)')),
  });

const createPasswordSchema = (t: (key: string, fallback: string) => string) =>
  z
    .object({
      senha_atual: z.string().min(6, t('settings.validation.current_password_required', 'A senha atual é obrigatória')),
      nova_senha: z.string().min(6, t('settings.validation.new_password_min', 'A nova senha deve ter pelo menos 6 caracteres')),
      confirmar_senha: z.string().min(6, t('settings.validation.confirm_password_required', 'Confirme a nova senha')),
    })
    .refine((data) => data.nova_senha === data.confirmar_senha, {
      message: t('settings.validation.passwords_not_match', 'As senhas não coincidem'),
      path: ['confirmar_senha'],
    });

type ProfileFormValues = {
  nome: string;
  email: string;
  telefone?: string;
};

type PasswordFormValues = {
  senha_atual: string;
  nova_senha: string;
  confirmar_senha: string;
};

// Função de formatação igual ao admin
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  if (digits.length === 10) {
    // 8 dígitos: (41) 8503-7379
    return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6,10)}`;
  }
  if (digits.length === 11) {
    // 9 dígitos: (41) 9 8503-7379
    return `(${digits.slice(0,2)}) ${digits.slice(2,3)} ${digits.slice(3,7)}-${digits.slice(7,11)}`;
  }
  // Para digitação intermediária
  if (digits.length < 10) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  if (digits.length < 11) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6,10)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,3)} ${digits.slice(3,7)}-${digits.slice(7,11)}`;
};

// Novo componente de input de telefone com +55 fixo (igual admin)
function PhoneInput({ value, onChange, placeholder, error, t }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: boolean; t: (key: string, fallback: string) => string }) {
  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
    if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6,10)}`;
    if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,3)} ${digits.slice(3,7)}-${digits.slice(7,11)}`;
    if (digits.length < 10) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
    if (digits.length < 11) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6,10)}`;
    return `(${digits.slice(0,2)}) ${digits.slice(2,3)} ${digits.slice(3,7)}-${digits.slice(7,11)}`;
  };
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{
        position: 'absolute',
        left: 12,
        color: error ? '#dc2626' : '#64748b',
        fontWeight: 500,
        fontSize: 15,
        pointerEvents: 'none',
        zIndex: 2
      }}>+55</span>
      <input
        type="text"
        value={formatPhone(value)}
        onChange={e => {
          let val = e.target.value.replace(/\D/g, "");
          if (val.length > 11) val = val.slice(0, 11);
          onChange(val);
        }}
        placeholder={placeholder || t('settings.phone_placeholder', '(41) 9 8503-7379')}
        style={{ paddingLeft: 44 }}
        className={`admin-user-form-input${error ? ' border border-red-500' : ''}`}
        maxLength={16}
        autoComplete="off"
      />
    </div>
  );
}

// Modal animada de erro
type ModalAnimadaErroProps = {
  open: boolean;
  onClose: () => void;
  mensagem: string;
  icone?: React.ReactNode;
  titulo: string;
  fecharLabel: string;
};
function ModalAnimadaErro({ open, onClose, mensagem, icone, titulo, fecharLabel }: ModalAnimadaErroProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-xs relative flex flex-col items-center animate-zoomin-bounce"
        style={{ animationDuration: "350ms" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-2 flex justify-center w-full">
          {icone || (
            <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01" />
            </svg>
          )}
        </div>
        <div className="text-center text-lg font-semibold text-red-600 mb-2">
          {titulo}
        </div>
        <div className="text-center text-gray-700 mb-4">{mensagem}</div>
        <button
          className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
          onClick={onClose}
        >
          {fecharLabel}
        </button>
      </div>
      <style>{`
        @keyframes zoomin-bounce {
          0% { transform: scale(0.7); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          80% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .animate-zoomin-bounce {
          animation: zoomin-bounce 350ms cubic-bezier(.68,-0.55,.27,1.55);
        }
      `}</style>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { locale } = useLocalization();
  const normalizedLocale = useMemo(
    () => (locale ? locale.replace(/([a-z]{2})-([a-z]{2})/, (_: string, lang: string, region: string) => `${lang}-${region.toUpperCase()}`) : "pt-BR"),
    [locale]
  );
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(normalizedLocale), [normalizedLocale]);
  const profileSchema = useMemo(() => createProfileSchema(t), [t]);
  const passwordSchema = useMemo(() => createPasswordSchema(t), [t]);
  const formatLocalizedDate = useCallback(
    (value: Date | string | null | undefined) => {
      if (!value) {
        return '';
      }
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return dateFormatter.format(date);
    },
    [dateFormatter]
  );
  const [erroModal, setErroModal] = useState({ open: false, mensagem: "" });
  const [activeTab, setActiveTab] = useState("perfil");

  // Formulário de perfil
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nome: "",
      email: "",
      telefone: "",
    },
  });

  // Formulário de senha
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      senha_atual: "",
      nova_senha: "",
      confirmar_senha: "",
    },
  });

  // Carregar dados do usuário no formulário
  useEffect(() => {
    if (user) {
      let telefone = user.telefone || "";
      // Se começa com 55 e tem 12 ou 13 dígitos, remove o DDI para exibir no input
      if (telefone.startsWith("55") && (telefone.length === 12 || telefone.length === 13)) {
        telefone = telefone.slice(2);
      }
      profileForm.reset({
        nome: user.nome,
        email: user.email,
        telefone,
      });
    }
  }, [user, profileForm]);

  // Mutação para atualizar perfil
  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormValues) => {
      return apiRequest('/api/users/profile', {
        method: 'PUT',
        data,
      });
    },
    onSuccess: () => {
      // Recarregar a página para atualizar os dados do usuário
      window.location.reload();
      toast({
        title: t('settings.profile_updated', 'Perfil atualizado'),
        description: t('settings.profile_updated_desc', 'Suas informações foram atualizadas com sucesso!'),
      });
    },
    onError: (error: any) => {
      const defaultMessage = t('settings.update_profile_error', 'Não foi possível atualizar seu perfil.');
      const mensagem = error?.response?.data?.message || error?.message || defaultMessage;
      setErroModal({ open: true, mensagem });
    },
  });

  // Mutação para alterar senha
  const changePasswordMutation = useMutation({
    mutationFn: (data: PasswordFormValues) => {
      return apiRequest('/api/users/password', {
        method: 'PUT',
        data: {
          senha_atual: data.senha_atual,
          nova_senha: data.nova_senha,
        },
      });
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({
        title: t('settings.password_changed', 'Senha alterada'),
        description: t('settings.password_changed_desc', 'Sua senha foi alterada com sucesso!'),
      });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Erro'),
        description: t('settings.password_change_error', 'Não foi possível alterar sua senha. Verifique se a senha atual está correta.'),
        variant: "destructive",
      });
    },
  });

  // Submeter formulário de perfil
  const onProfileSubmit = (data: ProfileFormValues) => {
    let telefone = data.telefone ? data.telefone.replace(/\D/g, "") : "";
    if (telefone && telefone.length >= 10 && telefone.length <= 11) {
      telefone = "55" + telefone;
    }
    console.log("[DEBUG] Telefone enviado ao backend:", telefone);
    updateProfileMutation.mutate({ ...data, telefone });
  };

  // Submeter formulário de senha
  const onPasswordSubmit = (data: PasswordFormValues) => {
    changePasswordMutation.mutate(data);
  };

  // Função para determinar qual formulário salvar
  const saveActiveForm = async () => {
    if (activeTab === "perfil" && profileForm.formState.isDirty) {
      return new Promise<void>((resolve, reject) => {
        profileForm.handleSubmit(
          (data) => {
            onProfileSubmit(data);
            resolve();
          },
          (errors) => {
            console.error('Erro de validação:', errors);
            reject(new Error('Erro de validação'));
          }
        )();
      });
    } else if (activeTab === "seguranca" && passwordForm.formState.isDirty) {
      return new Promise<void>((resolve, reject) => {
        passwordForm.handleSubmit(
          (data) => {
            onPasswordSubmit(data);
            resolve();
          },
          (errors) => {
            console.error('Erro de validação:', errors);
            reject(new Error('Erro de validação'));
          }
        )();
      });
    }
  };

  // Sistema de alerta para dados não salvos
  const {
    hasUnsavedChanges,
    showModal,
    handleTabChange,
    saveChanges,
    discardChanges,
    cancelTabChange,
  } = useUnsavedChanges({
    forms: [profileForm, passwordForm],
    onTabChange: (newTab, hasChanges) => {
      if (!hasChanges) {
        setActiveTab(newTab);
      }
    },
    onSaveCallback: saveActiveForm,
  });

  if (!user) {
    return (
      <div className="container py-10">
        <div className="text-center">
          <p>{t('settings.loading', 'Carregando configurações...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-6">{t('settings.title', 'Configurações')}</h1>
      
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="perfil">{t('settings.profile', 'Perfil')}</TabsTrigger>
          <TabsTrigger value="seguranca">{t('settings.security', 'Segurança')}</TabsTrigger>
          <TabsTrigger value="api">{t('settings.api', 'API')}</TabsTrigger>
          <TabsTrigger value="assinatura">{t('settings.subscription', 'Assinatura')}</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.personal_profile', 'Perfil Pessoal')}</CardTitle>
              <CardDescription>
                {t('settings.manage_personal_info', 'Gerencie suas informações pessoais.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form 
                  onSubmit={profileForm.handleSubmit(onProfileSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={profileForm.control}
                    name="nome"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.full_name', 'Nome completo')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('placeholders.full_name', 'Seu nome completo')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.email', 'E-mail')}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t('placeholders.email_example', 'seu@email.com')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="telefone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.phone', 'Telefone')}</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder={t('settings.phone_placeholder', '(11) 99999-9999')}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('settings.phone_description', 'Digite apenas os números com DDD')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending ? t('common.saving', 'Salvando...') : t('common.save_changes', 'Salvar alterações')}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguranca">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.password_change', 'Alteração de Senha')}</CardTitle>
              <CardDescription>
                {t('settings.change_password_desc', 'Altere sua senha de acesso.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form 
                  onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={passwordForm.control}
                    name="senha_atual"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.current_password', 'Senha atual')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder={t('settings.current_password_placeholder', 'Sua senha atual')} 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={passwordForm.control}
                    name="nova_senha"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.new_password', 'Nova senha')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder={t('settings.new_password_placeholder', 'Sua nova senha')} 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          {t('settings.password_min_length', 'Deve ter pelo menos 6 caracteres')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="confirmar_senha"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.confirm_new_password', 'Confirmar nova senha')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder={t('settings.confirm_password_placeholder', 'Confirme sua nova senha')} 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    disabled={changePasswordMutation.isPending}
                  >
                    {changePasswordMutation.isPending ? t('settings.changing', 'Alterando...') : t('settings.change_password', 'Alterar senha')}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.api_tokens', 'Tokens de API')}</CardTitle>
              <CardDescription>
                {t('settings.manage_api_tokens', 'Gerencie seus tokens para acesso à API.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApiTokensList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assinatura">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.subscription', 'Assinatura')}</CardTitle>
              <CardDescription>
                {t('settings.subscription_info', 'Informações sobre sua assinatura.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user?.status_assinatura === "ativa" && (
                <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                  <h4 className="font-medium mb-2 text-green-800 dark:text-green-200">{t('settings.subscription_active', 'Assinatura Ativa')}</h4>
                  <p className="text-sm text-green-600 dark:text-green-300 mb-2">
                    {t('settings.subscription_active_desc', 'Sua assinatura está ativa e em dia.')}
                  </p>
                  {user?.data_expiracao_assinatura && (
                    <p className="text-sm text-green-600 dark:text-green-300">
                  {t('settings.expires_on', 'Expira em')}: {formatLocalizedDate(user.data_expiracao_assinatura)}
                    </p>
                  )}
                </div>
              )}
              
              {user?.status_assinatura === "cancelada" && (
                <div className={`p-4 border rounded-lg ${
                  user?.data_expiracao_assinatura && new Date(user.data_expiracao_assinatura) > new Date()
                    ? "border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800"
                    : "border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-700"
                }`}>
                  <h4 className={`font-medium mb-2 ${
                    user?.data_expiracao_assinatura && new Date(user.data_expiracao_assinatura) > new Date()
                      ? "text-orange-800 dark:text-orange-200"
                      : "text-gray-800 dark:text-gray-200"
                  }`}>
                    {user?.data_expiracao_assinatura && new Date(user.data_expiracao_assinatura) > new Date()
                      ? t('settings.subscription_cancelled_access_maintained', 'Assinatura Cancelada - Acesso Mantido')
                      : t('settings.subscription_cancelled', 'Assinatura Cancelada')
                    }
                  </h4>
                  <p className={`text-sm mb-2 ${
                    user?.data_expiracao_assinatura && new Date(user.data_expiracao_assinatura) > new Date()
                      ? "text-orange-600 dark:text-orange-300"
                      : "text-gray-600 dark:text-gray-400"
                  }`}>
                    {t('settings.cancelled_on', 'Cancelada em')}: {formatLocalizedDate(user.data_cancelamento)}
                  </p>
                  {user?.data_expiracao_assinatura && new Date(user.data_expiracao_assinatura) > new Date() && (
                    <p className="text-sm text-orange-600 dark:text-orange-300 mb-2 font-medium">
                      {t('settings.access_until', 'Você ainda tem acesso até')}: {formatLocalizedDate(user.data_expiracao_assinatura)}
                    </p>
                  )}
                  {user.motivo_cancelamento && (
                    <p className={`text-sm ${
                      user?.data_expiracao_assinatura && new Date(user.data_expiracao_assinatura) > new Date()
                        ? "text-orange-600 dark:text-orange-300"
                        : "text-gray-600 dark:text-gray-400"
                    }`}>
                      {t('settings.reason', 'Motivo')}: {user.motivo_cancelamento}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de alertas para dados não salvos */}
      <UnsavedChangesModal 
        open={showModal}
        onSave={saveChanges}
        onDiscard={discardChanges}
        onCancel={cancelTabChange}
      />

      {/* Modal de erro existente */}
      <ModalAnimadaErro 
        open={erroModal.open}
        onClose={() => setErroModal({ open: false, mensagem: "" })}
        mensagem={erroModal.mensagem}
        titulo={t('common.error', 'Erro')}
        fecharLabel={t('common.close', 'Fechar')}
      />
    </div>
  );
}
