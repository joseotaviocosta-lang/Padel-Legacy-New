import { useEffect, useState } from 'react';
import { Bug, CheckCircle2, FlaskConical, ShieldCheck } from 'lucide-react';
import { hasSeenClosedBetaWelcome, markClosedBetaWelcomeSeen } from '@/lib/betaCandidate.js';
import { ModalShell } from '@/components/design-system';

export default function BetaWelcome() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenClosedBetaWelcome()) setOpen(true);
  }, []);

  function close() {
    markClosedBetaWelcomeSeen();
    setOpen(false);
  }

  return (
    <ModalShell
      open={open}
      onClose={close}
      title="Bem-vindo ao Padel Legacy"
      description="Esta build entrou em feature freeze. Seu objetivo como testador é jogar normalmente e nos ajudar a encontrar bugs, problemas de ritmo e pontos de confusão."
      size="sm"
    >
      <p className="-mt-2 mb-3 text-[10px] font-black uppercase tracking-[.22em] text-primary">Closed Beta · RC1</p>
      <div className="space-y-3">
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
    </ModalShell>
  );
}
