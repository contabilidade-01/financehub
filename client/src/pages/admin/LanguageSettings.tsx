import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation, useLocalization } from '../../contexts/LocalizationContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { useToast } from '../../hooks/use-toast';
import { Plus, Edit, Trash2, Upload, Download, Globe } from 'lucide-react';

interface Locale {
  id: number;
  localeCode: string;
  localeName: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LocaleFormData {
  localeCode: string;
  localeName: string;
  isActive: boolean;
  isDefault: boolean;
}

const LanguageSettings: React.FC = () => {
  const { t } = useTranslation();
  const { changeLocale, invalidateCache } = useLocalization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<Locale | null>(null);
  const [formData, setFormData] = useState<LocaleFormData>({
    localeCode: '',
    localeName: '',
    isActive: false,
    isDefault: false,
  });

  // Buscar todos os idiomas
  const { data: locales = [], isLoading } = useQuery({
    queryKey: ['admin-locales'],
    queryFn: async (): Promise<Locale[]> => {
      const response = await fetch('/api/admin/localization');
      if (!response.ok) {
        throw new Error('Falha ao buscar idiomas');
      }
      return response.json();
    },
  });

  // Mutation para criar idioma
  const createLocaleMutation = useMutation({
    mutationFn: async (data: LocaleFormData) => {
      const response = await fetch('/api/admin/localization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao criar idioma');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-locales'] });
      queryClient.invalidateQueries({ queryKey: ['availableLocales'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: t('language.create.success', 'Idioma criado com sucesso'),
        variant: 'default',
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('language.create.error', 'Erro ao criar idioma'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation para atualizar idioma
  const updateLocaleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<LocaleFormData> }) => {
      const response = await fetch(`/api/admin/localization/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao atualizar idioma');
      }
      return response.json();
    },
    onSuccess: async (updatedLocale) => {
      queryClient.invalidateQueries({ queryKey: ['admin-locales'] });
      queryClient.invalidateQueries({ queryKey: ['availableLocales'] });
      queryClient.invalidateQueries({ queryKey: ['defaultLocale'] });
      
      // Se o idioma foi definido como padrão, atualizar interface imediatamente
      if (formData.isDefault && selectedLocale) {
        try {
          await changeLocale(selectedLocale.localeCode);
          console.log(`🌐 Interface atualizada para o novo idioma padrão: ${selectedLocale.localeCode}`);
        } catch (error) {
          console.error('Erro ao atualizar interface para novo idioma:', error);
          // Invalidar cache e recarregar como fallback
          invalidateCache();
        }
      }
      
      setIsEditDialogOpen(false);
      resetForm();
      toast({
        title: t('language.update.success', 'Idioma atualizado com sucesso'),
        variant: 'default',
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('language.update.error', 'Erro ao atualizar idioma'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation para remover idioma
  const deleteLocaleMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/localization/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao remover idioma');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-locales'] });
      queryClient.invalidateQueries({ queryKey: ['availableLocales'] });
      toast({
        title: t('language.delete.success', 'Idioma removido com sucesso'),
        variant: 'default',
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('language.delete.error', 'Erro ao remover idioma'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation para importar strings
  const importStringsMutation = useMutation({
    mutationFn: async (localeCode: string) => {
      const response = await fetch(`/api/admin/localization/${localeCode}/import`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao importar strings');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('language.import.success', 'Strings importadas com sucesso'),
        description: `${data.imported} novas, ${data.updated} atualizadas`,
        variant: 'default',
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('language.import.error', 'Erro ao importar strings'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      localeCode: '',
      localeName: '',
      isActive: false,
      isDefault: false,
    });
    setSelectedLocale(null);
  };

  const handleCreateClick = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleEditClick = (locale: Locale) => {
    setSelectedLocale(locale);
    setFormData({
      localeCode: locale.localeCode,
      localeName: locale.localeName,
      isActive: locale.isActive,
      isDefault: locale.isDefault,
    });
    setIsEditDialogOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLocaleMutation.mutate(formData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLocale) {
      const { localeCode, ...updateData } = formData;
      updateLocaleMutation.mutate({ 
        id: selectedLocale.id, 
        data: updateData 
      });
    }
  };

  const handleDelete = (locale: Locale) => {
    if (window.confirm(t('language.delete.confirm', 'Tem certeza que deseja remover este idioma?'))) {
      deleteLocaleMutation.mutate(locale.id);
    }
  };

  const handleImportStrings = (localeCode: string) => {
    importStringsMutation.mutate(localeCode);
  };

  // Função para trocar status de padrão diretamente na lista
  const handleToggleDefault = async (locale: Locale) => {
    try {
      const updatedData = { isDefault: !locale.isDefault };
      
      // Se está ativando como padrão, primeiro atualizar no servidor
      const response = await fetch(`/api/admin/localization/${locale.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao atualizar idioma');
      }
      
      // Atualizar queries
      queryClient.invalidateQueries({ queryKey: ['admin-locales'] });
      queryClient.invalidateQueries({ queryKey: ['availableLocales'] });
      queryClient.invalidateQueries({ queryKey: ['defaultLocale'] });
      
      // Se ativou como padrão, trocar interface imediatamente
      if (!locale.isDefault) {
        await changeLocale(locale.localeCode);
        console.log(`🌐 Interface trocada para novo idioma padrão: ${locale.localeCode}`);
        
        toast({
          title: t('language.default.success', 'Idioma padrão alterado'),
          description: t('language.default.interface_updated', 'A interface foi atualizada automaticamente'),
          variant: 'default',
        });
      } else {
        toast({
          title: t('language.default.removed', 'Idioma padrão removido'),
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Erro ao alterar idioma padrão:', error);
      toast({
        title: t('language.default.error', 'Erro ao alterar idioma padrão'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">{t('common.loading', 'Carregando...')}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Globe className="h-8 w-8" />
            {t('language.settings.title', 'Configurações de Idioma')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('language.settings.description', 'Gerencie os idiomas disponíveis no sistema')}
          </p>
        </div>
        <Button onClick={handleCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          {t('language.add', 'Adicionar Idioma')}
        </Button>
      </div>

      <div className="grid gap-4">
        {locales.map((locale) => (
          <Card key={locale.id}>
            <CardContent className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{locale.localeName}</h3>
                    <Badge variant="outline">{locale.localeCode}</Badge>
                    {locale.isDefault && (
                      <Badge variant="default">
                        {t('language.default', 'Padrão')}
                      </Badge>
                    )}
                    {locale.isActive && (
                      <Badge variant="secondary">
                        {t('language.active', 'Ativo')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('language.created', 'Criado em')}: {new Date(locale.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* Switch para tornar padrão */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">
                    {t('language.set_default', 'Padrão')}
                  </label>
                  <Switch
                    checked={locale.isDefault}
                    onCheckedChange={() => handleToggleDefault(locale)}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleImportStrings(locale.localeCode)}
                    disabled={importStringsMutation.isPending}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {t('language.import', 'Importar')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditClick(locale)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {t('common.edit', 'Editar')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(locale)}
                    disabled={locale.isDefault}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('common.delete', 'Remover')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog de Criação */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('language.create.title', 'Adicionar Novo Idioma')}</DialogTitle>
          </DialogHeader>
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('language.form.code', 'Código do Idioma')}
            </label>
            <Input
              value={formData.localeCode}
              onChange={(e) => setFormData({ ...formData, localeCode: e.target.value })}
              placeholder="ex: pt-br, en-us"
              pattern="^[a-z]{2}-[a-z]{2}$"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('language.form.code.hint', 'Use o formato ISO 639-1 (ex: pt-br, en-us)')}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('language.form.name', 'Nome do Idioma')}
            </label>
            <Input
              value={formData.localeName}
              onChange={(e) => setFormData({ ...formData, localeName: e.target.value })}
              placeholder="ex: Português Brasil"
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {t('language.form.active', 'Idioma Ativo')}
            </label>
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {t('language.form.default', 'Idioma Padrão')}
            </label>
            <Switch
              checked={formData.isDefault}
              onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button
              type="submit"
              disabled={createLocaleMutation.isPending}
            >
              {createLocaleMutation.isPending 
                ? t('common.creating', 'Criando...')
                : t('common.create', 'Criar')
              }
            </Button>
          </div>
        </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('language.edit.title', 'Editar Idioma')}</DialogTitle>
          </DialogHeader>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('language.form.code', 'Código do Idioma')}
            </label>
            <Input
              value={formData.localeCode}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('language.form.code.readonly', 'O código do idioma não pode ser alterado')}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('language.form.name', 'Nome do Idioma')}
            </label>
            <Input
              value={formData.localeName}
              onChange={(e) => setFormData({ ...formData, localeName: e.target.value })}
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {t('language.form.active', 'Idioma Ativo')}
            </label>
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {t('language.form.default', 'Idioma Padrão')}
            </label>
            <Switch
              checked={formData.isDefault}
              onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button
              type="submit"
              disabled={updateLocaleMutation.isPending}
            >
              {updateLocaleMutation.isPending 
                ? t('common.saving', 'Salvando...')
                : t('common.save', 'Salvar')
              }
            </Button>
          </div>
        </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LanguageSettings;