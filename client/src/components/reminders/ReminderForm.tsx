import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2, Clock } from 'lucide-react';
import React, { useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from '@/contexts/LocalizationContext';

interface ReminderFormProps {
  reminder?: {
    id: number;
    titulo: string;
    descricao?: string | null;
    data_lembrete: string | Date;
    concluido: boolean | null;
  };
  initialDate?: Date;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ReminderForm({
  reminder,
  initialDate = new Date(),
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ReminderFormProps) {
  const [titulo, setTitulo] = useState(reminder?.titulo || '');
  const [descricao, setDescricao] = useState(reminder?.descricao || '');
  const { t } = useTranslation();
  
  // Set default time to 6:00 AM for new reminders
  const getDefaultDateTime = (date: Date) => {
    const newDate = new Date(date);
    newDate.setHours(6, 0, 0, 0);
    return newDate;
  };
  
  const [dataLembrete, setDataLembrete] = useState<Date>(
    reminder ? new Date(reminder.data_lembrete) : getDefaultDateTime(initialDate)
  );
  const [concluido, setConcluido] = useState(reminder?.concluido || false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Remover o useEffect de click global

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onSubmit({
      titulo,
      descricao,
      data_lembrete: dataLembrete,
      concluido,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="category-form-field">
        <label className="category-label">{t('reminders.title', 'Title')}</label>
        <input
          className="category-input"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={t('reminders.title_placeholder', 'Reminder title')}
          required
        />
      </div>

      <div className="category-form-field">
        <label className="category-label">{t('reminders.description_optional', 'Description (optional)')}</label>
        <textarea
          className="category-input"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={t('reminders.description_placeholder', 'Detailed description (optional)')}
          rows={3}
          style={{ resize: 'vertical', minHeight: '80px' }}
        />
      </div>

      <div className="category-form-field">
        <label className="category-label">{t('reminders.reminder_date', 'Reminder Date')}</label>
        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            className={cn(
              "category-select-trigger",
              !dataLembrete && "text-muted-foreground"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setIsCalendarOpen(!isCalendarOpen);
            }}
          >
            <div className="flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dataLembrete ? (
                format(dataLembrete, "PPP", { locale: ptBR })
              ) : (
                <span>{t('reminders.select_date', 'Select a date')}</span>
              )}
            </div>
          </button>
          {isCalendarOpen && ReactDOM.createPortal(
            <>
              {/* Backdrop para fechar ao clicar fora */}
              <div 
                className="fixed inset-0 z-[99998]" 
                onClick={() => setIsCalendarOpen(false)}
                tabIndex={-1}
              />
              <CalendarPopoverAnchor buttonRef={buttonRef}>
                <Calendar
                  mode="single"
                  selected={dataLembrete}
                  onSelect={(date) => {
                    if (date) {
                      setDataLembrete(getDefaultDateTime(date));
                      setIsCalendarOpen(false);
                    }
                  }}
                  initialFocus
                  locale={ptBR}
                  className="rounded-md"
                />
              </CalendarPopoverAnchor>
            </>,
            document.body
          )}
        </div>
      </div>

      {reminder && (
        <div className="category-form-field">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="concluido"
              checked={concluido}
              onCheckedChange={(checked) => setConcluido(!!checked)}
            />
            <label htmlFor="concluido" className="category-label" style={{ marginBottom: 0 }}>
              {t('reminders.completed', 'Completed')}
            </label>
          </div>
        </div>
      )}

      <div className="category-modal-buttons">
        <button 
          type="button" 
          className="category-btn category-btn-secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('common.cancel', 'Cancel')}
        </button>
        <button 
          type="submit" 
          className="category-btn category-btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('common.saving', 'Saving...')}
            </>
          ) : (
            t('common.save', 'Save')
          )}
        </button>
      </div>
    </form>
  );
}

// Componente auxiliar para posicionar o calendário
function CalendarPopoverAnchor({ buttonRef, children }: { buttonRef: React.RefObject<HTMLButtonElement>, children: React.ReactNode }) {
  const [style, setStyle] = React.useState<React.CSSProperties>({});

  React.useLayoutEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const isMobile = window.innerWidth <= 600;
    if (isMobile) {
      setStyle({
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        width: '95vw',
        maxWidth: 400,
        zIndex: 99999,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      });
    } else {
      setStyle({
        position: 'absolute',
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        zIndex: 99999,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      });
    }
  }, [buttonRef]);

  return (
    <div style={style} onClick={e => e.stopPropagation()} tabIndex={0} autoFocus>
      {children}
    </div>
  );
}