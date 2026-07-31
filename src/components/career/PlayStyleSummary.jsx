import React from 'react';
import { getPlayStyleSummary } from '@/lib/padel';
import { getAttributeIcon } from '@/components/padel/Shared';

const STYLE_COLORS = {
  'Ofensivo': 'text-red-400 bg-red-500/10',
  'Defensivo': 'text-blue-400 bg-blue-500/10',
  'Potência': 'text-orange-400 bg-orange-500/10',
  'Tático': 'text-purple-400 bg-purple-500/10',
  'Equilibrado': 'text-primary bg-primary/10',
};

export default function PlayStyleSummary({ profile, compact = false }) {
  const summary = getPlayStyleSummary(profile);
  if (!summary) return null;

  const styleColor = STYLE_COLORS[summary.label] || STYLE_COLORS['Equilibrado'];
  const BestIcon = getAttributeIcon(summary.best.icon);
  const WorstIcon = getAttributeIcon(summary.worst.icon);

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${styleColor}`}>
          {summary.label}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
          <BestIcon className="h-2.5 w-2.5 text-primary" />
          {summary.best.label}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
          <WorstIcon className="h-2.5 w-2.5 text-destructive" />
          {summary.worst.label}
        </span>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm">Estilo de Jogo</h2>
        <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg ${styleColor}`}>
          {summary.label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{summary.description}</p>
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <BestIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase">Melhor golpe</p>
            <p className="text-xs font-bold">{summary.best.label}</p>
          </div>
          <span className="text-sm font-black text-primary tabular-nums ml-auto">{summary.best.value}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
            <WorstIcon className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase">Ponto fraco</p>
            <p className="text-xs font-bold">{summary.worst.label}</p>
          </div>
          <span className="text-sm font-black text-destructive tabular-nums ml-auto">{summary.worst.value}</span>
        </div>
      </div>
    </div>
  );
}