import { useState, useCallback, useEffect } from 'react';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/pt-br';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import MainLayout from '@/layouts/MainLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import ReminderForm from '@/components/reminders/ReminderForm';
import ReminderDetails from '@/components/reminders/ReminderDetails';
import Loading from '@/components/shared/Loading';
import { Reminder } from '@shared/schema';
import { PlusIcon, CalendarIcon, Bell, CheckCircle, X } from 'lucide-react';
import { motion } from 'framer-motion';
import '../categories/category-modal.css';
import { useTranslation } from '@/contexts/LocalizationContext';
import { getMonthNames, getDayNames, getDayNamesLong } from '@/utils/localization';

// Configurar localizador com moment
moment.locale('pt-br');
const localizer = momentLocalizer(moment);

// Definir interface para eventos do calendário
interface CalendarEvent {
  id: number;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  completed: boolean;
}

// Componente da página de lembretes
export default function RemindersPage() {
  const [currentView, setCurrentView] = useState<View>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start, end };
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Query para buscar lembretes
  const { data: reminders, isLoading, error } = useQuery({
    queryKey: ['/api/reminders'],
    queryFn: () => apiRequest<Reminder[]>('/api/reminders'),
  });

  // Mutation para criar lembrete
  const createReminderMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/reminders', { method: 'POST', data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      setIsCreateModalOpen(false);
      toast({
        title: t('reminders.reminder_created', 'Lembrete criado com sucesso'),
        variant: 'default',
      });
    },
    onError: (error: any) => {
      toast({
        title: t('reminders.error_create', 'Erro ao criar lembrete'),
        description: error.message || t('reminders.error_create_desc', 'Ocorreu um erro ao criar o lembrete.'),
        variant: 'destructive',
      });
    },
  });

  // Mutation para atualizar lembrete
  const updateReminderMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/reminders/${id}`, { method: 'PUT', data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      setIsDetailsModalOpen(false);
      toast({
        title: t('reminders.reminder_updated', 'Lembrete atualizado com sucesso'),
        variant: 'default',
      });
    },
    onError: (error: any) => {
      toast({
        title: t('reminders.error_update', 'Erro ao atualizar lembrete'),
        description: error.message || t('reminders.error_update_desc', 'Ocorreu um erro ao atualizar o lembrete.'),
        variant: 'destructive',
      });
    },
  });

  // Mutation para excluir lembrete
  const deleteReminderMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/reminders/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      setIsDetailsModalOpen(false);
      toast({
        title: t('reminders.reminder_deleted', 'Lembrete excluído com sucesso'),
        variant: 'default',
      });
    },
    onError: (error: any) => {
      toast({
        title: t('reminders.error_delete', 'Erro ao excluir lembrete'),
        description: error.message || t('reminders.error_delete_desc', 'Ocorreu um erro ao excluir o lembrete.'),
        variant: 'destructive',
      });
    },
  });

  // Converter lembretes para eventos do calendário
  const events: CalendarEvent[] = (reminders || []).map((reminder) => ({
    id: reminder.id,
    title: reminder.titulo,
    description: reminder.descricao || undefined,
    start: new Date(reminder.data_lembrete),
    end: new Date(reminder.data_lembrete),
    completed: reminder.concluido || false
  }));

  // Handlers para interações
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    const reminder = reminders?.find((r) => r.id === event.id) || null;
    setSelectedReminder(reminder);
    setIsDetailsModalOpen(true);
  }, [reminders]);

  const handleSelectSlot = useCallback(({ start }: { start: Date }) => {
    setSelectedDate(start);
    setIsCreateModalOpen(true);
  }, []);

  const handleViewChange = useCallback((view: View) => {
    setCurrentView(view);
  }, []);

  const handleRangeChange = useCallback((range: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(range)) {
      const start = range[0];
      const end = range[range.length - 1];
      setDateRange({ start, end });
    } else {
      setDateRange(range);
    }
  }, []);

  const handleCreateReminder = useCallback((data: any) => {
    createReminderMutation.mutate({
      ...data,
      data_lembrete: data.data_lembrete.toISOString(),
    });
  }, [createReminderMutation]);

  const handleUpdateReminder = useCallback((data: any) => {
    if (!selectedReminder) return;
    updateReminderMutation.mutate({
      id: selectedReminder.id,
      data: {
        ...data,
        data_lembrete: data.data_lembrete.toISOString(),
      },
    });
  }, [selectedReminder, updateReminderMutation]);

  const handleDeleteReminder = useCallback(() => {
    if (!selectedReminder) return;
    deleteReminderMutation.mutate(selectedReminder.id);
  }, [selectedReminder, deleteReminderMutation]);

  // Montar componente
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header com estatísticas */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-6"
      >
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            <CalendarIcon className="inline mr-2 h-8 w-8 text-primary" />
            {t('reminders.title', 'Lembretes')}
          </h1>
          <p className="text-gray-400 mt-1">
            {t('reminders.subtitle', 'Gerencie seus compromissos e lembretes')}
          </p>
        </div>
        <div className="w-full md:w-auto flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
          {reminders && (
            <div className="flex gap-4 text-sm text-gray-400 w-full md:w-auto justify-between md:justify-end">
              <div className="flex items-center gap-1">
                <Bell className="h-4 w-4" />
                <span>{reminders.filter(r => !r.concluido).length} {t('reminders.pending', 'pending')}</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                <span>{reminders.filter(r => r.concluido).length} {t('reminders.completed', 'completed')}</span>
              </div>
            </div>
          )}
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full md:w-auto bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white border-0"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            {t('reminders.new_reminder', 'Novo Lembrete')}
          </Button>
        </div>
      </motion.div>

      {/* Card do calendário */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="glass-card neon-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              {t('reminders.calendar_title', 'Reminders Calendar')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <Loading text={t('reminders.loading', 'Loading reminders...')} />
            ) : error ? (
              <div className="flex justify-center items-center h-96">
                <p className="text-red-400">{t('reminders.error_loading', 'Error loading reminders. Please try again later.')}</p>
              </div>
            ) : (
              <div className="h-[600px] calendar-container">
                <Calendar
                  localizer={localizer}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  onSelectEvent={handleSelectEvent}
                  onSelectSlot={handleSelectSlot}
                  selectable
                  view={currentView}
                  onView={handleViewChange}
                  onRangeChange={handleRangeChange}
                  views={['month', 'week', 'day']}
                  messages={{
                    today: t('calendar.today', 'Today'),
                    previous: t('calendar.previous', 'Previous'),
                    next: t('calendar.next', 'Next'),
                    month: t('calendar.month', 'Month'),
                    week: t('calendar.week', 'Week'),
                    day: t('calendar.day', 'Day'),
                    agenda: t('calendar.agenda', 'Agenda'),
                    date: t('calendar.date', 'Date'),
                    time: t('calendar.time', 'Time'),
                    event: t('calendar.event', 'Event'),
                    noEventsInRange: t('calendar.no_events', 'No reminders in this period'),
                    showMore: (total) => `+${total} ${t('calendar.more', 'more')}`,
                  }}
                  formats={{
                    monthHeaderFormat: (date) => {
                      const monthNames = getMonthNames(t);
                      return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
                    },
                    dayFormat: (date) => {
                      const dayNames = getDayNames(t);
                      return dayNames[date.getDay()];
                    },
                    dayHeaderFormat: (date) => {
                      const dayNames = getDayNamesLong(t);
                      const monthNames = getMonthNames(t);
                      return `${dayNames[date.getDay()]}, ${date.getDate()} ${t('calendar.of', 'of')} ${monthNames[date.getMonth()]}`;
                    },
                    weekdayFormat: (date) => {
                      const dayNames = getDayNames(t);
                      return dayNames[date.getDay()];
                    },
                  }}
                  eventPropGetter={(event) => ({
                    style: {
                      backgroundColor: event.completed ? '#22c55e' : '#3b82f6',
                      borderRadius: '6px',
                      border: event.completed ? '1px solid #16a34a' : '1px solid #2563eb',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '500',
                    },
                  })}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Modal para criar lembrete */}
      {isCreateModalOpen && (
        <div className="category-modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsCreateModalOpen(false)}>
          <div className="category-modal-content">
            <button 
              className="category-modal-close"
              onClick={() => setIsCreateModalOpen(false)}
            >
              <X size={24} />
            </button>
            
            <div className="category-modal-title">
              <Bell className="mr-2 h-5 w-5 inline" />
              {t('reminders.new_reminder', 'Novo Lembrete')}
            </div>
            <div className="category-modal-description">
              {t('reminders.new_reminder_desc', 'Preencha os detalhes para criar um novo lembrete.')}
            </div>

            <ReminderForm
              initialDate={selectedDate}
              onSubmit={handleCreateReminder}
              onCancel={() => setIsCreateModalOpen(false)}
              isSubmitting={createReminderMutation.isPending}
            />
          </div>
        </div>
      )}

      {/* Modal para visualizar/editar lembrete */}
      {isDetailsModalOpen && selectedReminder && (
        <div className="category-modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsDetailsModalOpen(false)}>
          <div className="category-modal-content">
            <button 
              className="category-modal-close"
              onClick={() => setIsDetailsModalOpen(false)}
            >
              <X size={24} />
            </button>
            
            <div className="category-modal-title">
              <CalendarIcon className="mr-2 h-5 w-5 inline" />
              {t('reminders.details_title', 'Detalhes do Lembrete')}
            </div>
            <div className="category-modal-description">
              {t('reminders.details_desc', 'Visualize e edite os detalhes do lembrete.')}
            </div>

            <ReminderDetails
              reminder={selectedReminder}
              onUpdate={handleUpdateReminder}
              onDelete={handleDeleteReminder}
              onCancel={() => setIsDetailsModalOpen(false)}
              isUpdating={updateReminderMutation.isPending}
              isDeleting={deleteReminderMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}