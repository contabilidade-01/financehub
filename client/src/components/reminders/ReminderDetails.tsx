import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, Edit, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from '@/contexts/LocalizationContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Reminder } from '@shared/schema';
import ReminderForm from './ReminderForm';

interface ReminderDetailsProps {
  reminder: {
    id: number;
    usuario_id: number;
    titulo: string;
    descricao: string | null;
    data_lembrete: string | Date;
    data_criacao: string | Date | null;
    concluido: boolean | null;
  };
  onUpdate: (data: any) => void;
  onDelete: () => void;
  onCancel: () => void;
  isUpdating?: boolean;
  isDeleting?: boolean;
}

export default function ReminderDetails({
  reminder,
  onUpdate,
  onDelete,
  onCancel,
  isUpdating = false,
  isDeleting = false,
}: ReminderDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { t } = useTranslation();

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleUpdate = (data: any) => {
    onUpdate(data);
    setIsEditing(false);
  };

  const confirmDelete = () => {
    setIsDeleteDialogOpen(true);
  };

  const cancelDelete = () => {
    setIsDeleteDialogOpen(false);
  };

  const handleDelete = () => {
    onDelete();
    setIsDeleteDialogOpen(false);
  };

  // Se estiver no modo de edição, mostrar o formulário
  if (isEditing) {
    return (
      <ReminderForm
        reminder={{
          id: reminder.id,
          titulo: reminder.titulo,
          descricao: reminder.descricao,
          data_lembrete: reminder.data_lembrete,
          concluido: reminder.concluido
        }}
        onSubmit={handleUpdate}
        onCancel={handleCancel}
        isSubmitting={isUpdating}
      />
    );
  }

  // Caso contrário, mostrar os detalhes
  return (
    <div className="space-y-4">
      <div className="pb-3 border-b">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold">{reminder.titulo}</h3>
          <div className="flex items-center space-x-1">
            {reminder.concluido && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <Check className="w-3 h-3 mr-1" /> {t('reminders.completed', 'Completed')}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {format(new Date(reminder.data_lembrete), "PPP", { locale: ptBR })}
        </p>
      </div>

      {reminder.descricao && (
        <div className="py-2">
          <p className="text-sm whitespace-pre-line">{reminder.descricao}</p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>
          {t('common.close', 'Close')}
        </Button>
        <div className="space-x-2">
          <Button variant="outline" onClick={handleEdit} disabled={isDeleting}>
            <Edit className="w-4 h-4 mr-1" /> {t('common.edit', 'Edit')}
          </Button>
          <Button
            variant="destructive"
            onClick={confirmDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t('common.deleting', 'Deleting...')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-1" /> {t('common.delete', 'Delete')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reminders.delete_reminder', 'Delete Reminder')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('reminders.delete_confirmation', 'Are you sure you want to delete this reminder? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}