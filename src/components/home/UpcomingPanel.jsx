import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Star } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { SPONSORS } from '@/lib/simulatedData';

// Fase 3 — escada de 9 tiers (era 6). Sem estas 3 entradas, um torneio
// Bronze/Circuit Finals/Legacy Finals caía no fallback `|| TIER_STYLES.Silver`
// (abaixo) — Bronze é o tier mais comum pra um jogador iniciante (24/80
// eventos), então era o caso mais visível deste widget da Home.
const TIER_STYLES = {
  'Legacy Finals':{bg:'bg-rose-500/15',text:'text-rose-300',label:'Legacy Finals'},
  Crown:{bg:'bg-amber-500/15',text:'text-amber-300',label:'Crown'}, Elite:{bg:'bg-fuchsia-500/15',text:'text-fuchsia-300',label:'Elite'},
  Masters:{bg:'bg-purple-500/15',text:'text-purple-300',label:'Masters'},
  'Circuit Finals':{bg:'bg-indigo-500/15',text:'text-indigo-300',label:'Circuit Finals'},
  Platinum:{bg:'bg-cyan-500/15',text:'text-cyan-300',label:'Platinum'},
  Gold:{bg:'bg-yellow-500/15',text:'text-yellow-300',label:'Gold'}, Silver:{bg:'bg-slate-500/15',text:'text-slate-300',label:'Silver'},
  Bronze:{bg:'bg-orange-800/15',text:'text-orange-300',label:'Bronze'},
  Exibição:{bg:'bg-teal-500/15',text:'text-teal-300',label:'Pré-Temporada'},
};

export default function UpcomingPanel({ tournaments }) {
  const upcoming = (tournaments || []).slice(0, 3);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" /> Próximos Torneios
          </h2>
          <Link to="/tournaments" className="text-xs text-primary font-medium">Ver todos</Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyStateCard icon={Trophy} message="Nenhum torneio agendado." />
        ) : (
          <div className="space-y-2">
            {upcoming.map((t, i) => {
              const tier = TIER_STYLES[t.tier] || TIER_STYLES.Silver;
              const date = new Date(t.start_date + 'T00:00:00');
              return (
                <div key={t.id || i} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-2.5">
                  <div className="text-center shrink-0 w-12">
                    <p className="text-[9px] text-muted-foreground uppercase">{date.toLocaleDateString('pt-BR', { month: 'short' })}</p>
                    <p className="font-black text-lg leading-none">{date.getDate()}</p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{t.name}</p>
                    <span className={`inline-flex items-center text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${tier.bg} ${tier.text}`}>{tier.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Star className="h-4 w-4 text-amber-400" /> Patrocinadores
        </h2>
        <div className="space-y-2">
          {SPONSORS.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-2.5">
              <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center shrink-0`}>
                <span className={`font-black ${s.accent}`}>{s.letter}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{s.name}</p>
                <p className="text-[10px] text-muted-foreground">Patrocinador {s.tier}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-yellow-400 tabular-nums">{s.contract.toLocaleString('pt-BR')}</p>
                <p className="text-[9px] text-muted-foreground uppercase">moedas/sem</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}