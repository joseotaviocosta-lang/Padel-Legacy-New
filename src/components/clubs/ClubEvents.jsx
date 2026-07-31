import React, { useState } from 'react';
import { Calendar, Trophy, GraduationCap, Star, Users, Plus, X } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { EVENT_TYPES } from '@/lib/clubs';

const TYPE_ICONS = { Users, Trophy, GraduationCap, Star };
const TYPE_STYLES = {
  social: 'bg-blue-500/15 text-blue-300',
  tournament: 'bg-amber-500/15 text-amber-300',
  clinic: 'bg-cyan-500/15 text-cyan-300',
  exhibition: 'bg-purple-500/15 text-purple-300',
};

export default function ClubEvents({ events, isOwner, onHost, busy }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', event_type: 'social', description: '', prize_coins: 0 });

  const sorted = [...(events || [])].sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''));

  function submit() {
    if (!form.name) return;
    onHost({ ...form, prize_coins: Number(form.prize_coins) || 0 });
    setShowForm(false);
    setForm({ name: '', event_type: 'social', description: '', prize_coins: 0 });
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> Eventos</h2>
          {isOwner && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Organizar
            </button>
          )}
        </div>
        {sorted.length === 0 ? (
          <EmptyStateCard icon={Calendar} message="Nenhum evento agendado." />
        ) : (
          <div className="space-y-2">
            {sorted.map((e, i) => {
              const type = EVENT_TYPES.find(t => t.id === e.event_type) || EVENT_TYPES[0];
              const Icon = TYPE_ICONS[type.icon] || Calendar;
              return (
                <div key={e.id || i} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3">
                  <div className="text-center shrink-0 w-12">
                    <p className="text-[9px] text-muted-foreground uppercase">
                      {(() => { try { return new Date(e.event_date + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short' }); } catch { return '—'; } })()}
                    </p>
                    <p className="font-black text-lg leading-none">
                      {(() => { try { return new Date(e.event_date + 'T00:00:00').getDate(); } catch { return '—'; } })()}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${TYPE_STYLES[e.event_type] || TYPE_STYLES.social}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{e.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{type.name}{e.prize_coins > 0 ? ` · ${e.prize_coins.toLocaleString('pt-BR')} moedas` : ''}</p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${e.status === 'finalizado' ? 'bg-secondary/40 text-muted-foreground' : 'bg-primary/15 text-primary'}`}>
                    {e.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={() => setShowForm(false)}>
          <div className="glass rounded-t-3xl md:rounded-3xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black">Organizar Evento</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Nome</label>
                <input className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border/60 text-sm focus:outline-none focus:border-primary/50" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Torneio Interno de Verão" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Tipo</label>
                <div className="flex gap-2 flex-wrap">
                  {EVENT_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm({ ...form, event_type: t.id })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${form.event_type === t.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-muted-foreground'}`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Premiação (moedas)</label>
                <input type="number" className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border/60 text-sm focus:outline-none focus:border-primary/50" value={form.prize_coins} onChange={e => setForm({ ...form, prize_coins: e.target.value })} />
              </div>
              <button onClick={submit} disabled={busy === 'event' || !form.name} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50">
                {busy === 'event' ? 'Criando...' : 'Criar evento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}