import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bug, CheckCircle2, FlaskConical, ShieldCheck, X } from 'lucide-react';
import { hasSeenClosedBetaWelcome, markClosedBetaWelcomeSeen } from '@/lib/betaCandidate.js';

export default function BetaWelcome() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenClosedBetaWelcome()) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = event => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [open]);

  function close() {
    markClosedBetaWelcomeSeen();
    setOpen(false);
  }

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Bem-vindo à beta fechada">
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-primary/25 bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.22em] text-primary">Closed Beta · RC1</p>
            <h2 className="mt-1 text-2xl font-black">Bem-vindo ao Padel Legacy</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">Esta build entrou em feature freeze. Seu objetivo como testador é jogar normalmente e nos ajudar a encontrar bugs, problemas de ritmo e pontos de confusão.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fechar" className="rounded-xl p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5 sm:p-6">
          {[
            [FlaskConical, 'Teste a carreira de verdade', 'Avance temporadas, jogue torneios e use os sistemas como faria normalmente.'],
            [Bug, 'Encontrou algo estranho?', 'Use o botão BETA no topo para registrar passos, resultado esperado e diagnóstico.'],
            [ShieldCheck, 'Seu save está protegido', 'A Central BETA permite criar backup e exportar a carreira antes de testes longos.'],
            [CheckCircle2, 'Não precisa procurar bugs', 'Divirta-se. Os problemas que surgirem no fluxo normal são os mais valiosos para a RC.'],
          ].map(([Icon, title, text]) => (
            <div key={title} className="flex gap-3 rounded-2xl border border-border bg-secondary/30 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
              <div><p className="text-sm font-black">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p></div>
            </div>
          ))}
          <button type="button" onClick={close} className="mt-2 w-full rounded-2xl bg-primary px-5 py-3.5 text-sm font-black text-primary-foreground transition hover:opacity-90">Começar a testar</button>
          <p className="text-center text-[11px] text-muted-foreground">Você verá esta mensagem apenas uma vez neste dispositivo.</p>
        </div>
      </section>
    </div>,
    document.body,
  );
}
