import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openGuidedTour, type TourChapterId } from "@/lib/guided-tour-bus";

/**
 * Botão "?" que reabre um CAPÍTULO específico do tour guiado (não o tour
 * inteiro), direto no contexto da página em que o usuário está.
 */
export function ChapterHelpButton({
  chapter,
  label = "Ver tour",
  variant = "ghost",
}: {
  chapter: TourChapterId;
  label?: string;
  variant?: "ghost" | "outline" | "secondary";
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className="gap-1.5 text-muted-foreground"
      onClick={() => openGuidedTour(chapter)}
      title="Rever explicação desta tela"
    >
      <HelpCircle className="h-4 w-4" />
      {label}
    </Button>
  );
}
