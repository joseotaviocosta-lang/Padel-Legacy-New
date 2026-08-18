import React, { useState } from 'react';
import { BriefcaseBusiness, Volume2, VolumeX } from 'lucide-react';
import BetaTools from '@/components/system/BetaTools';
import { loadUiSoundPreferences, playUiSound, saveUiSoundPreferences } from '@/lib/uiSound.js';

// Polish 2.1 (docs/REDESIGN_POLISH_2_1.md, objetivo 12-15): o Polish 2 tinha
// consolidado Guia/Carreiras/Som/BETA num único gatilho + BottomSheet — o QA
// visual real rejeitou essa UX (uma ação que antes era 1 clique virou 2).
// Revertido para botões individuais, mas SEM voltar ao código antigo cego:
// as correções de posicionamento/colisão do M1.1 e do hotfix do sino do M2
// (offset derivado de --pl-header-h/--pl-safe-t, folga de 1.5rem, container
// pointer-events-none + botões pointer-events-auto) continuam aqui, agora
// protegendo os 3 botões utilitários preservados: BETA, Carreiras e Som.
// Hotfix page chrome (docs/PAGE_CHROME_TUTORIAL_HOTFIX.md, item 6): o botão
// "Guia" saiu daqui — o Guia da carreira agora tem seu próprio botão
// flutuante verde no canto inferior direito (OnboardingGuide.jsx), no
// mesmo espaço que o antigo Assistente de carreira (removido) ocupava, em
// vez de dividir posição com BETA/Carreiras/Som aqui em cima.
// A central de atenção da carreira vive exclusivamente no sino do header.
// Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): memoizado porque vive no
// shell global (AppLayout) e antes re-renderizava a cada mudança de estado
// não relacionada do layout (header de perfil/ranking, sidebar, etc.) — sua
// única prop real (`onOpenCareers`) já é uma referência estável de módulo.
function FloatingUtilityRail({ onOpenCareers }) {
  const [soundEnabled, setSoundEnabled] = useState(() => loadUiSoundPreferences().enabled);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveUiSoundPreferences({ enabled: next });
    if (next) globalThis.setTimeout(() => playUiSound('notification'), 20);
  };

  return (
    <aside
      data-floating-utility-rail
      aria-label="Ferramentas auxiliares"
      className="pl-floating-utilities pointer-events-none fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(var(--pl-header-h)+var(--pl-safe-t)+1.5rem)] flex flex-col gap-2"
    >
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

export default React.memo(FloatingUtilityRail);
