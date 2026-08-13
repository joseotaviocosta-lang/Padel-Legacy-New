import React, { useState } from 'react';
import { BriefcaseBusiness, CircleHelp, Volume2, VolumeX } from 'lucide-react';
import BetaTools from '@/components/system/BetaTools';
import { loadUiSoundPreferences, playUiSound, saveUiSoundPreferences } from '@/lib/uiSound.js';

// Polish 2.1 (docs/REDESIGN_POLISH_2_1.md, objetivo 12-15): o Polish 2 tinha
// consolidado Guia/Carreiras/Som/BETA num único gatilho + BottomSheet — o QA
// visual real rejeitou essa UX (uma ação que antes era 1 clique virou 2).
// Revertido para botões individuais, mas SEM voltar ao código antigo cego:
// as correções de posicionamento/colisão do M1.1 e do hotfix do sino do M2
// (offset derivado de --pl-header-h/--pl-safe-t, folga de 1.5rem, container
// pointer-events-none + botões pointer-events-auto) continuam aqui, agora
// protegendo 4 botões em vez de 1. O Assistente da carreira (CareerAssistant)
// continua um componente totalmente separado, fora deste arquivo.
export default function FloatingUtilityRail({ onOpenCareers }) {
  const [soundEnabled, setSoundEnabled] = useState(() => loadUiSoundPreferences().enabled);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveUiSoundPreferences({ enabled: next });
    if (next) globalThis.setTimeout(() => playUiSound('notification'), 20);
  };

  function openGuide() {
    window.dispatchEvent(new CustomEvent('padel:open-career-guide'));
  }

  return (
    <aside
      data-floating-utility-rail
      aria-label="Ferramentas auxiliares"
      className="pl-floating-utilities pointer-events-none fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(var(--pl-header-h)+var(--pl-safe-t)+1.5rem)] flex flex-col gap-2"
    >
      <button
        type="button"
        onClick={openGuide}
        aria-label="Abrir guia da carreira"
        title="Guia da carreira"
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary"
      >
        <CircleHelp className="h-4.5 w-4.5" />
      </button>
      <div className="pointer-events-auto rounded-2xl border border-amber-400/20 bg-background/88 p-1 shadow-xl backdrop-blur-xl" title="Central BETA">
        <BetaTools compact />
      </div>
      <button
        type="button"
        onClick={onOpenCareers}
        aria-label="Gerenciar carreiras"
        title="Carreiras"
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary"
      >
        <BriefcaseBusiness className="h-4.5 w-4.5" />
      </button>
      <button
        type="button"
        onClick={toggleSound}
        aria-label={soundEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'}
        title={soundEnabled ? 'Som ligado' : 'Som desligado'}
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary"
      >
        {soundEnabled ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
      </button>
    </aside>
  );
}
