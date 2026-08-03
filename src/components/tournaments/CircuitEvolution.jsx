import React from 'react';
import { TrendingUp, Trophy } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { getCircuitEvolution } from '@/lib/tournaments';

export default function CircuitEvolution({ tournaments }) {
  const evolution = getCircuitEvolution(tournaments);

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" /> Evolução Histórica do Circuito
        </h2>
        {evolution.length === 0 ? (
          <EmptyStateCard icon={TrendingUp} message="Nenhum dado histórico disponível." />
        ) : (
          <div className="relative">
            {evolution.map((year, i) => {
              const prev = evolution[i - 1];
              const audienceGrowth = prev ? ((year.totalAudience - prev.totalAudience) / Math.max(1, prev.totalAudience)) * 100 : 0;
              const isLast = i === evolution.length - 1;
              return (
                <div key={year.year} className="relative flex gap-3 pb-4 last:pb-0">
                  {!isLast && <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-border" />}
                  <div className="relative z-10 h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-primary">{year.year}</span>
                  </div>
                  <div className="flex-1 glass rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold">Temporada {year.year}</span>
                      {prev && (
                        <span className={`text-[10px] font-bold ${audienceGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {audienceGrowth >= 0 ? '↑' : '↓'} {Math.abs(audienceGrowth).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-sm font-black text-primary tabular-nums">{year.totalTournaments}</p>
                        <p className="text-[8px] text-muted-foreground uppercase">Torneios</p>
                      </div>
                      <div>
                        <p className="text-sm font-black text-purple-400 tabular-nums">{(year.totalAudience / 1000).toFixed(0)}k</p>
                        <p className="text-[8px] text-muted-foreground uppercase">Audiência</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-amber-400 truncate">{year.topChampion.split(' ')[0]}</p>
                        <p className="text-[8px] text-muted-foreground uppercase">Top ({year.topChampionWins} títulos)</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {evolution.length > 0 && (
        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-amber-400" /> Resumo do Circuito
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Anos ativos</span>
              <span className="font-bold">{evolution.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total de torneios</span>
              <span className="font-bold">{evolution.reduce((s, y) => s + y.totalTournaments, 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Audiência acumulada</span>
              <span className="font-bold">{evolution.reduce((s, y) => s + y.totalAudience, 0).toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Maior audiência (ano)</span>
              <span className="font-bold text-purple-400">{evolution.reduce((max, y) => y.totalAudience > max.audience ? { audience: y.totalAudience, year: y.year } : max, { audience: 0, year: '—' }).year}</span>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}