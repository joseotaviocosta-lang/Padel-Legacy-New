import React from 'react';
import { BarChart3, Trophy, Crown, TrendingUp, Users, Coins, Zap, Star } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { computePlayerTournamentStats, computeCircuitStats } from '@/lib/tournaments';

export default function TournamentStats({ profile, tournaments, matches }) {
  const playerStats = computePlayerTournamentStats(profile, matches);
  const circuit = computeCircuitStats(tournaments);

  const playerCards = [
    { icon: Trophy, label: 'Disputados', value: playerStats.played, color: 'text-primary' },
    { icon: Crown, label: 'Títulos', value: playerStats.titles, color: 'text-amber-400' },
    { icon: TrendingUp, label: 'Aproveit.', value: `${playerStats.winRate}%`, color: 'text-cyan-400' },
    { icon: Coins, label: 'Premiação', value: playerStats.totalPrizes.toLocaleString('pt-BR'), color: 'text-yellow-400' },
  ];

  const circuitCards = [
    { icon: Trophy, label: 'Finalizados', value: circuit.totalFinished, color: 'text-primary' },
    { icon: Users, label: 'Audiência Total', value: circuit.totalAudience.toLocaleString('pt-BR'), color: 'text-purple-400' },
    { icon: Crown, label: 'Crown', value: circuit.byTier.Crown || 0, color: 'text-amber-400' },
    { icon: Star, label: 'Elite', value: circuit.byTier.Elite || 0, color: 'text-fuchsia-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Player stats */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" /> Suas Estatísticas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {playerCards.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="text-center rounded-xl bg-secondary/30 p-3">
                <Icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
                <p className="text-lg font-black tabular-nums">{s.value}</p>
                <p className="text-[9px] text-muted-foreground uppercase">{s.label}</p>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Circuit stats */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-cyan-400" /> Estatísticas do Circuito
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {circuitCards.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="text-center rounded-xl bg-secondary/30 p-3">
                <Icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
                <p className="text-lg font-black tabular-nums">{s.value}</p>
                <p className="text-[9px] text-muted-foreground uppercase">{s.label}</p>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Top champions */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Crown className="h-4 w-4 text-amber-400" /> Maiores Campeões
        </h2>
        {circuit.topChampions.length === 0 ? (
          <EmptyStateCard icon={Crown} message="Nenhum campeão registrado ainda." />
        ) : (
          <div className="space-y-2">
            {circuit.topChampions.map((c, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-2.5">
                <div className="text-center w-7 shrink-0">
                  {i < 3 && <Crown className={`h-4 w-4 mx-auto ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : 'text-orange-400'}`} />}
                  <span className="text-[10px] font-black text-muted-foreground">{i + 1}º</span>
                </div>
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-amber-400">{c.name[0]}</span>
                </div>
                <span className="text-xs font-semibold flex-1 truncate">{c.name}</span>
                <span className="text-sm font-black text-amber-400 tabular-nums">{c.wins}</span>
                <span className="text-[9px] text-muted-foreground">títulos</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}