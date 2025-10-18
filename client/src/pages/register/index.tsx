import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { InsertUser } from "@shared/schema";
import { useTheme } from "next-themes";
import { useTranslation } from "@/contexts/LocalizationContext";

// Schema será criado dentro do componente para ter acesso ao t()

type RegisterFormValues = z.infer<typeof registerSchema>;

// Novo componente de input de telefone com +55 fixo (igual admin)
function PhoneInput({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: boolean }) {
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
        placeholder={placeholder || "(41) 9 8503-7379"}
        style={{ paddingLeft: 44 }}
        className={`admin-user-form-input${error ? ' border border-red-500' : ''}`}
        maxLength={16}
        autoComplete="off"
      />
    </div>
  );
}

export default function Register() {
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  // Schema de validação com localização
  const registerSchema = z.object({
    nome: z.string().min(2, t('validation.name_min_length', 'Nome deve ter pelo menos 2 caracteres')),
    email: z.string().email(t('validation.email_invalid', 'Email inválido')),
    senha: z.string().min(6, t('validation.password_min_length', 'A senha deve ter pelo menos 6 caracteres')),
    confirmarSenha: z.string().min(6, t('validation.confirm_password', 'Confirme sua senha')),
    telefone: z.string().min(12, t('validation.phone_required', 'Telefone obrigatório')),
    remoteJid: z.string(),
  }).refine((data) => data.senha === data.confirmarSenha, {
    message: t('validation.passwords_not_match', 'As senhas não coincidem'),
    path: ["confirmarSenha"],
  });
  
  type RegisterFormValues = z.infer<typeof registerSchema>;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLogoChecking, setIsLogoChecking] = useState(false);
  const [logoChecked, setLogoChecked] = useState(false);

  // Carregar logo baseado no tema atual
  useEffect(() => {
    if (!theme) return;
    setIsLogoChecking(true);
    setLogoChecked(false);
    const url = `/api/logo?theme=${theme}`;
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(res => {
        if (res.ok) {
          // Preload imagem
          const img = new window.Image();
          img.onload = () => {
            setLogoUrl(url);
            setIsLogoChecking(false);
            setLogoChecked(true);
          };
          img.onerror = () => {
            setLogoUrl(null);
            setIsLogoChecking(false);
            setLogoChecked(true);
          };
          img.src = url;
        } else {
          setLogoUrl(null);
          setIsLogoChecking(false);
          setLogoChecked(true);
        }
      })
      .catch(() => {
        setLogoUrl(null);
        setIsLogoChecking(false);
        setLogoChecked(true);
      });
  }, [theme]);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      nome: "",
      email: "",
      senha: "",
      confirmarSenha: "",
      telefone: "55",
      remoteJid: crypto.randomUUID(), // Generate a unique ID for remoteJid
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      setIsLoading(true);
      const { confirmarSenha, ...userData } = data;
      let telefone = userData.telefone ? userData.telefone.replace(/\D/g, "") : "";
      if (telefone && telefone.length >= 10 && telefone.length <= 11) {
        telefone = "55" + telefone;
      }
      await apiRequest("/api/auth/register", {
        method: "POST",
        data: { ...userData, telefone }
      });
      toast({
        title: t('register.success_title', 'Conta criada com sucesso'),
        description: t('register.success_description', 'Você já pode fazer login no sistema.'),
      });
      window.location.href = "/";
    } catch (error) {
      toast({
        title: t('register.error_title', 'Erro no cadastro'),
        description: t('register.error_description', 'Não foi possível criar sua conta. Tente novamente.'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-4">
            {isLogoChecking ? null : logoUrl ? (
              <div className="w-[230px] h-[60px] flex items-center justify-center">
                <img src={logoUrl} alt="Logo" className="object-contain w-[230px] h-[60px]" style={{ maxWidth: 230, maxHeight: 60, transition: 'opacity 0.2s' }} />
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon">
                  <i className="ri-line-chart-fill text-2xl text-white"></i>
                </div>
                <h1 className="text-3xl font-bold font-space mt-3">Finance<span className="text-secondary">Hub</span></h1>
              </>
            )}
          </div>
          {!logoUrl && logoChecked && (
            <p className="text-gray-400 mt-2">{t('register.tagline', 'Seu controle financeiro pessoal')}</p>
          )}
        </div>

        <Card className="glass-card neon-border">
          <CardHeader>
            <CardTitle>{t('register.title', 'Criar Conta')}</CardTitle>
            <CardDescription>
              {t('register.description', 'Preencha os dados abaixo para criar sua conta')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.name', 'Nome')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('placeholders.full_name', 'Seu nome completo')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.email', 'Email')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('placeholders.email_example', 'email@exemplo.com')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="senha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.password', 'Senha')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t('register.password_placeholder', '******')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmarSenha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('register.confirm_password', 'Confirmar Senha')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t('register.confirm_password_placeholder', '******')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.phone', 'Telefone')}</FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value || ""}
                          onChange={val => field.onChange(val)}
                          placeholder={t('register.phone_placeholder', '(41) 9 8503-7379')}
                          error={!!form.formState.errors.telefone}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t('register.creating', 'Criando conta...') : t('register.create_button', 'Criar conta')}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-gray-400">
              {t('register.have_account', 'Já tem uma conta?')}{" "}
              <Button variant="link" className="p-0" onClick={() => navigate("/")}>
                {t('register.login_link', 'Fazer login')}
              </Button>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
