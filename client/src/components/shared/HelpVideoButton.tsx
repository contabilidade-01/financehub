import { useState } from "react";
import { HelpCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface HelpVideoButtonProps {
  titulo: string;
  descricao: string;
  /**
   * URL do vídeo (30–60s) explicando o fluxo. Enquanto não houver um vídeo
   * real, deixe undefined/vazio — o modal mostra um placeholder "Vídeo em
   * breve" e a estrutura já fica pronta pra só trocar essa URL depois.
   */
  videoUrl?: string;
  label?: string;
}

/**
 * Botão "?" de ajuda contextual para fluxos mais complexos (conectar banco,
 * importar extrato e conciliar, definir assinatura...). Abre um modal com um
 * vídeo curto — ou um placeholder, se a URL ainda não estiver configurada.
 */
export function HelpVideoButton({ titulo, descricao, videoUrl, label = "Como funciona" }: HelpVideoButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => setOpen(true)}
        title={label}
      >
        <HelpCircle className="h-4 w-4" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
            {videoUrl ? (
              <video src={videoUrl} controls className="h-full w-full" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <PlayCircle className="h-10 w-10" />
                <p className="text-sm font-medium">Vídeo em breve</p>
                <p className="px-6 text-center text-xs">
                  Um vídeo curto (30–60s) mostrando esse passo a passo vai aparecer aqui.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
