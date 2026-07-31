import React from 'react';
import { X, CalendarDays, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';

function ChangeBadge({ item }) {
  const visuallyPositive = item.inverse ? item.value < 0 : item.value > 0;
  const Icon = item.value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-xl bg-secondary/35 p-3">
      <p className="text-[10px] uppercase font-bold text-muted-foreground">{item.label}</p>
      <p className={`mt-1 flex items-center gap-1 font-black ${visuallyPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
        <Icon className="h-4 w-4" /> {item.value > 0 ? '+' : ''}{item.value}
      </p>
    </div>
  );
}

export default function DayAdvanceSummary({ summary, onClose, onOpenCalendar }) {
  if (!summary) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl border border-border/70 bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border/50 p-5">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <CalendarDays className="h-5 w-5" />
              <span className="text-xs font-black uppercase">Novo dia</span>
            </div>
            <h2 className="mt-1 text-xl font-black capitalize">{summary.dateLabel}</h2>
            <p className="text-sm text-muted-foreground">{summary.theme.label} · {summary.theme.tone}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-secondary" aria-label="Fechar resumo do dia">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-black"><Sparkles className="h-4 w-4 text-amber-400" /> Resumo</h3>
            <div className="space-y-2">
              {summary.highlights.map((highlight, index) => (
                <div key={index} className="rounded-xl bg-secondary/30 px-3 py-2 text-sm">{highlight}</div>
              ))}
            </div>
          </section>
          {summary.changes.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-black">Impacto na carreira</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {summary.changes.map(item => <ChangeBadge key={item.key} item={item} />)}
              </div>
            </section>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl bg-secondary px-4 py-3 text-sm font-bold hover:bg-secondary/80">Continuar</button>
            <button onClick={onOpenCalendar} className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground hover:opacity-90">Ver calendário</button>
          </div>
        </div>
      </div>
    </div>
  );
}
