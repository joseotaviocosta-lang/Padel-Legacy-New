import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Users } from 'lucide-react';
import { selectPosition } from '@/lib/career';
import { useToast } from '@/components/ui/use-toast';
import { useOverlayBehavior } from '@/components/design-system/useOverlayBehavior';

const POSITIONS = [
  {
    id: 'direita',
    label: 'Lado Direito',
    icon: ArrowRight,
    description: 'Foco em controle, tática e bandejas. O lado mais estratégico da quadra.',
  },
  {
    id: 'esquerda',
    label: 'Lado Esquerdo',
    icon: ArrowLeft,
    description: 'Foco em potência, smashes e ataque. O lado mais ofensivo da quadra.',
  },
];

export default function PositionSelection({ profile, onPositionSelected }) {
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  // Etapa obrigatória do onboarding, sem ação de fechar — por isso não usa
  // ModalShell (que sempre expõe um X de fechar). Reaproveita o mesmo hook
  // de segurança (scroll-lock/focus-trap/retorno de foco) que ModalShell usa,
  // com ESC desativado (Fase 8 — auditoria de modais).
  const { panelRef } = useOverlayBehavior({ open: true, onClose: () => {}, closeOnEscape: false });

  async function choose(position) {
    setSaving(true);
    try {
      const updated = await selectPosition(profile, position);
      onPositionSelected?.(updated);
      toast({ title: 'Posição definida!', description: `Você joga no ${position === 'direita' ? 'lado direito' : 'lado esquerdo'}.` });
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Escolha sua posição">
      <div ref={panelRef} className="glass max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl p-6">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-primary/15 items-center justify-center mb-3">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-black">Escolha sua posição</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            No padel, cada jogador ocupa um lado da quadra. Sua dupla sempre jogará no lado oposto ao seu.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {POSITIONS.map(pos => {
            const Icon = pos.icon;
            return (
              <button
                key={pos.id}
                onClick={() => choose(pos.id)}
                disabled={saving}
                className="glass rounded-2xl p-5 flex flex-col items-center gap-2 border-2 border-transparent hover:border-primary/50 hover:bg-primary/5 transition-all group"
              >
                <Icon className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-base font-black">{pos.label}</span>
                <p className="text-[10px] text-muted-foreground text-center leading-relaxed">{pos.description}</p>
              </button>
            );
          })}
        </div>

        {saving && <p className="text-center text-xs text-muted-foreground">Salvando...</p>}
      </div>
    </div>
  );
}