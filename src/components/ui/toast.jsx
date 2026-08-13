import * as React from "react";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Fase M1 (docs/MOBILE_AUDIT.md, achados P1 "toast cobre header mobile" e
// "toast cobre bottom nav entre 640-767px"). Abaixo de sm o toast fica
// ancorado no topo — pt reserva a altura do header fixo + safe-area-top. De
// sm até md (640-767px) o toast já ancora embaixo, mas a bottom nav ainda
// aparece (md:hidden) — pb reserva a altura dela + safe-area-bottom. A partir
// de md a bottom nav some, então o offset extra é removido (md:pb-4).
//
// M1.1 (docs/MOBILE_M1_1_DEVICE_HOTFIX.md): este container fica sempre
// montado, mesmo sem nenhum toast ativo. Como ele reserva pt/pb reais (não é
// height:0), a caixa vazia continuava ocupando ~header+safe-area de altura
// no topo da tela — e por estar em --z-toast (120, acima até de modais),
// interceptava o toque no header mobile/carreira em Android real, mesmo
// sem nenhum toast visível. pointer-events-none devolve o toque a quem está
// embaixo quando a área está vazia; cada Toast individual reativa o próprio
// clique com pointer-events-auto (ver toastVariants abaixo).
const TOAST_VIEWPORT_CLASS =
  "pl-layer-toast pointer-events-none fixed top-0 flex max-h-screen w-full flex-col-reverse px-4 pb-[calc(1rem+var(--pl-safe-b))] pt-[calc(var(--pl-header-h)+var(--pl-safe-t)+1rem)] sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col sm:pt-4 sm:pb-[calc(var(--pl-bottom-nav-h)+var(--pl-safe-b)+1rem)] md:max-w-[400px] md:pb-4";

const ToastProvider = React.forwardRef(({ ...props }, ref) => (
  <div ref={ref} className={TOAST_VIEWPORT_CLASS} {...props} />
));
ToastProvider.displayName = "ToastProvider";

const ToastViewport = React.forwardRef(({ ...props }, ref) => (
  <div ref={ref} className={TOAST_VIEWPORT_CLASS} {...props} />
));
ToastViewport.displayName = "ToastViewport";

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-2xl border p-5 pr-12 shadow-2xl backdrop-blur-2xl transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "glass border-border/60 text-foreground",
        destructive: "border-destructive/50 bg-destructive/90 backdrop-blur-2xl text-destructive-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const Toast = React.forwardRef(({ className, variant, open, onOpenChange, duration, ...props }, ref) => {
  return (
    <div ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />
  );
});
Toast.displayName = "Toast";

const ToastAction = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));
ToastAction.displayName = "ToastAction";

// M1.1 (docs/MOBILE_M1_1_DEVICE_HOTFIX.md): a versão anterior ficava
// opacity-0 até :hover/group-hover, que nunca dispara em toque — em Android
// real o X era invisível (e a hitbox de ~24px, menor que o alvo mínimo).
// Mantém sempre visível (como ModalShell/DrawerShell já fazem) e reusa
// pl-icon-tap (44px) do design system em vez de um número novo.
const ToastClose = React.forwardRef(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "pl-icon-tap absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-foreground/60 opacity-100 transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </button>
));
ToastClose.displayName = "ToastClose";

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm font-bold", className)} {...props} />
));
ToastTitle.displayName = "ToastTitle";

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm opacity-90", className)} {...props} />
));
ToastDescription.displayName = "ToastDescription";

export { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction };
