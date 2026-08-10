import React, { useState } from 'react';
import { BriefcaseBusiness, Volume2, VolumeX } from 'lucide-react';
import BetaTools from '@/components/system/BetaTools';
import { loadUiSoundPreferences, playUiSound, saveUiSoundPreferences } from '@/lib/uiSound.js';

export default function FloatingUtilityRail({ onOpenCareers }) {
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
      className="pl-floating-utilities fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(4.25rem+env(safe-area-inset-top))] flex flex-col gap-2 md:top-20"
    >
      <div className="rounded-2xl border border-amber-400/20 bg-background/88 p-1 shadow-xl backdrop-blur-xl" title="Central BETA">
        <BetaTools compact />
      </div>
      <button
        type="button"
        onClick={onOpenCareers}
        aria-label="Gerenciar carreiras"
        title="Carreiras"
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary"
      >
        <BriefcaseBusiness className="h-4.5 w-4.5" />
      </button>
      <button
        type="button"
        onClick={toggleSound}
        aria-label={soundEnabled ? 'Desativar sons da interface' : 'Ativar sons da interface'}
        title={soundEnabled ? 'Som ligado' : 'Som desligado'}
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary"
      >
        {soundEnabled ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
      </button>
    </aside>
  );
}
