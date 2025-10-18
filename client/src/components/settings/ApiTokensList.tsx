import { useState } from 'react';
import { useQuery, useMutation, QueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTranslation } from '@/contexts/LocalizationContext';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Copy, Key, Trash2, Lock, RefreshCcw } from 'lucide-react';

type CreateTokenInput = {
  nome: string;
  descricao?: string;
};

type UpdateTokenInput = {
  nome: string;
  descricao?: string;
  ativo: boolean;
};

interface ApiToken {
  id: number;
  usuario_id: number;
  token: string;
  nome: string;
  descricao?: string;
  data_criacao: string;
  data_expiracao?: string;
  ativo: boolean;
  master: boolean; // Adicionado para indicar se é o MasterToken
}

export function ApiTokensList() {
  const { toast } = useToast();
  const { t } = useTranslation();

  // Schema para criação de token
  const createTokenSchema = z.object({
    nome: z.string().min(1, t('validation.name_required', 'O nome é obrigatório')),
    descricao: z.string().optional(),
  });

  // Schema para atualização de token
  const updateTokenSchema = z.object({
    nome: z.string().min(1, t('validation.name_required', 'O nome é obrigatório')),
    descricao: z.string().optional(),
    ativo: z.boolean().default(true),
  });
  const [newTokenData, setNewTokenData] = useState<ApiToken | null>(null);
  const [tokenToEdit, setTokenToEdit] = useState<ApiToken | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [masterTokenModalOpen, setMasterTokenModalOpen] = useState(false);
  const [rotateModalOpen, setRotateModalOpen] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotateSuccess, setRotateSuccess] = useState<string | null>(null);
  const [rotatePassword, setRotatePassword] = useState("");
  const [tokenToRotate, setTokenToRotate] = useState<ApiToken | null>(null);
  const [rotateSuccessModalOpen, setRotateSuccessModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<ApiToken | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Consulta para listar tokens
  const { data: tokens = [], isLoading, isError, refetch } = useQuery<ApiToken[]>({
    queryKey: ['/api/tokens'],
    retry: 1,
  });

  // Formulário para criar tokens
  const form = useForm<CreateTokenInput>({
    resolver: zodResolver(createTokenSchema),
    defaultValues: {
      nome: '',
      descricao: '',
    },
  });

  // Formulário para editar tokens
  const editForm = useForm<UpdateTokenInput>({
    resolver: zodResolver(updateTokenSchema),
    defaultValues: {
      nome: '',
      descricao: '',
      ativo: true,
    },
  });

  // Mutação para criar token
  const createMutation = useMutation({
    mutationFn: (data: CreateTokenInput) => {
      return apiRequest<ApiToken>('/api/tokens', {
        method: 'POST',
        data,
      });
    },
    onSuccess: (data) => {
      setNewTokenData(data);
      queryClient.invalidateQueries({ queryKey: ['/api/tokens'] });
      form.reset();
      toast({
        title: t('api_tokens.toast.created_success', 'Token criado com sucesso'),
        description: t('api_tokens.toast.created_description', 'O token foi criado com sucesso. Copie o token completo agora, pois ele não será mostrado novamente.'),
      });
    },
    onError: (error) => {
      toast({
        title: t('api_tokens.toast.create_error', 'Erro ao criar token'),
        description: t('api_tokens.toast.create_error_description', 'Ocorreu um erro ao criar o token. Por favor, tente novamente.'),
        variant: "destructive",
      });
    },
  });

  // Mutação para atualizar token
  const updateMutation = useMutation({
    mutationFn: (data: { id: number; updateData: UpdateTokenInput }) => {
      return apiRequest<ApiToken>(`/api/tokens/${data.id}`, {
        method: 'PUT',
        data: data.updateData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tokens'] });
      setTokenToEdit(null);
      setEditDialogOpen(false);
      editForm.reset();
      toast({
        title: t('api_tokens.toast.updated_success', 'Token atualizado'),
        description: t('api_tokens.toast.updated_description', 'O token foi atualizado com sucesso.'),
      });
    },
    onError: (error) => {
      toast({
        title: t('api_tokens.toast.update_error', 'Erro ao atualizar token'),
        description: t('api_tokens.toast.update_error_description', 'Ocorreu um erro ao atualizar o token. Por favor, tente novamente.'),
        variant: "destructive",
      });
    },
  });

  // Mutação para excluir token
  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest<boolean>(`/api/tokens/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tokens'] });
      toast({
        title: t('api_tokens.toast.removed_success', 'Token removido'),
        description: t('api_tokens.toast.removed_description', 'O token foi removido com sucesso.'),
      });
    },
    onError: (error) => {
      toast({
        title: t('api_tokens.toast.remove_error', 'Erro ao remover token'),
        description: t('api_tokens.toast.remove_error_description', 'Ocorreu um erro ao remover o token. Por favor, tente novamente.'),
        variant: "destructive",
      });
    },
  });

  // Função para copiar token para clipboard
  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({
      title: t('api_tokens.toast.copied', 'Token copiado'),
      description: t('api_tokens.toast.copied_description', 'O token foi copiado para a área de transferência.'),
    });
  };

  // Função para abrir diálogo de edição
  const openEditDialog = (token: ApiToken) => {
    setTokenToEdit(token);
    editForm.reset({
      nome: token.nome,
      descricao: token.descricao || '',
      ativo: token.ativo,
    });
    setEditDialogOpen(true);
  };

  // Função para lidar com envio do formulário de criação
  const onSubmit = (data: CreateTokenInput) => {
    createMutation.mutate(data);
  };

  // Função para lidar com envio do formulário de edição
  const onEditSubmit = (data: UpdateTokenInput) => {
    if (tokenToEdit) {
      updateMutation.mutate({ id: tokenToEdit.id, updateData: data });
    }
  };

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('api_tokens.title', 'Tokens de API')}</CardTitle>
          <CardDescription>{t('api_tokens.description', 'Gerencie seus tokens de acesso à API')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center p-4">
            <p className="text-gray-500 mb-2">{t('api_tokens.error_loading', 'Erro ao carregar tokens')}</p>
            <Button onClick={() => refetch()}>{t('common.try_again', 'Tentar novamente')}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('api_tokens.title', 'Tokens de API')}</CardTitle>
        <CardDescription>{t('api_tokens.description', 'Gerencie seus tokens de acesso à API')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <p>{t('api_tokens.loading', 'Carregando tokens...')}</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8">
            <Key size={48} className="text-gray-400 mb-4" />
            <p className="text-gray-500 mb-4">{t('api_tokens.empty_state', 'Você ainda não possui tokens de API')}</p>
            <p className="text-gray-500 text-sm text-center mb-6">
              {t('api_tokens.empty_description', 'Tokens de API permitem que aplicativos externos acessem seus dados de forma segura.')}
            </p>
          </div>
        ) : (
          <>
            {/* MOBILE CARDS */}
            <div className="flex flex-col gap-4 md:hidden">
              {tokens.map((token: ApiToken) => (
                <div key={token.id} className="glass-card rounded-xl p-4 flex flex-col gap-2 shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-base flex-1">{token.nome}</div>
                    {token.ativo ? (
                      <Badge variant="default">{t('common.status.active', 'Ativo')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('common.status.inactive', 'Inativo')}</Badge>
                    )}
                  </div>
                  {token.descricao && (
                    <div className="text-xs text-gray-400 mb-1">{token.descricao}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">Token:</span>
                    <code className="bg-gray-800 text-gray-100 p-1 rounded text-xs break-all flex-1">{token.token}</code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6" 
                      onClick={() => copyToken(token.token)}
                    >
                      <Copy size={14} />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    <span>{t('api_tokens.actions.created', 'Criado')}:</span>
                    {token.data_criacao && (
                      <span>
                        {formatDistanceToNow(new Date(token.data_criacao), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {token.master ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-blue-500 border-blue-500 hover:bg-blue-900/20"
                          onClick={() => { setTokenToRotate(token); setRotateModalOpen(true); }}
                          title={t('api_tokens.tooltip.rotate_master', 'Rotacionar MasterToken')}
                        >
                          <RefreshCcw className="h-4 w-4 mr-2 animate-spin-slow" />
                          {t('api_tokens.actions.rotate', 'Rotacionar')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-gray-500"
                          onClick={() => setMasterTokenModalOpen(true)}
                          aria-label={t('api_tokens.master_token_protected_aria', 'MasterToken não pode ser removido')}
                        >
                          <Lock size={18} />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(token)}
                        >
                          {t('api_tokens.actions.edit', 'Editar')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500"
                          onClick={() => { setTokenToDelete(token); setDeleteModalOpen(true); setDeleteConfirm(""); setDeleteError(null); }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </>
                    )}
                  </div>
                  {/* Modais (reaproveita os já existentes) */}
                  {/* Os modais são renderizados fora do map, não precisam ser duplicados aqui */}
                </div>
              ))}
            </div>
            {/* DESKTOP TABLE */}
            <div className="overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('api_tokens.table.name', 'Nome')}</TableHead>
                  <TableHead>{t('api_tokens.table.token', 'Token')}</TableHead>
                  <TableHead>{t('api_tokens.table.created_at', 'Criado em')}</TableHead>
                  <TableHead>{t('api_tokens.table.status', 'Status')}</TableHead>
                  <TableHead>{t('api_tokens.table.actions', 'Ações')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token: ApiToken) => (
                  <TableRow key={token.id}>
                    <TableCell>
                      <div className="font-medium">{token.nome}</div>
                      {token.descricao && (
                        <div className="text-xs text-gray-500">{token.descricao}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="bg-gray-800 text-gray-100 p-1 rounded text-xs">{token.token}</code>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6" 
                          onClick={() => copyToken(token.token)}
                        >
                          <Copy size={14} />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {token.data_criacao && (
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(token.data_criacao), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {token.ativo ? (
                        <Badge variant="default">{t('common.status.active', 'Ativo')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('common.status.inactive', 'Inativo')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                          {token.master ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-blue-500 border-blue-500 hover:bg-blue-900/20"
                                onClick={() => { setTokenToRotate(token); setRotateModalOpen(true); }}
                                title={t('api_tokens.tooltip.rotate_master', 'Rotacionar MasterToken')}
                              >
                                <RefreshCcw className="h-4 w-4 mr-2 animate-spin-slow" />
                                {t('api_tokens.actions.rotate', 'Rotacionar')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-gray-500"
                                onClick={() => setMasterTokenModalOpen(true)}
                                aria-label={t('api_tokens.master_token_protected_aria', 'MasterToken não pode ser removido')}
                              >
                                <Lock size={18} />
                              </Button>
                            </>
                          ) :
                            <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(token)}
                        >
                          {t('api_tokens.actions.edit', 'Editar')}
                        </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500"
                                onClick={() => { setTokenToDelete(token); setDeleteModalOpen(true); setDeleteConfirm(""); setDeleteError(null); }}
                            >
                              <Trash2 size={16} />
                            </Button>
                            </>
                          }
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <div />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>{t('api_tokens.create_new', 'Criar novo token')}</Button>
          </DialogTrigger>
          <DialogContent>
            {newTokenData ? (
              <>
                <DialogHeader>
                  <DialogTitle>{t('api_tokens.modal.created_title', 'Token criado com sucesso')}</DialogTitle>
                  <DialogDescription>
                    {t('api_tokens.modal.created_description', 'Copie o token abaixo. Por segurança, ele não será mostrado novamente.')}
                  </DialogDescription>
                </DialogHeader>
                <div className="my-4">
                  <p className="mb-2 text-sm font-medium">{t('api_tokens.modal.complete_token', 'Token completo:')}</p>
                  <div className="flex gap-2 items-center">
                    <code className="bg-gray-800 text-gray-100 p-2 rounded text-sm break-all">
                      {newTokenData.token}
                    </code>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToken(newTokenData.token)}
                    >
                      <Copy size={16} />
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => {
                    setNewTokenData(null);
                    setDialogOpen(false);
                  }}>
                    {t('common.done', 'Concluído')}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>{t('api_tokens.modal.create_title', 'Criar novo token de API')}</DialogTitle>
                  <DialogDescription>
                    {t('api_tokens.modal.create_description', 'Crie um novo token para acessar a API do sistema.')}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="nome"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('common.name', 'Nome')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('api_tokens.form.name_placeholder', 'Nome do token')} {...field} />
                          </FormControl>
                          <FormDescription>
                            {t('api_tokens.form.name_description', 'Um nome descritivo para identificar o token.')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="descricao"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('common.description', 'Descrição')}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t('api_tokens.form.description_placeholder', 'Descreva a finalidade deste token')}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('api_tokens.form.description_help', 'Uma descrição opcional para o token.')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? t('api_tokens.form.creating', 'Criando...') : t('api_tokens.form.create', 'Criar token')}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('api_tokens.modal.edit_title', 'Editar token')}</DialogTitle>
              <DialogDescription>
                {t('api_tokens.modal.edit_description', 'Atualize as informações do token.')}
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('api_tokens.form.name', 'Nome')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('api_tokens.form.name_placeholder', 'Nome do token')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="descricao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('api_tokens.form.description', 'Descrição')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('api_tokens.form.description_placeholder', 'Descreva a finalidade deste token')}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="ativo"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          {t('api_tokens.form.active', 'Ativo')}
                        </FormLabel>
                        <FormDescription>
                          {t('api_tokens.form.active_description', 'Quando desativado, o token não poderá ser usado para acessar a API.')}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    type="button" 
                    onClick={() => {
                      setTokenToEdit(null);
                      setEditDialogOpen(false);
                    }}
                  >
                    {t('api_tokens.form.cancel', 'Cancelar')}
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? t('api_tokens.form.saving', 'Salvando...') : t('api_tokens.form.save_changes', 'Salvar alterações')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}