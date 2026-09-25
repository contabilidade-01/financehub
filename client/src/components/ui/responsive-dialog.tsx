import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

/**
 * Dialog responsivo: o DialogContent base já abre como painel inferior no
 * mobile e centralizado a partir de `sm`. Este wrapper só acrescenta o botão
 * de fechar (área de toque de 40px).
 */
const ResponsiveDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogContent ref={ref} className={cn("pt-12 sm:pt-6", className)} {...props}>
    {children}
    <DialogPrimitive.Close className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <X className="h-4 w-4" />
      <span className="sr-only">Fechar</span>
    </DialogPrimitive.Close>
  </DialogContent>
))
ResponsiveDialogContent.displayName = "ResponsiveDialogContent"

export {
  Dialog as ResponsiveDialog,
  DialogPortal as ResponsiveDialogPortal,
  DialogOverlay as ResponsiveDialogOverlay,
  DialogClose as ResponsiveDialogClose,
  DialogTrigger as ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  DialogHeader as ResponsiveDialogHeader,
  DialogFooter as ResponsiveDialogFooter,
  DialogTitle as ResponsiveDialogTitle,
  DialogDescription as ResponsiveDialogDescription,
}
