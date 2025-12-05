import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wrench, RefreshCw, Palette, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Category {
  id: number;
  nome: string;
  tipo: string;
  cor: string;
  icone: string;
  global: boolean;
  usuario_id?: number;
}

export default function MaintenancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editColor, setEditColor] = useState('');

  // Fetch todas as categorias
  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ['maintenance-categories'],
    queryFn: async () => {
      const response = await fetch('/api/maintenance/categories', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar categorias');
      }

      const result = await response.json();
      return result.data;
    }
  });

  // Mutation para aplicar correção automática
  const fixColorsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/maintenance/fix-category-colors', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao aplicar correção');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Correção aplicada!',
        description: data.message,
        variant: 'default'
      });
      queryClient.invalidateQueries({ queryKey: ['maintenance-categories'] });
      setShowConfirmDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao aplicar correção',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Mutation para atualizar cor individual
  const updateColorMutation = useMutation({
    mutationFn: async ({ id, cor }: { id: number; cor: string }) => {
      const response = await fetch(`/api/maintenance/categories/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cor })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao atualizar cor');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Cor atualizada!',
        description: `Cor da categoria "${data.data.nome}" atualizada com sucesso.`,
        variant: 'default'
      });
      queryClient.invalidateQueries({ queryKey: ['maintenance-categories'] });
      setEditingCategory(null);
      setEditColor('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar cor',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleApplyFix = () => {
    fixColorsMutation.mutate();
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setEditColor(category.cor);
  };

  const handleSaveColor = () => {
    if (editingCategory && editColor) {
      updateColorMutation.mutate({ id: editingCategory.id, cor: editColor });
    }
  };

  const expenseCategories = categories?.filter(c => c.tipo === 'Despesa') || [];
  const incomeCategories = categories?.filter(c => c.tipo === 'Receita') || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wrench className="h-8 w-8" />
          Ferramentas de Manutenção
        </h1>
        <p className="text-muted-foreground mt-2">
          Ferramentas administrativas para manutenção e correção do sistema
        </p>
      </div>

      {/* Seção de Correção Automática */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Correção Automática de Cores
          </CardTitle>
          <CardDescription>
            Aplica cores únicas automaticamente para todas as categorias globais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Esta operação irá atualizar as cores de todas as categorias globais de despesa e receita
              com um esquema de cores pré-definido e otimizado para visualização em gráficos.
            </p>
          </div>

          <Button
            onClick={() => setShowConfirmDialog(true)}
            disabled={fixColorsMutation.isPending}
            className="w-full sm:w-auto"
          >
            {fixColorsMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aplicando correção...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Aplicar Correção de Cores
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Seção de Edição Manual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Edição Manual de Cores
          </CardTitle>
          <CardDescription>
            Edite as cores das categorias individualmente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Categorias de Despesa */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Categorias de Despesa</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cor Atual</TableHead>
                      <TableHead>Preview</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenseCategories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.nome}</TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-sm">{category.cor}</code>
                        </TableCell>
                        <TableCell>
                          <div
                            className="w-8 h-8 rounded border-2 border-border"
                            style={{ backgroundColor: category.cor }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCategory(category)}
                          >
                            <Palette className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Categorias de Receita */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Categorias de Receita</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cor Atual</TableHead>
                      <TableHead>Preview</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeCategories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.nome}</TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-sm">{category.cor}</code>
                        </TableCell>
                        <TableCell>
                          <div
                            className="w-8 h-8 rounded border-2 border-border"
                            style={{ backgroundColor: category.cor }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCategory(category)}
                          >
                            <Palette className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Confirmação */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Correção de Cores</DialogTitle>
            <DialogDescription>
              Esta operação irá atualizar as cores de todas as categorias globais. Esta ação não pode ser desfeita automaticamente.
              <br /><br />
              Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={fixColorsMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleApplyFix}
              disabled={fixColorsMutation.isPending}
            >
              {fixColorsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aplicando...
                </>
              ) : (
                'Confirmar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição de Cor */}
      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cor da Categoria</DialogTitle>
            <DialogDescription>
              Categoria: <strong>{editingCategory?.nome}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="color">Cor (formato hex: #RRGGBB)</Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  type="text"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  placeholder="#FF6B6B"
                  maxLength={7}
                />
                <Input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-20"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Preview:</Label>
                <div
                  className="w-16 h-16 rounded border-2 border-border mt-2"
                  style={{ backgroundColor: editColor }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingCategory(null)}
              disabled={updateColorMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveColor}
              disabled={updateColorMutation.isPending || !editColor}
            >
              {updateColorMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
