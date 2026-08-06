import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const toneClasses = {
  critical: 'border-destructive/35 bg-destructive/[0.07] text-destructive',
  high: 'border-amber-500/35 bg-amber-500/[0.07] text-amber-400',
  medium: 'border-primary/30 bg-primary/[0.06] text-primary',
  low: 'border-border/70 bg-secondary/25 text-muted-foreground',
};

export default function CareerDecisionCenter({ center }) {
  const [expanded, setExpanded] = useState(false);
  const decisions = center?.decisions || [];
  const visible = expanded ? decisions : decisions.slice(0, 3);

  if (!decisions.length) {
    return (
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.055] p-4" aria-label="Centro de decisões">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12"><CheckCircle2 className="h-5 w-5 text-emerald-400" /></div>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">Centro de decisões</p><h2 className="text-sm font-black">Nenhuma decisão urgente</h2><p className="mt-0.5 text-xs text-muted-foreground">Sua carreira está organizada. Você pode treinar, descansar ou avançar o calendário.</p></div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/70" aria-labelledby="career-decisions-title">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><ClipboardCheck className="h-5 w-5 text-primary" /></div>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Living Career</p><h2 id="career-decisions-title" className="text-sm font-black">Decisões da carreira</h2><p className="text-[10px] text-muted-foreground">{center.urgentCount} urgente{center.urgentCount === 1 ? '' : 's'} · {center.totalCount} no total</p></div>
        </div>
        {center.urgentCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/12 px-2.5 py-1 text-[10px] font-black text-destructive"><AlertTriangle className="h-3 w-3" />Atenção</span>}
      </div>

      <div className="space-y-2 p-3">
        {visible.map((decision) => (
          <Link key={decision.id} to={decision.route} className={`group flex items-start gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${toneClasses[decision.priority] || toneClasses.low}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-black uppercase tracking-wider opacity-85">{decision.category}</span><span className="text-[9px] uppercase text-muted-foreground">{decision.priority === 'critical' ? 'Crítica' : decision.priority === 'high' ? 'Alta' : 'Planejamento'}</span></div>
              <p className="mt-1 text-xs font-black text-foreground">{decision.title}</p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{decision.description}</p>
            </div>
            <div className="mt-1 flex shrink-0 items-center gap-1 text-[10px] font-bold opacity-80 group-hover:opacity-100">{decision.actionLabel}<ArrowRight className="h-3.5 w-3.5" /></div>
          </Link>
        ))}
      </div>

      {decisions.length > 3 && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-center gap-2 border-t border-border/60 px-4 py-3 text-xs font-bold text-muted-foreground hover:bg-secondary/30 hover:text-foreground">
          {expanded ? 'Mostrar menos' : `Ver mais ${decisions.length - 3} decisão${decisions.length - 3 === 1 ? '' : 'ões'}`}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </section>
  );
}
