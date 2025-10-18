import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Edit, Plus, UserPlus, Shield, User as UserIcon, RotateCcw, CheckCircle, Users, UserX, AlertTriangle, UserCog, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "next-themes";
import { useLocalization, useTranslation } from "@/contexts/LocalizationContext";

interface UserWithStats extends User {
  transactionCount: number;
  walletBalance: number;
  lastAccess: string | null;
}

interface CreateUserForm {
  nome: string;
  email: string;
  senha: string;
  tipo_usuario: "usuario" | "admin" | "super_admin";
  telefone?: string;
}

interface UpdateUserForm {
  nome: string;
  email: string;
  ativo: boolean;
  tipo_usuario: "usuario" | "admin" | "super_admin";
  nova_senha?: string;
  data_expiracao_assinatura?: string;
  telefone?: string;
}

// Novo componente de input de telefone com +55 fixo
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

export default function AdminUsers() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { locale } = useLocalization();
  const normalizedLocale = locale
    ? locale.replace(/([a-z]{2})-([a-z]{2})/, (_, lang, region) => `${lang}-${region.toUpperCase()}`)
    : "pt-BR";
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [resetResult, setResetResult] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);
  
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    nome: "",
    email: "",
    senha: "",
    tipo_usuario: "usuario",
    telefone: ""
  });

  const [editForm, setEditForm] = useState<UpdateUserForm>({
    nome: "",
    email: "",
    ativo: true,
    tipo_usuario: "usuario",
    nova_senha: "",
    data_expiracao_assinatura: "",
    telefone: ""
  });

  // Adicionar estado para erro de telefone na edição
  const [editPhoneError, setEditPhoneError] = useState("");

  // Estado para modal de erro
  const [errorModal, setErrorModal] = useState({ isOpen: false, message: "" });
  const [fieldErrors, setFieldErrors] = useState<{ telefone?: string; email?: string }>({});

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Buscar usuários
  const { data: users = [], isLoading } = useQuery<UserWithStats[]>({
    queryKey: ['/api/admin/users'],
    refetchInterval: 10000
  });

  // Filtrar usuários por termo de busca
  const filteredUsers = users.filter(user =>
    user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Mutation para criar usuário
  const createUserMutation = useMutation({
    mutationFn: (userData: CreateUserForm) => 
      apiRequest("/api/admin/users", { method: "POST", data: userData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsCreateModalOpen(false);
      setCreateForm({ nome: "", email: "", senha: "", tipo_usuario: "usuario", telefone: "" });
      toast({
        title: t("admin.users.toast.create_success.title", "Sucesso"),
        description: t("admin.users.toast.create_success.description", "Usuário criado com sucesso"),
      });
    },
    onError: (error: any) => {
      let fieldErrs: { telefone?: string; email?: string } = {};
      let msg = error.message || t("admin.users.toast.create_error.fallback", "Erro ao criar usuário");
      if (msg.toLowerCase().includes("telefone")) {
        fieldErrs.telefone = msg;
      }
      if (msg.toLowerCase().includes("email")) {
        fieldErrs.email = msg;
      }
      setFieldErrors(fieldErrs);
      setErrorModal({
        isOpen: true,
        message: msg,
      });
    },
  });

  // Mutation para atualizar usuário
  const updateUserMutation = useMutation({
    mutationFn: ({ id, userData }: { id: number; userData: UpdateUserForm }) =>
      apiRequest(`/api/admin/users/${id}`, { method: "PUT", data: userData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsEditModalOpen(false);
      setSelectedUser(null);
      toast({
        title: t("admin.users.toast.update_success.title", "Sucesso"),
        description: t("admin.users.toast.update_success.description", "Usuário atualizado com sucesso"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("admin.users.toast.update_error.title", "Erro"),
        description: error.message || t("admin.users.toast.update_error.description", "Erro ao atualizar usuário"),
        variant: "destructive",
      });
    },
  });

  // Mutation para deletar usuário
  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: t("admin.users.toast.delete_success.title", "Sucesso"),
        description: t("admin.users.toast.delete_success.description", "Usuário desativado com sucesso"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("admin.users.toast.delete_error.title", "Erro"),
        description: error.message || t("admin.users.toast.delete_error.description", "Erro ao desativar usuário"),
        variant: "destructive",
      });
    },
  });

  // Mutation para ativar/desativar usuário com UI otimista
  const toggleUserStatusMutation = useMutation({
    mutationFn: ({ id, ativo, nome }: { id: number; ativo: boolean; nome: string }) =>
      apiRequest(`/api/admin/users/${id}`, { method: "PUT", data: { ativo } }),
    onMutate: async ({ id, ativo }) => {
      // Marcar usuário como sendo alterado
      setTogglingUserId(id);
      
      // Cancelar queries em andamento
      await queryClient.cancelQueries({ queryKey: ['/api/admin/users'] });
      
      // Snapshot do estado anterior
      const previousUsers = queryClient.getQueryData(['/api/admin/users']);
      
      // Atualização otimista
      queryClient.setQueryData(['/api/admin/users'], (old: any[]) => {
        if (!old) return old;
        return old.map(user => 
          user.id === id ? { ...user, ativo } : user
        );
      });
      
      return { previousUsers };
    },
    onSuccess: (data, variables) => {
      // Limpar estado de carregamento
      setTogglingUserId(null);
      
      // Revalidar para garantir sincronização
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: t("admin.users.toast.toggle_success.title", "Status Atualizado"),
        description: t(
          "admin.users.toast.toggle_success.description",
          "Usuário {{userName}} foi {{status}} com sucesso"
        )
          .replace("{{userName}}", variables.nome)
          .replace("{{status}}", variables.ativo ? t("admin.users.status.active", "ativado") : t("admin.users.status.inactive", "desativado")),
      });
    },
    onError: (error: any, variables, context) => {
      // Limpar estado de carregamento
      setTogglingUserId(null);
      
      // Reverter para o estado anterior em caso de erro
      if (context?.previousUsers) {
        queryClient.setQueryData(['/api/admin/users'], context.previousUsers);
      }
      toast({
        title: t("admin.users.toast.toggle_error.title", "Erro"),
        description: t(
          "admin.users.toast.toggle_error.description",
          "Erro ao {{action}} usuário {{userName}}"
        )
          .replace("{{action}}", variables.ativo ? t("admin.users.status.activate", "ativar") : t("admin.users.status.deactivate", "desativar"))
          .replace("{{userName}}", variables.nome),
        variant: "destructive",
      });
    },
  });

  // Mutation para resetar dados do usuário
  const resetUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest(`/api/admin/users/${userId}/reset`, {
        method: "POST"
      });
    },
    onSuccess: (data, userId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsResetModalOpen(false);
      setResetResult(data);
      setIsSuccessModalOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: t("admin.users.toast.reset_error.title", "Erro"),
        description: error.message || t("admin.users.toast.reset_error.description", "Erro ao resetar dados do usuário"),
        variant: "destructive",
      });
    },
  });

  const handleCreateUser = () => {
    // Validação antes de enviar
    if (createForm.telefone && createForm.telefone.length > 0 && (createForm.telefone.length < 10 || createForm.telefone.length > 11)) {
      setPhoneError(t("admin.users.validation.phone_length", "Telefone deve ter 10 ou 11 dígitos"));
      return;
    }
    // Garantir que o telefone enviado seja só números e comece com 55
    let telefoneLimpo = createForm.telefone ? createForm.telefone.replace(/\D/g, "") : undefined;
    if (telefoneLimpo && telefoneLimpo.length >= 10 && telefoneLimpo.length <= 11) {
      telefoneLimpo = "55" + telefoneLimpo;
    }
    createUserMutation.mutate({ ...createForm, telefone: telefoneLimpo });
  };

  const handleEditUser = (user: UserWithStats) => {
    setSelectedUser(user);
    let telefoneSemDDI = user.telefone || "";
    if (telefoneSemDDI.startsWith("55")) {
      telefoneSemDDI = telefoneSemDDI.slice(2);
    }
    setEditForm({
      nome: user.nome,
      email: user.email,
      ativo: user.ativo,
      tipo_usuario: user.tipo_usuario as "usuario" | "admin" | "super_admin",
      nova_senha: "",
      data_expiracao_assinatura: user.data_expiracao_assinatura 
        ? new Date(user.data_expiracao_assinatura).toISOString().split('T')[0] 
        : "",
      telefone: telefoneSemDDI
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = () => {
    if (!selectedUser) return;
    if (editForm.telefone && editForm.telefone.length > 0 && (editForm.telefone.length < 10 || editForm.telefone.length > 11)) {
      setEditPhoneError(t("admin.users.validation.phone_length", "Telefone deve ter 10 ou 11 dígitos"));
      return;
    }
    let telefoneLimpo = editForm.telefone ? editForm.telefone.replace(/\D/g, "") : undefined;
    if (telefoneLimpo && !telefoneLimpo.startsWith("55")) {
      telefoneLimpo = "55" + telefoneLimpo;
    }
    updateUserMutation.mutate({
      id: selectedUser.id,
      userData: { ...editForm, telefone: telefoneLimpo }
    });
  };

  const handleDeleteUser = (id: number) => {
    if (confirm(t("admin.users.confirm.deactivate", "Tem certeza que deseja desativar este usuário?"))) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleToggleStatus = (user: UserWithStats) => {
    toggleUserStatusMutation.mutate({
      id: user.id,
      ativo: !user.ativo,
      nome: user.nome
    });
  };

  const handleResetUser = (user: UserWithStats) => {
    setSelectedUser(user);
    setIsResetModalOpen(true);
  };

  const confirmResetUser = () => {
    if (selectedUser) {
      resetUserMutation.mutate(selectedUser.id);
    }
  };

  const closeSuccessModal = () => {
    setIsSuccessModalOpen(false);
    setSelectedUser(null);
    setResetResult(null);
  };

  const handleImpersonate = async (userId: number, userName: string) => {
    try {
      setSelectedAction(`impersonate-${userId}`);
      
      toast({
        title: t("admin.users.toast.impersonate_start.title", "Processando"),
        description: t(
          "admin.users.toast.impersonate_start.description",
          "Iniciando personificação do usuário {{userName}}..."
        ).replace("{{userName}}", userName),
      });
      
      const response = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetUserId: userId })
      });

      if (response.ok) {
        toast({
          title: t("admin.users.toast.impersonate_success.title", "Sucesso!"),
          description: t(
            "admin.users.toast.impersonate_success.description",
            "Personificação do usuário {{userName}} realizada com sucesso. Redirecionando..."
          ).replace("{{userName}}", userName),
        });
        
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
      } else {
        const error = await response.json();
        toast({
          title: t("admin.users.toast.impersonate_error.title", "Erro na Personificação"),
          description: error.error || t("admin.users.toast.impersonate_error.description", "Não foi possível personificar o usuário."),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t("admin.users.toast.impersonate_unexpected.title", "Erro Inesperado"),
        description: t("admin.users.toast.impersonate_unexpected.description", "Ocorreu um erro de conexão. Tente novamente."),
        variant: "destructive",
      });
    } finally {
      setSelectedAction(null);
    }
  };

  const getTipoUsuarioBadge = (tipo: string) => {
    switch (tipo) {
      case "super_admin":
        return (
          <Badge variant="destructive" className="gap-1">
            <Shield className="h-3 w-3" />
            {t("admin.users.badges.super_admin", "Super Admin")}
          </Badge>
        );
      case "admin":
        return (
          <Badge variant="secondary" className="gap-1">
            <UserIcon className="h-3 w-3" />
            {t("admin.users.badges.admin", "Admin")}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <UserIcon className="h-3 w-3" />
            {t("admin.users.badges.user", "Usuário")}
          </Badge>
        );
    }
  };

  const getStatusBadge = (user: UserWithStats) => {
    if (user.status_assinatura === 'cancelada' || user.data_cancelamento) {
      return (
        <Badge className={`${theme === 'light' ? 'bg-red-500 text-white' : 'bg-red-600'} `}>
          {t("admin.users.badges.cancelled", "Cancelado")}
        </Badge>
      );
    }
    if (!user.ativo) {
      return (
        <Badge className={`${theme === 'light' ? 'bg-yellow-400 text-gray-900' : ''}`} variant={theme === 'light' ? undefined : 'destructive'}>
          {t("admin.users.badges.inactive", "Inativo")}
        </Badge>
      );
    }
    if (user.tipo_usuario === "super_admin") {
      return (
        <Badge className={`${theme === 'light' ? 'bg-purple-500 text-white' : 'bg-purple-600'}`}>
          {t("admin.users.badges.super_admin", "Super Admin")}
        </Badge>
      );
    }
    return (
      <Badge className={`${theme === 'light' ? 'bg-emerald-400 text-white' : ''}`} variant={theme === 'light' ? undefined : 'default'}>
        {t("admin.users.badges.active", "Ativo")}
      </Badge>
    );
  };

  const formatLastAccess = (date: string | Date | null) => {
    if (!date) return t("admin.users.last_access.never", "Nunca");
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(normalizedLocale);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(normalizedLocale, {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getWalletBalanceBadge = (balance: number) => {
    if (balance > 0) {
      return <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white text-xs">{formatCurrency(balance)}</Badge>;
    } else if (balance < 0) {
      return <Badge variant="destructive" className="bg-red-600 hover:bg-red-700 text-white text-xs">{formatCurrency(balance)}</Badge>;
    } else {
      return <Badge variant="secondary" className="bg-gray-600 hover:bg-gray-700 text-white text-xs">{formatCurrency(balance)}</Badge>;
    }
  };

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

  const [phoneError, setPhoneError] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-3xl font-bold mb-2 flex items-center gap-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
            <UserCog className="h-8 w-8 text-purple-500" />
            {t("admin.users.header.title", "Gerenciar Usuários")}
          </h1>
          <p className={`${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
            {t("admin.users.header.subtitle", "Controle completo sobre os usuários do sistema")}
          </p>
        </div>
        
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-2 neon-border"
        >
          <Plus className="h-4 w-4" />
          {t("admin.users.actions.new_user", "Novo Usuário")}
        </Button>
        
        {/* Modal Novo Usuário com CSS Exclusivo */}
        {isCreateModalOpen && (
          <div className="admin-user-modal-overlay">
            <div className="admin-user-modal-container">
              <div className="admin-user-modal-header">
                <div className="admin-user-modal-title">
                  <UserPlus className="admin-user-modal-icon" />
                  <span>{t("admin.users.create_modal.title", "Novo Usuário")}</span>
                </div>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="admin-user-modal-close"
                >
                  ×
                </button>
              </div>
              
              <div className="admin-user-modal-content">
                <div className="admin-user-form-group">
                  <label className="admin-user-form-label">
                    {t("admin.users.create_modal.fields.full_name.label", "Nome Completo")}
                  </label>
                  <input
                    type="text"
                    value={createForm.nome}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, nome: e.target.value }))}
                    placeholder={t("admin.users.create_modal.fields.full_name.placeholder", "Digite o nome completo")}
                    className="admin-user-form-input"
                  />
                </div>
                
                <div className="admin-user-form-group">
                  <label className="admin-user-form-label">
                    {t("admin.users.create_modal.fields.email.label", "Email")}
                  </label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => {
                      setCreateForm(prev => ({ ...prev, email: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder={t("admin.users.create_modal.fields.email.placeholder", "usuario@exemplo.com")}
                    className={`admin-user-form-input${fieldErrors.email ? ' border border-red-500' : ''}`}
                  />
                  {fieldErrors.email && <div style={{ color: 'red', fontSize: 12 }}>{fieldErrors.email}</div>}
                </div>
                
                <div className="admin-user-form-group">
                  <label className="admin-user-form-label">
                    {t("admin.users.create_modal.fields.password.label", "Senha")}
                  </label>
                  <input
                    type="password"
                    value={createForm.senha}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, senha: e.target.value }))}
                    placeholder={t("admin.users.create_modal.fields.password.placeholder", "Senha segura (mín. 8 caracteres)")}
                    className="admin-user-form-input"
                  />
                </div>
                
                <div className="admin-user-form-group">
                  <label className="admin-user-form-label">
                    {t("admin.users.create_modal.fields.role.label", "Tipo de Usuário")}
                  </label>
                  <select 
                    value={createForm.tipo_usuario}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, tipo_usuario: e.target.value as "usuario" | "admin" | "super_admin" }))}
                    className="admin-user-form-select"
                  >
                    <option value="usuario">{t("admin.users.roles.user", "Usuário Padrão")}</option>
                    <option value="admin">{t("admin.users.roles.admin", "Administrador")}</option>
                    <option value="super_admin">{t("admin.users.roles.super_admin", "Super Administrador")}</option>
                  </select>
                </div>
                
                <div className="admin-user-form-group">
                  <label className="admin-user-form-label">
                    {t("admin.users.create_modal.fields.phone.label", "Telefone")}
                  </label>
                  <PhoneInput
                    value={createForm.telefone || ""}
                    onChange={val => {
                      setCreateForm(prev => ({ ...prev, telefone: val }));
                      if (val.length > 0 && (val.length < 10 || val.length > 11)) {
                        setPhoneError(t("admin.users.validation.phone_detailed", "Telefone deve ter DDD e número válido (10 ou 11 dígitos)"));
                      } else {
                        setPhoneError("");
                      }
                      setFieldErrors((prev) => ({ ...prev, telefone: undefined }));
                    }}
                    placeholder={t("admin.users.create_modal.fields.phone.placeholder", "(41) 9 8503-7379")}
                    error={!!(phoneError || fieldErrors.telefone)}
                  />
                  {(phoneError || fieldErrors.telefone) && <div style={{ color: 'red', fontSize: 12 }}>{phoneError || fieldErrors.telefone}</div>}
                </div>
                
                <div className="admin-user-modal-actions">
                  <button 
                    onClick={() => setIsCreateModalOpen(false)}
                    className="admin-user-btn-secondary"
                  >
                    {t("common.cancel", "Cancelar")}
                  </button>
                  <button 
                    onClick={handleCreateUser}
                    disabled={createUserMutation.isPending}
                    className="admin-user-btn-primary"
                  >
                    {createUserMutation.isPending
                      ? t("admin.users.create_modal.actions.creating", "Criando...")
                      : t("admin.users.create_modal.actions.submit", "Criar Usuário")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filtro de busca */}
      <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}> 
        <CardHeader>
          <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
            {t("admin.users.search.title", "Buscar Usuários")}
          </CardTitle>
          <Input
            placeholder={t("admin.users.search.placeholder", "Buscar por nome ou email...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`max-w-sm ${theme === 'light' ? 'bg-white border-gray-300 text-gray-900 placeholder-gray-400' : 'bg-gray-800 border-gray-700 text-white'}`}
          />
        </CardHeader>
      </Card>

      {/* Sistema de Abas para Usuários */}
      <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}> 
            <Users className="h-5 w-5" />
            {t("admin.users.tabs.title", "Lista de Usuários")}
          </CardTitle>
          <CardDescription className="text-gray-400">
            {t("admin.users.tabs.description", "Visualize e gerencie usuários por categoria")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="active" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t("admin.users.tabs.active", "Usuários Ativos")}
              </TabsTrigger>
              <TabsTrigger value="canceled" className="flex items-center gap-2">
                <UserX className="h-4 w-4" />
                {t("admin.users.tabs.cancelled", "Cancelados")}
              </TabsTrigger>
              <TabsTrigger value="inactive" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t("admin.users.tabs.inactive", "Inativos")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div>
                          <Skeleton className="h-4 w-32 mb-2" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.filter(user => 
                    user.ativo === true && 
                    user.status_assinatura !== 'cancelada' && 
                    !user.data_cancelamento
                  ).map((user) => (
                    <div key={user.id} className={`flex items-center justify-between p-4 border rounded-lg glass transition-all duration-300 ${theme === 'light' ? 'bg-white border-gray-200' : 'border-gray-700'} ${togglingUserId === user.id ? 'opacity-50 bg-blue-900/20 border-blue-500' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                          {user.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className={`font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{user.nome}</h3>
                            {getStatusBadge(user)}
                            {getTipoUsuarioBadge(user.tipo_usuario)}
                            {getWalletBalanceBadge(user.walletBalance || 0)}
                          </div>
                          <p className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                            {user.email} • {user.transactionCount} {t("admin.users.list.transaction_count_suffix", "transações")}
                          </p>
                          <p className={`text-xs ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>
                            {t("admin.users.list.registered_label", "Cadastro")}: {user.data_cadastro ? new Date(user.data_cadastro).toLocaleDateString(normalizedLocale) : t("admin.users.list.not_available", "N/A")} • {t("admin.users.list.last_access_label", "Último acesso")}: {formatLastAccess(user.lastAccess)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.ativo}
                            onCheckedChange={() => handleToggleStatus(user)}
                            disabled={togglingUserId === user.id || toggleUserStatusMutation.isPending}
                            title={
                              user.ativo
                                ? t("admin.users.actions.deactivate_user", "Desativar usuário")
                                : t("admin.users.actions.activate_user", "Ativar usuário")
                            }
                          />
                          {togglingUserId === user.id && (
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </div>
                        {user.tipo_usuario !== 'super_admin' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleImpersonate(user.id, user.nome)}
                            disabled={selectedAction === `impersonate-${user.id}`}
                            className="text-blue-600 hover:text-blue-700 neon-border"
                            title={t("admin.users.actions.impersonate_user", "Personificar usuário")}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          className="neon-border"
                          title={t("admin.users.actions.edit_user", "Editar usuário")}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetUser(user)}
                          disabled={resetUserMutation.isPending}
                          className="text-orange-600 hover:text-orange-700 neon-border"
                          title={t("admin.users.actions.reset_user", "Resetar dados do usuário")}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={deleteUserMutation.isPending}
                          className="neon-border"
                          title={t("admin.users.actions.deactivate_user", "Desativar usuário")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="canceled">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div>
                          <Skeleton className="h-4 w-32 mb-2" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.filter(user => 
                    user.status_assinatura === 'cancelada' || 
                    user.data_cancelamento !== null
                  ).map((user) => (
                    <div key={user.id} className={`flex items-center justify-between p-4 border rounded-lg glass transition-all duration-300 ${theme === 'light' ? 'bg-red-50 border-red-200' : 'border-red-700 bg-red-900/10'} ${togglingUserId === user.id ? 'opacity-50 bg-blue-900/20 border-blue-500' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-red-500 to-orange-600 flex items-center justify-center text-white font-semibold">
                          {user.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-white">{user.nome}</h3>
                            {getStatusBadge(user)}
                            {getTipoUsuarioBadge(user.tipo_usuario)}
                            {getWalletBalanceBadge(user.walletBalance || 0)}
                          </div>
                          <p className="text-sm text-gray-400">
                            {user.email} • {user.transactionCount} {t("admin.users.list.transaction_count_suffix", "transações")}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t("admin.users.list.registered_label", "Cadastro")}: {user.data_cadastro ? new Date(user.data_cadastro).toLocaleDateString(normalizedLocale) : t("admin.users.list.not_available", "N/A")}
                          </p>
                          <div className="text-xs text-red-400 mt-1">
                            <div>
                              {t("admin.users.list.cancelled_at", "Cancelado em")}: {user.data_cancelamento ? new Date(user.data_cancelamento).toLocaleDateString(normalizedLocale) : t("admin.users.list.not_available", "N/A")}
                            </div>
                            {user.motivo_cancelamento && (
                              <div>{t("admin.users.list.cancel_reason", "Motivo")}: {user.motivo_cancelamento}</div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.ativo}
                            onCheckedChange={() => handleToggleStatus(user)}
                            disabled={togglingUserId === user.id || toggleUserStatusMutation.isPending}
                            title={
                              user.ativo
                                ? t("admin.users.actions.deactivate_user", "Desativar usuário")
                                : t("admin.users.actions.activate_user", "Ativar usuário")
                            }
                          />
                          {togglingUserId === user.id && (
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </div>
                        <UserX className="h-5 w-5 text-red-400" />
                        {user.tipo_usuario !== 'super_admin' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleImpersonate(user.id, user.nome)}
                            disabled={selectedAction === `impersonate-${user.id}`}
                            className="text-blue-600 hover:text-blue-700 neon-border"
                            title={t("admin.users.actions.impersonate_user", "Personificar usuário")}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          className="neon-border"
                          title={t("admin.users.actions.edit_user", "Editar usuário")}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetUser(user)}
                          disabled={resetUserMutation.isPending}
                          className="text-orange-600 hover:text-orange-700 neon-border"
                          title={t("admin.users.actions.reset_user", "Resetar dados do usuário")}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )) || (
                    <div className="text-center py-8 text-gray-400">
                      {t("admin.users.empty_states.cancelled", "Nenhum usuário cancelado encontrado")}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="inactive">
              {isLoading ? (
                <div className="space-y-4">
                  {[1].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div>
                          <Skeleton className="h-4 w-32 mb-2" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.filter(user => 
                    user.ativo === false && 
                    user.status_assinatura !== 'cancelada' && 
                    !user.data_cancelamento
                  ).map((user) => (
                    <div key={user.id} className={`flex items-center justify-between p-4 border rounded-lg glass transition-all duration-300 ${theme === 'light' ? 'bg-yellow-50 border-yellow-200' : 'border-yellow-700 bg-yellow-900/10'} ${togglingUserId === user.id ? 'opacity-50 bg-blue-900/20 border-blue-500' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-yellow-500 to-orange-600 flex items-center justify-center text-white font-semibold">
                          {user.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-white">{user.nome}</h3>
                            {getStatusBadge(user)}
                            {getTipoUsuarioBadge(user.tipo_usuario)}
                            {getWalletBalanceBadge(user.walletBalance || 0)}
                          </div>
                          <p className="text-sm text-gray-400">
                            {user.email} • {user.transactionCount} {t("admin.users.list.transaction_count_suffix", "transações")}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t("admin.users.list.registered_label", "Cadastro")}: {user.data_cadastro ? new Date(user.data_cadastro).toLocaleDateString(normalizedLocale) : t("admin.users.list.not_available", "N/A")} • {t("admin.users.list.last_access_label", "Último acesso")}: {formatLastAccess(user.lastAccess)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Botão de exclusão definitiva, só para não super_admin */}
                        {user.tipo_usuario !== 'super_admin' && (
                          <Button
                            variant="destructive"
                            size="icon"
                            className={`${theme === 'light' ? 'bg-red-500 hover:bg-red-600' : 'bg-transparent hover:bg-red-900'}`}
                            title={t("admin.users.actions.delete_user", "Excluir usuário permanentemente")}
                            onClick={() => setSelectedUser(user)}
                          >
                            <Trash2 className={`h-5 w-5 ${theme === 'light' ? 'text-white' : 'text-red-500'}`} />
                          </Button>
                        )}
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.ativo}
                            onCheckedChange={() => handleToggleStatus(user)}
                            disabled={togglingUserId === user.id || toggleUserStatusMutation.isPending}
                            title={
                              user.ativo
                                ? t("admin.users.actions.deactivate_user", "Desativar usuário")
                                : t("admin.users.actions.activate_user", "Ativar usuário")
                            }
                          />
                          {togglingUserId === user.id && (
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </div>
                        <AlertTriangle className="h-5 w-5 text-yellow-400" />
                        {user.tipo_usuario !== 'super_admin' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleImpersonate(user.id, user.nome)}
                            disabled={selectedAction === `impersonate-${user.id}`}
                            className="text-blue-600 hover:text-blue-700 neon-border"
                            title={t("admin.users.actions.impersonate_user", "Personificar usuário")}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          className="neon-border"
                          title={t("admin.users.actions.edit_user", "Editar usuário")}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetUser(user)}
                          disabled={resetUserMutation.isPending}
                          className="text-orange-600 hover:text-orange-700 neon-border"
                          title={t("admin.users.actions.reset_user", "Resetar dados do usuário")}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )) || (
                    <div className="text-center py-8 text-gray-400">
                      {t("admin.users.empty_states.inactive", "Nenhum usuário inativo encontrado")}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Modal de Edição com CSS Exclusivo */}
      {isEditModalOpen && (
        <div className="admin-edit-modal-overlay">
          <div className="admin-edit-modal-container">
      <div className="admin-edit-modal-header">
        <div className="admin-edit-modal-title">
          <Edit className="admin-edit-modal-icon" />
          <span>{t("admin.users.edit_modal.title", "Editar Usuário")}</span>
        </div>
        <button 
          onClick={() => setIsEditModalOpen(false)}
          className="admin-edit-modal-close"
        >
                ×
              </button>
            </div>
            
      <div className="admin-edit-modal-content">
        <div className="admin-edit-form-group">
          <label className="admin-edit-form-label">
            {t("admin.users.edit_modal.fields.full_name.label", "Nome Completo")}
          </label>
          <input
            type="text"
            value={editForm.nome}
            onChange={(e) => setEditForm(prev => ({ ...prev, nome: e.target.value }))}
            placeholder={t("admin.users.edit_modal.fields.full_name.placeholder", "Digite o nome completo")}
            className="admin-edit-form-input"
          />
        </div>
        
        <div className="admin-edit-form-group">
          <label className="admin-edit-form-label">
            {t("admin.users.edit_modal.fields.email.label", "Email")}
          </label>
          <input
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
            placeholder={t("admin.users.edit_modal.fields.email.placeholder", "usuario@exemplo.com")}
            className="admin-edit-form-input"
          />
        </div>
        
        <div className="admin-edit-form-group">
          <label className="admin-edit-form-label">
            {t("admin.users.edit_modal.fields.role.label", "Tipo de Usuário")}
          </label>
          <select 
            value={editForm.tipo_usuario}
            onChange={(e) => setEditForm(prev => ({ ...prev, tipo_usuario: e.target.value as "usuario" | "admin" | "super_admin" }))}
            className="admin-edit-form-select"
          >
            <option value="usuario">{t("admin.users.roles.user", "Usuário Padrão")}</option>
            <option value="admin">{t("admin.users.roles.admin", "Administrador")}</option>
            <option value="super_admin">{t("admin.users.roles.super_admin", "Super Administrador")}</option>
          </select>
        </div>
        
        <div className="admin-edit-form-group">
          <div className="admin-edit-switch-container">
            <Switch
              checked={editForm.ativo}
              onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, ativo: checked }))}
              className="admin-edit-switch"
            />
            <label className="admin-edit-form-label">
              {t("admin.users.edit_modal.fields.active.label", "Usuário Ativo")}
            </label>
          </div>
        </div>

        <div className="admin-edit-form-group">
          <label className="admin-edit-form-label">
            {t("admin.users.edit_modal.fields.password.label", "Nova Senha (deixe em branco para não alterar)")}
          </label>
          <input
            type="password"
            value={editForm.nova_senha}
            onChange={(e) => setEditForm(prev => ({ ...prev, nova_senha: e.target.value }))}
            placeholder={t("admin.users.edit_modal.fields.password.placeholder", "Digite a nova senha")}
            className="admin-edit-form-input"
          />
        </div>

        <div className="admin-edit-form-group">
          <label className="admin-edit-form-label">
            {t("admin.users.edit_modal.fields.subscription_expiration.label", "Data de Expiração da Assinatura")}
          </label>
          <input
            type="date"
            value={editForm.data_expiracao_assinatura}
            onChange={(e) => setEditForm(prev => ({ ...prev, data_expiracao_assinatura: e.target.value }))}
            className="admin-edit-form-input"
          />
          <div className="text-xs text-gray-400 mt-1">
            {t("admin.users.edit_modal.fields.subscription_expiration.hint", "Deixe em branco para assinatura ilimitada")}
          </div>
        </div>
        
        <div className="admin-edit-form-group">
          <label className="admin-edit-form-label">
            {t("admin.users.edit_modal.fields.phone.label", "Telefone")}
          </label>
          <PhoneInput
            value={editForm.telefone || ""}
            onChange={val => {
              setEditForm(prev => ({ ...prev, telefone: val }));
              if (val.length > 0 && (val.length < 10 || val.length > 11)) {
                setEditPhoneError(t("admin.users.validation.phone_detailed", "Telefone deve ter DDD e número válido (10 ou 11 dígitos)"));
              } else {
                setEditPhoneError("");
              }
            }}
            placeholder={t("admin.users.edit_modal.fields.phone.placeholder", "(41) 9 8503-7379")}
            error={!!editPhoneError}
          />
          {editPhoneError && <div style={{ color: 'red', fontSize: 12 }}>{editPhoneError}</div>}
        </div>
        
        <div className="admin-edit-modal-actions">
          <button 
            onClick={() => setIsEditModalOpen(false)}
            className="admin-edit-btn-secondary"
          >
            {t("common.cancel", "Cancelar")}
          </button>
          <button 
            onClick={handleUpdateUser}
            disabled={updateUserMutation.isPending}
            className="admin-edit-btn-primary"
          >
            {updateUserMutation.isPending
              ? t("admin.users.edit_modal.actions.saving", "Atualizando...")
              : t("admin.users.edit_modal.actions.submit", "Atualizar Usuário")}
          </button>
        </div>
      </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Reset */}
      <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <RotateCcw className="h-5 w-5" />
              {t("admin.users.reset_modal.title", "Resetar Dados do Usuário")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                <strong>{t("admin.users.reset_modal.warning.attention", "Atenção")}:</strong> {t("admin.users.reset_modal.warning.intro", "Esta ação irá remover permanentemente:")}
              </p>
              <ul className="mt-2 text-sm text-orange-700 dark:text-orange-300 list-disc list-inside space-y-1">
                <li>{t("admin.users.reset_modal.warning.items.transactions", "Todas as transações")}</li>
                <li>{t("admin.users.reset_modal.warning.items.reminders", "Todos os lembretes")}</li>
                <li>{t("admin.users.reset_modal.warning.items.categories", "Todas as categorias personalizadas")}</li>
                <li>{t("admin.users.reset_modal.warning.items.tokens", "Tokens de API extras (mantém apenas 1)")}</li>
                <li>{t("admin.users.reset_modal.warning.items.wallet", "Reseta o saldo da carteira para R$ 0,00")}</li>
              </ul>
              <p className="mt-2 text-sm text-orange-800 dark:text-orange-200">
                <strong>{t("admin.users.reset_modal.warning.keep_title", "Será mantido")}:</strong> {t("admin.users.reset_modal.warning.keep_description", "Usuário, senha e dados básicos da conta.")}
              </p>
            </div>
            
            {selectedUser && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm">
                  <strong>{t("admin.users.reset_modal.user_label", "Usuário")}:</strong> {selectedUser.nome}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>{t("admin.users.reset_modal.email_label", "Email")}:</strong> {selectedUser.email}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>{t("admin.users.reset_modal.transactions_label", "Transações atuais")}:</strong> {selectedUser.transactionCount}
                </p>
              </div>
            )}

            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("admin.users.reset_modal.confirm_question", "Tem certeza que deseja resetar todos os dados deste usuário? Esta ação não pode ser desfeita.")}
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsResetModalOpen(false)}
              disabled={resetUserMutation.isPending}
            >
              {t("common.cancel", "Cancelar")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmResetUser}
              disabled={resetUserMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {resetUserMutation.isPending
                ? t("admin.users.reset_modal.actions.confirming", "Resetando...")
                : t("admin.users.reset_modal.actions.confirm", "Confirmar Reset")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Sucesso do Reset */}
      <Dialog open={isSuccessModalOpen} onOpenChange={setIsSuccessModalOpen}>
        <DialogContent className="max-w-md glass-card">
          <div className="text-center space-y-6">
            {/* Ícone de sucesso */}
            <div className="mx-auto w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>

            {/* Título */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-green-400">
                {t("admin.users.reset_success.title", "Reset Concluído com Sucesso!")}
              </h2>
              <p className="text-sm text-gray-400">
                {t("admin.users.reset_success.description", "Os dados do usuário foram resetados conforme solicitado.")}
              </p>
            </div>

            {/* Informações do usuário */}
            {selectedUser && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {t("admin.users.reset_success.user.name_label", "Nome")}:
                  </span>
                  <span className="ml-2 text-gray-700 dark:text-gray-300">{selectedUser.nome}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {t("admin.users.reset_success.user.email_label", "Email")}:
                  </span>
                  <span className="ml-2 text-gray-700 dark:text-gray-300">{selectedUser.email}</span>
                </div>
              </div>
            )}

            {/* Resumo do que foi resetado */}
            {resetResult && resetResult.resetData && (
              <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h4 className="font-medium text-green-800 dark:text-green-400 mb-3 text-sm">
                  {t("admin.users.reset_success.summary.title", "Resumo do Reset:")}
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">
                      {t("admin.users.reset_success.summary.transactions", "Transações")}:
                    </span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {t("admin.users.reset_success.summary.removed_count_feminine", "{{count}} removidas")
                        .replace("{{count}}", String(resetResult.resetData.transactionsRemoved))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">
                      {t("admin.users.reset_success.summary.reminders", "Lembretes")}:
                    </span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {t("admin.users.reset_success.summary.removed_count_masculine", "{{count}} removidos")
                        .replace("{{count}}", String(resetResult.resetData.remindersRemoved))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">
                      {t("admin.users.reset_success.summary.categories", "Categorias")}:
                    </span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {t("admin.users.reset_success.summary.removed_count_feminine", "{{count}} removidas")
                        .replace("{{count}}", String(resetResult.resetData.categoriesRemoved))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">
                      {t("admin.users.reset_success.summary.tokens", "Tokens extras")}:
                    </span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {t("admin.users.reset_success.summary.removed_count_masculine", "{{count}} removidos")
                        .replace("{{count}}", String(resetResult.resetData.tokensRemoved))}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                  <div className="flex justify-between text-xs">
                    <span className="text-green-700 dark:text-green-300">
                      {t("admin.users.reset_success.summary.wallet", "Saldo da carteira")}:
                    </span>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      {t("admin.users.reset_success.summary.wallet_reset", "Resetado para R$ 0,00")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Botão de fechar */}
            <Button
              onClick={closeSuccessModal}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {t("admin.users.reset_success.actions.close", "Entendido")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de erro centralizada */}
      {errorModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in-0 duration-300"
            onClick={() => setErrorModal({ ...errorModal, isOpen: false })}
          />
          <div 
            className="relative rounded-xl p-6 max-w-md w-full shadow-2xl bg-white dark:bg-gray-900 border border-red-200 dark:border-red-500/50"
            style={{
              animation: 'zoomInBounce 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards'
            }}
          >
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center border-2 animate-pulse bg-red-100 border-red-200 dark:bg-red-500/20 dark:border-red-500/30">
                <AlertTriangle className="w-8 h-8 text-red-500 dark:text-red-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-center mb-2 text-red-600 dark:text-white">
              {t("admin.users.error_modal.title", "Erro ao criar usuário")}
            </h3>
            <div className="w-16 h-1 bg-red-500 rounded-full mx-auto mb-4"></div>
            <div className="border rounded-lg p-4 mb-6 bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20">
              <p className="text-center leading-relaxed text-red-700 dark:text-gray-200">
                {errorModal.message}
              </p>
            </div>
            <div className="flex justify-center">
              <Button
                onClick={() => setErrorModal({ ...errorModal, isOpen: false })}
                className="px-6 py-2 rounded-lg font-medium transition-colors duration-200 shadow-lg bg-red-600 hover:bg-red-700 text-white"
              >
                {t("admin.users.error_modal.close", "Entendi")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão definitiva */}
      {selectedUser && !selectedUser.ativo && (
        <Dialog open={!!selectedUser && !selectedUser.ativo} onOpenChange={open => { if (!open) setSelectedUser(null); }}>
          <DialogContent className="max-w-md glass-card">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-500">
                <Trash2 className="h-5 w-5" />
                {t("admin.users.delete_modal.title", "Excluir Usuário Permanentemente")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>{t("admin.users.delete_modal.attention", "Atenção")}:</strong>{" "}
                  {t("admin.users.delete_modal.warning", "Esta ação irá remover definitivamente todos os dados deste usuário do sistema. Não será possível recuperar!")}
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm">
                  <strong>{t("admin.users.delete_modal.user_label", "Usuário")}:</strong> {selectedUser.nome}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>{t("admin.users.delete_modal.email_label", "Email")}:</strong> {selectedUser.email}
                </p>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("admin.users.delete_modal.confirm_question", "Tem certeza que deseja excluir este usuário permanentemente?")}
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setSelectedUser(null)}>
                {t("common.cancel", "Cancelar")}
              </Button>
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
                onClick={async () => {
                  await apiRequest(`/api/admin/users/${selectedUser.id}?permanente=true`, { method: "DELETE" });
                  setSelectedUser(null);
                  queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
                  toast({
                    title: t("admin.users.toast.delete_permanent.title", "Usuário excluído permanentemente"),
                    description: t(
                      "admin.users.toast.delete_permanent.description",
                      "Todos os dados do usuário {{userName}} foram removidos do sistema."
                    ).replace("{{userName}}", selectedUser.nome),
                  });
                }}
              >
                {t("admin.users.delete_modal.confirm_action", "Excluir Permanentemente")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
