import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Crown,
  Flame,
  Loader2,
  Medal,
  Swords,
  Target,
  TrendingUp,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { GlassCard } from '@/components/padel/ui';
import { getWorldRank } from '@/lib/padel';
import {
  buildAdaptiveSeasonGoals,
  buildSeasonSnapshot,
  getSeasonGrade,
  getSeasonWindow,
} from '@/lib/seasonProgress';

const ICONS = {
  matches: Swords,
  wins: Target,
  titles: Crown,
  points: TrendingUp,
  rank: Medal,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function SeasonPanel({ profile, worldRank: suppliedWorldRank }) {
  const [matches, setMatches] = useState([]);
  const [resolvedWorldRank, setResolvedWorldRank] = useState(suppliedWorldRank || { rank: 0, total: 0 });
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  const seasonWindow = useMemo(() => getSeasonWindow(profile?.career_date), [profile?.career_date]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profile) return;
      setLoading(true);
      try {
        const [matchList, tournamentList, rank] = await Promise.all([
          localGame.entities.Match.list('-date', 500),
          localGame.entities.Tournament.list('-start_date', 500),
          suppliedWorldRank?.rank ? Promise.resolve(suppliedWorldRank) : getWorldRank(profile),
        ]);
        if (active) {
          setMatches(matchList || []);
          setTournaments(tournamentList || []);
          setResolvedWorldRank(rank || { rank: 0, total: 0 });
        }
      } catch (error) {
        console.warn('[Game Core 3.3] Não foi possível carregar os dados completos da temporada:', error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.id, seasonWindow.year, suppliedWorldRank?.rank, suppliedWorldRank?.total]);

  const snapshot = useMemo(
    () => buildSeasonSnapshot({ profile, matches, tournaments, worldRank: resolvedWorldRank }),
    [profile, matches, tournaments, resolvedWorldRank],
  );
  const goals = useMemo(() => buildAdaptiveSeasonGoals(profile, snapshot), [profile, snapshot]);
  const grade = useMemo(() => getSeasonGrade(goals), [goals]);

  if (!profile) return null;

  const mainGoal = goals.find((goal) => !(goal.done ?? goal.value >= goal.target)) || goals[goals.length - 1];
  const mainGoalDone = mainGoal.done ?? mainGoal.value >= mainGoal.target;
  const pace = snapshot.progress > 0 ? Math.round((grade.completed / goals.length) * 100 - snapshot.progress) : 0;
  const paceLabel = pace >= 10 ? 'acima do ritmo' : pace <= -20 ? 'abaixo do ritmo' : 'no ritmo esperado';

  return (
    <GlassCard>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Temporada {snapshot.year}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Metas adaptadas ao nível {profile.level || 'Iniciante'} · {snapshot.remaining} dias restantes
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2">
            <span className="text-2xl font-black text-primary leading-none">{grade.grade}</span>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Projeção</p>
              <p className="text-xs font-semibold">{grade.label}</p>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Progresso do calendário</span>
            <span className="font-semibold tabular-nums">{snapshot.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${snapshot.progress}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Partidas" value={snapshot.matchesPlayed} />
          <Metric label="Vitórias" value={snapshot.wins} detail={`${snapshot.winRate}% aproveitamento`} />
          <Metric label="Títulos" value={snapshot.titles} detail={`${snapshot.finals} finais`} />
          <Metric label="Sequência" value={snapshot.currentStreak} detail={`melhor: ${snapshot.bestStreak}`} icon={Flame} />
        </div>

        <div className="space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Atualizando temporada…
            </div>
          ) : (
            goals.map((goal) => {
              const Icon = ICONS[goal.type] || Target;
              const done = goal.done ?? goal.value >= goal.target;
              const pct = done ? 100 : clamp(Math.round((goal.value / Math.max(1, goal.target)) * 100), 0, 100);
              const valueLabel = goal.displayValue || `${Math.min(goal.value, goal.target).toLocaleString('pt-BR')}/${goal.target.toLocaleString('pt-BR')}`;
              return (
                <div key={goal.id} className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${done ? 'bg-primary/15' : 'bg-secondary/50'}`}>
                    <Icon className={`h-4 w-4 ${done ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className={`truncate text-xs font-medium ${done ? 'text-primary' : 'text-foreground'}`}>{goal.label}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{valueLabel}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-primary' : 'bg-primary/55'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-secondary/25 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                {mainGoalDone ? 'Todas as metas concluídas' : 'Próximo foco'}
              </p>
              <p className="text-sm font-semibold">{mainGoal.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{mainGoal.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Você está <span className="font-semibold text-foreground">{paceLabel}</span> para este ponto da temporada.
              </p>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-xl border border-border/50 bg-secondary/25 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-3.5 w-3.5 text-primary" /> : null}
      </div>
      <p className="mt-1 text-lg font-black tabular-nums">{Number(value || 0).toLocaleString('pt-BR')}</p>
      {detail ? <p className="text-[10px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
