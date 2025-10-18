import React from 'react';
import { AlertTriangle, Save, X } from 'lucide-react';
import { Button } from './button';
import { useTranslation } from '@/contexts/LocalizationContext';

interface UnsavedChangesModalProps {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesModal({ 
  open, 
  onSave, 
  onDiscard, 
  onCancel 
}: UnsavedChangesModalProps) {
  const { t } = useTranslation();
  
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4 animate-zoom-in-bounce"
          onClick={e => e.stopPropagation()}
        >
          {/* Ícone de alerta */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/50 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
          </div>

          {/* Título */}
          <h3 className="text-lg font-semibold text-center mb-2 text-gray-900 dark:text-white">
            {t('unsaved_changes.title', 'Alterações não salvas')}
          </h3>

          {/* Mensagem */}
          <p className="text-gray-600 dark:text-gray-300 text-center mb-6 leading-relaxed">
            {t('unsaved_changes.message', 'Você tem alterações não salvas que serão perdidas se continuar. Deseja salvar suas alterações antes de prosseguir?')}
          </p>

          {/* Botões de ação */}
          <div className="flex flex-col gap-3">
            {/* Botão principal - Salvar */}
            <Button 
              onClick={onSave}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {t('unsaved_changes.save_changes', 'Salvar alterações')}
            </Button>

            {/* Botão secundário - Descartar */}
            <Button 
              onClick={onDiscard}
              variant="outline"
              className="w-full border-red-300 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              {t('unsaved_changes.discard_changes', 'Descartar alterações')}
            </Button>

            {/* Botão terciário - Cancelar */}
            <Button 
              onClick={onCancel}
              variant="ghost"
              className="w-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes zoom-in-bounce {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          60% {
            transform: scale(1.05);
            opacity: 1;
          }
          80% {
            transform: scale(0.98);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .animate-zoom-in-bounce {
          animation: zoom-in-bounce 300ms cubic-bezier(0.68, -0.55, 0.27, 1.55);
        }
      `}</style>
    </>
  );
}