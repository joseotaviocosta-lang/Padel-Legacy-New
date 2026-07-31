import React from 'react';
import { JOURNALISTS, toneEmoji } from '@/lib/pressData';

const PERSONALITY_LABELS = {
  critico: 'Crítico', sensacionalista: 'Sensacionalista', tecnico: 'Técnico',
  passional: 'Passional', neutro: 'Neutro', provocador: 'Provocador',
};

const SPECIALTY_LABELS = {
  tatico: 'Tático', social: 'Social', estatistico: 'Estatístico',
  polemico: 'Polêmico', investigativo: 'Investigativo',
};

const BIAS_LABELS = {
  ally: { label: 'Aliado', color: 'text-green-400 bg-green-500/15' },
  friendly: { label: 'Amigável', color: 'text-primary bg-primary/15' },
  neutral: { label: 'Neutro', color: 'text-muted-foreground bg-secondary/50' },
  critical: { label: 'Crítico', color: 'text-amber-400 bg-amber-500/15' },
  hostile: { label: 'Hostil', color: 'text-red-400 bg-red-500/15' },
};

function getBiasLabel(bias) {
  if (bias >= 30) return BIAS_LABELS.ally;
  if (bias >= 10) return BIAS_LABELS.friendly;
  if (bias <= -30) return BIAS_LABELS.hostile;
  if (bias <= -10) return BIAS_LABELS.critical;
  return BIAS_LABELS.neutral;
}

export default function JournalistCard({ journalist, onClick }) {
  const bias = journalist.bias_toward_player || 0;
  const biasInfo = getBiasLabel(bias);

  return (
    <div
      onClick={onClick}
      className="glass rounded-2xl p-4 hover-lift cursor-pointer"
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{journalist.avatar_emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{journalist.name}</p>
          <p className="text-[10px] text-muted-foreground">{journalist.outlet}</p>
          <p className="text-[9px] text-muted-foreground">{journalist.nationality}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className="text-[8px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
          {PERSONALITY_LABELS[journalist.personality]}
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wide text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
          {SPECIALTY_LABELS[journalist.specialty]}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${biasInfo.color}`}>
          {biasInfo.label}
        </span>
        {(journalist.interviews_done || 0) > 0 && (
          <span className="text-[9px] text-muted-foreground">{journalist.interviews_done} entrevistas</span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground italic mt-2 line-clamp-2">"{journalist.signature_style}"</p>
    </div>
  );
}