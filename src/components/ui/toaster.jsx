import { useToast } from "@/components/ui/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle } from "@/components/ui/toast";

// Hotfix 15.5.3 (toast "Evoluído!" difícil de fechar): `ToastProvider` já É
// o container posicionado/fixo (TOAST_VIEWPORT_CLASS, toast.jsx) que recebe
// os toasts como filhos diretos abaixo — `ToastViewport` aplicava a MESMA
// classe `fixed`/`flex-col-reverse` numa segunda div irmã, sempre vazia
// (nada nunca era renderizado dentro dela), sobrepondo o mesmo retângulo da
// viewport uma segunda vez sem necessidade. Nenhum outro arquivo importa
// ToastViewport (auditado); removida a única renderização órfã em vez de
// manter dois containers de posicionamento idênticos e um deles morto.
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose onClick={() => dismiss(id)} aria-label="Fechar notificação" />
          </Toast>
        );
      })}
    </ToastProvider>
  );
}