import React from "react";
import { Surface } from '@/components/design-system';

// Pilot "simples" da consolidação Design System 2.0 (docs/DESIGN_SYSTEM_V2.md).
// Antes: markup próprio (bg-card/shadow-sm), fora dos dois sistemas
// existentes — as 4 telas de auth (Login/Register/ForgotPassword/ResetPassword)
// eram as únicas do projeto sem nenhum tratamento visual do jogo. Migrar só
// este layout compartilhado já resolve as 4 telas de uma vez.
export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="app-shell relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {Icon && (
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-[0_0_24px_hsl(var(--primary)/0.2)]">
              <Icon className="h-7 w-7 text-primary-foreground" aria-hidden="true" />
            </div>
          )}
          <h1 className="font-heading text-3xl font-black tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Surface variant="elevated" padding="spacious">{children}</Surface>
        {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
      </div>
    </div>
  );
}
