import React, { useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { ChevronUp, Sparkles, Rocket } from 'lucide-react';
import { ATTRIBUTES } from '@/lib/padel';
import { getAttributeIcon } from '@/components/padel/Shared';
import { useToast } from '@/components/ui/use-toast';
import { useOverlayBehavior } from '@/components/design-system/useOverlayBehavior';

export default function OnboardingAttributes({ profile, onComplete }) {
  const [points, setPoints] = useState(profile?.unspent_attribute_points || 0);
  const [busy, setBusy] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(profile);
  const { toast } = useToast();
  // Mesma justificativa de PositionSelection.jsx: etapa obrigatória sem ação
  // de fechar, então reaproveita useOverlayBehavior diretamente em vez de
  // ModalShell (Fase 8 — auditoria de modais).
  const { panelRef } = useOverlayBehavior({ open: true, onClose: () => {}, closeOnEscape: false });

  async function addPoint(attrKey) {
    if (points <= 0) return;
    setBusy(attrKey);
    try {
      const updated = await localGame.entities.PlayerProfile.update(currentProfile.id, {
        [attrKey]: Math.min(100, (currentProfile[attrKey] || 0) + 1),
        unspent_attribute_points: points - 1,
      });
      setCurrentProfile(updated);
      setPoints(points - 1);
      onComplete?.(updated);
      if (points - 1 === 0) {
        toast({ title: 'Jogador pronto!', description: 'Sua jornada começa agora. Vá treinar!' });
      }
    } catch (e) { console.error(e); }
    finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Distribua seus atributos">
      <div ref={panelRef} className="glass rounded-3xl w-full max-w-md p-6 space-y-4 my-8">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-primary/15 items-center justify-center mb-3">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-black">Distribua seus atributos</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Você tem {points} ponto{points !== 1 ? 's' : ''} para distribuir livremente. Escolha bem — depois disso, só evoluirá treinando e jogando torneios!
          </p>
        </div>

        <div className="text-center">
          <span className="text-4xl font-black text-primary tabular-nums">{points}</span>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">pontos restantes</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ATTRIBUTES.map(attr => {
            const Icon = getAttributeIcon(attr.icon);
            return (
              <button
                key={attr.key}
                onClick={() => addPoint(attr.key)}
                disabled={busy !== null || points <= 0}
                className="glass rounded-xl p-2.5 flex items-center gap-2 hover:bg-primary/10 transition-colors disabled:opacity-50 border border-transparent hover:border-primary/30"
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium flex-1 text-left truncate">{attr.label}</span>
                <span className="text-xs font-black text-primary tabular-nums">{currentProfile[attr.key] || 0}</span>
                <ChevronUp className="h-3 w-3 text-primary" />
              </button>
            );
          })}
        </div>

        {points === 0 && (
          <div className="text-center pt-2">
            <div className="inline-flex items-center gap-2 text-primary font-bold text-sm">
              <Rocket className="h-4 w-4" /> Tudo pronto! Sua jornada começa agora.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}