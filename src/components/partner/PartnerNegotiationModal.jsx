import React, { useState } from 'react';
import { Coins, Calendar, Check } from 'lucide-react';
import { ModalShell } from '@/components/design-system';

export default function PartnerNegotiationModal({ partnership, profile, onClose, onConfirm }) {
  const [duration, setDuration] = useState(partnership?.negotiated_duration_days || 60);
  const [split, setSplit] = useState(partnership?.prize_split_pct || 50);

  if (!partnership) return null;

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Negociar Parceria"
      size="sm"
      footer={(
        <button
          onClick={() => onConfirm({ duration, split })}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" /> Confirmar Negociação
        </button>
      )}
    >
      <p className="text-xs text-muted-foreground mb-4">
        Ajuste os termos com {partnership.partner_name}. Mudanças drásticas podem afetar o entrosamento.
      </p>

      {/* Duration */}
      <div className="glass rounded-xl p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Duração (dias)</span>
          <span className="text-sm font-black ml-auto tabular-nums">{duration}</span>
        </div>
        <input
          type="range"
          min={30}
          max={180}
          step={15}
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
          <span>30 dias</span>
          <span>180 dias</span>
        </div>
      </div>

      {/* Prize split */}
      <div className="glass rounded-xl p-3 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Coins className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold">Divisão de premiação</span>
          <span className="text-sm font-black ml-auto tabular-nums">Você: {split}% · Parceiro: {100 - split}%</span>
        </div>
        <input
          type="range"
          min={30}
          max={70}
          step={5}
          value={split}
          onChange={e => setSplit(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
          <span>30% / 70%</span>
          <span>70% / 30%</span>
        </div>
      </div>

      <div className="glass rounded-xl p-3 border border-amber-500/30 bg-amber-500/5">
        <p className="text-[10px] text-amber-200">
          ⚠️ Renegociar divisão para {split}% pode {split > (partnership.prize_split_pct || 50) ? 'desagradar' : 'agradar'} seu parceiro.
          Duração maior demonstra compromisso e preserva reputação.
        </p>
      </div>
    </ModalShell>
  );
}