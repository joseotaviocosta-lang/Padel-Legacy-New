import React, { useState } from 'react';
import { BriefcaseBusiness, CircleHelp, MoreHorizontal, Volume2, VolumeX } from 'lucide-react';
import BetaTools from '@/components/system/BetaTools';
import { BottomSheet } from '@/components/design-system';
import { loadUiSoundPreferences, playUiSound, saveUiSoundPreferences } from '@/lib/uiSound.js';

// Polish 2 (docs/REDESIGN_POLISH_2.md, objetivo 4): antes eram 3 ícones
// sempre visíveis aqui (BETA, carreiras, som) + o "?" do guia (OnboardingGuide)
// + o Assistente da carreira — até 5 controles flutuantes competindo com o
// conteúdo. Auditoria de função: BETA/carreiras/som/guia são utilidades
// secundárias, de uso pouco frequente — viraram um único gatilho discreto
// que abre um BottomSheet (safe-area/Android Back/Escape/foco já resolvidos
// por useOverlayBehavior, nada reimplementado aqui). O Assistente da carreira
// continua separado (badge de prioridades, ação primária recomendada pelo
// enunciado desta fase).
function DockRow({ icon: Icon, label, onClick, tone = 'default' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition-colors hover:bg-secondary/60 ${tone === 'amber' ? 'text-amber-300' : 'text-foreground'}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone === 'amber' ? 'bg-amber-400/10' : 'bg-secondary/60'}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      {label}
    </button>
  );
}

export default function FloatingUtilityRail({ onOpenCareers }) {
  const [open, setOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => loadUiSoundPreferences().enabled);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveUiSoundPreferences({ enabled: next });
    if (next) globalThis.setTimeout(() => playUiSound('notification'), 20);
  };

  function openGuide() {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('padel:open-career-guide'));
  }

  function openCareers() {
    setOpen(false);
    onOpenCareers?.();
  }

  return (
    <>
      {/* M1.1 (docs/MOBILE_M1_1_DEVICE_HOTFIX.md): offset derivado de
          --pl-header-h (não um número solto) para nunca sobrepor o header
          real em Android. pointer-events-none no <aside> + pointer-events-auto
          no botão é defesa em profundidade herdada do hotfix anterior. */}
      <aside
        data-floating-utility-rail
        aria-label="Ferramentas auxiliares"
        className="pl-floating-utilities pointer-events-none fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(var(--pl-header-h)+var(--pl-safe-t)+0.75rem)] flex flex-col gap-2"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir ferramentas"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Ferramentas"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary"
        >
          <MoreHorizontal className="h-4.5 w-4.5" />
        </button>
      </aside>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Ferramentas" description="Guia, carreiras, som e diagnóstico da beta.">
        <div className="space-y-1">
          <DockRow icon={CircleHelp} label="Guia da carreira" onClick={openGuide} />
          <DockRow icon={BriefcaseBusiness} label="Gerenciar carreiras" onClick={openCareers} />
          <DockRow
            icon={soundEnabled ? Volume2 : VolumeX}
            label={soundEnabled ? 'Som ligado' : 'Som desligado'}
            onClick={toggleSound}
          />
          <div className="pt-1">
            <BetaTools />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
