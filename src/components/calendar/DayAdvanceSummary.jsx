import React from 'react';
import { CalendarDays, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';
import { ModalShell } from '@/components/design-system';

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
    <ModalShell open onClose={onClose} title={summary.dateLabel} description={`${summary.theme.label} · ${summary.theme.tone}`} size="sm">
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-primary"><CalendarDays className="h-5 w-5" /><span className="text-xs font-black uppercase">Novo dia</span></div>
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
    </ModalShell>
  );
}
