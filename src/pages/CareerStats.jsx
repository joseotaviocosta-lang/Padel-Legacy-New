import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  BarChart3, Trophy, Swords, Target, Flame, TrendingUp, Percent, Activity,
  CalendarDays, Medal, Crown, ShieldCheck, Gauge, Users, MapPin
} from 'lucide-react';
import { PageContainer, PageHeader, GlassCard, EmptyStateCard, LoadingScreen } from '@/components/padel/ui';
import { StatCard } from '@/components/padel/Shared';
import { ATTRIBUTES, overallRating, winRate, levelForXp, nextLevelXp, prevLevelXp, levelProgress } from '@/lib/padel';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, PieChart, Pie, Cell, Tooltip } from 'recharts';

const CHART_COLORS = {
  primary: 'hsl(84 81% 52%)',
  accent: 'hsl(199 89% 48%)',
  amber: 'hsl(43 90% 60%)',
  red: 'hsl(0 72% 51%)',
  muted: 'hsl(220 12% 60%)',
  border: 'hsl(228 20% 17%)',
};

const normalize = value => String(value || '').trim().toLocaleLowerCase('pt-BR');

function isPlayerInTeam(team, names) {
  if (!Array.isArray(team)) return false;
  return team.some(name => names.has(normalize(name)));
}

function matchResult(match, names) {
  const inA = isPlayerInTeam(match.team_a, names);
  const inB = isPlayerInTeam(match.team_b, names);
  if (!inA && !inB) return null;
  const won = (inA && match.winner === 'A') || (inB && match.winner === 'B');
  return { won, inA, opponent: inA ? match.team_b : match.team_a };
}

function parseDate(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tournamentRound(notes = '') {
  const text = normalize(notes);
  if (text.includes('final') && !text.includes('semifinal')) return 'Final';
  if (text.includes('semifinal')) return 'Semifinal';
  if (text.includes('quart')) return 'Quartas';
  if (text.includes('oitav')) return 'Oitavas';
  return 'Partida';
}

function calculateStreaks(results) {
  let current = 0;
  let best = 0;
  let unbeaten = 0;
  for (const result of results) {
    if (result.won) {
      current += 1;
      unbeaten += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
      unbeaten = 0;
    }
  }
  const latest = [...results].reverse();
  let currentWin = 0;
  for (const result of latest) {
    if (!result.won) break;
    currentWin += 1;
  }
  return { currentWin, best };
}

function ResultPill({ won }) {
  return (
    <span className={`h-8 w-8 rounded-lg inline-flex items-center justify-center font-black text-xs border ${
      won ? 'bg-primary/15 text-primary border-primary/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
    }`}>
      {won ? 'V' : 'D'}
    </span>
  );
}

export default function CareerStats() {
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [period, setPeriod] = useState('career');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const user = await base44.auth.me();
        const profiles = await base44.entities.PlayerProfile.filter({ created_by_id: user.id });
        const currentProfile = profiles?.[0] || null;
        setProfile(currentProfile);

        const [allMatches, allTournaments] = await Promise.all([
          base44.entities.Match.list('-date', 500).catch(() => []),
          base44.entities.Tournament.list('-date', 250).catch(() => []),
        ]);
        setMatches(allMatches || []);
        setTournaments(allTournaments || []);
      } catch (e) {
        console.error('CareerStats', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const analytics = useMemo(() => {
    if (!profile) return null;
    const names = new Set([
      normalize(profile.sport_name), normalize(profile.name), normalize(profile.full_name)
    ].filter(Boolean));
    const careerDate = parseDate(profile.career_date) || new Date();
    const seasonYear = careerDate.getFullYear();

    const playerMatches = matches
      .map(match => ({ match, result: matchResult(match, names), date: parseDate(match.date) }))
      .filter(item => item.result)
      .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

    const filtered = period === 'season'
      ? playerMatches.filter(item => item.date?.getFullYear() === seasonYear)
      : playerMatches;

    const wins = filtered.filter(item => item.result.won).length;
    const losses = filtered.length - wins;
    const streaks = calculateStreaks(filtered.map(item => item.result));
    const finals = filtered.filter(item => tournamentRound(item.match.notes) === 'Final');
    const finalWins = finals.filter(item => item.result.won).length;

    const opponents = new Map();
    filtered.forEach(item => {
      const opponentName = (item.result.opponent || []).join(' & ') || 'Adversário';
      const key = normalize(opponentName);
      const current = opponents.get(key) || { name: opponentName, games: 0, wins: 0 };
      current.games += 1;
      if (item.result.won) current.wins += 1;
      opponents.set(key, current);
    });
    const mostFaced = [...opponents.values()].sort((a, b) => b.games - a.games || b.wins - a.wins)[0] || null;

    const locations = new Map();
    filtered.forEach(item => {
      const location = item.match.location || item.match.tournament_name || 'Sem local';
      locations.set(location, (locations.get(location) || 0) + 1);
    });
    const favoriteLocation = [...locations.entries()].sort((a, b) => b[1] - a[1])[0] || null;

    const titleNames = new Set((profile.titles || []).map(String));
    tournaments.forEach(tournament => {
      const champion = normalize(tournament.champion);
      if ([...names].some(name => champion.includes(name)) && tournament.name) titleNames.add(tournament.name);
    });

    return {
      seasonYear,
      filtered,
      wins,
      losses,
      winPct: filtered.length ? Math.round((wins / filtered.length) * 100) : 0,
      streaks,
      finals: finals.length,
      finalWins,
      mostFaced,
      favoriteLocation,
      titles: [...titleNames],
      recent: filtered.slice(-10).reverse(),
    };
  }, [profile, matches, tournaments, period]);

  if (loading) return <LoadingScreen />;
  if (!profile) return <EmptyStateCard icon={BarChart3} message="Crie seu perfil para ver suas estatísticas." />;

  const radarData = ATTRIBUTES.map(a => ({ attribute: a.label, value: Number(profile[a.key]) || 0, fullMark: 100 }));
  const wins = analytics?.wins || 0;
  const losses = analytics?.losses || 0;
  const winLossData = [
    { name: 'Vitórias', value: wins, color: CHART_COLORS.primary },
    { name: 'Derrotas', value: losses, color: CHART_COLORS.red },
  ];
  const level = levelForXp(profile.xp || 0);
  const xpPct = levelProgress(profile.xp || 0);
  const prevXp = prevLevelXp(profile.xp || 0);
  const nextXp = nextLevelXp(profile.xp || 0);
  const topAttributes = [...ATTRIBUTES]
    .map(a => ({ ...a, value: Number(profile[a.key]) || 0 }))
    .sort((a, b) => b.value - a.value);

  return (
    <PageContainer>
      <PageHeader icon={BarChart3} title="Estatísticas" subtitle="Central de desempenho e memória da carreira" />

      <div className="space-y-5">
        <div className="glass rounded-2xl p-1.5 flex gap-1 max-w-sm">
          <button onClick={() => setPeriod('career')} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${period === 'career' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Carreira completa
          </button>
          <button onClick={() => setPeriod('season')} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${period === 'season' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Temporada {analytics?.seasonYear}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-stagger">
          <StatCard icon={Swords} label="Partidas" value={analytics?.filtered.length || 0} />
          <StatCard icon={Percent} label="Aproveit." value={`${analytics?.winPct || 0}%`} accent="text-cyan-400" />
          <StatCard icon={Flame} label="Sequência atual" value={`${analytics?.streaks.currentWin || 0} V`} accent="text-amber-400" />
          <StatCard icon={Activity} label="Overall" value={overallRating(profile)} accent="text-purple-400" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniMetric icon={Trophy} label="Títulos" value={analytics?.titles.length || profile.tournaments_won || 0} />
          <MiniMetric icon={Medal} label="Finais" value={analytics?.finals || 0} detail={`${analytics?.finalWins || 0} vencidas`} />
          <MiniMetric icon={Crown} label="Melhor sequência" value={`${analytics?.streaks.best || 0} V`} />
          <MiniMetric icon={ShieldCheck} label="Derrotas" value={losses} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <GlassCard>
            <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Target className="h-4 w-4 text-primary" /> Atributos</h2>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={CHART_COLORS.border} />
                <PolarAngleAxis dataKey="attribute" tick={{ fill: CHART_COLORS.muted, fontSize: 9 }} />
                <Radar dataKey="value" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.3} strokeWidth={2} />
                <Tooltip contentStyle={{ background: 'hsl(228 30% 9%)', border: '1px solid hsl(228 20% 17%)', borderRadius: '0.75rem', fontSize: '12px' }} />
              </RadarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard>
            <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Trophy className="h-4 w-4 text-amber-400" /> Vitórias e derrotas</h2>
            {wins + losses === 0 ? <EmptyStateCard icon={Trophy} message="Nenhuma partida registrada neste período." /> : (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={winLossData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={48} paddingAngle={3}>
                      {winLossData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(228 30% 9%)', border: '1px solid hsl(228 20% 17%)', borderRadius: '0.75rem', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-5 text-xs"><span className="text-primary font-bold">{wins} vitórias</span><span className="text-red-400 font-bold">{losses} derrotas</span></div>
              </>
            )}
          </GlassCard>
        </div>

        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-4"><Gauge className="h-4 w-4 text-cyan-400" /> Leitura competitiva</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <Insight icon={Users} label="Adversário mais frequente" value={analytics?.mostFaced?.name || 'Sem dados'} detail={analytics?.mostFaced ? `${analytics.mostFaced.games} confronto(s) · ${analytics.mostFaced.wins} vitória(s)` : ''} />
            <Insight icon={MapPin} label="Local mais jogado" value={analytics?.favoriteLocation?.[0] || 'Sem dados'} detail={analytics?.favoriteLocation ? `${analytics.favoriteLocation[1]} partida(s)` : ''} />
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-primary" /> Progressão de nível</h2>
          <div className="flex justify-between items-baseline mb-2"><span className="font-black text-primary text-lg">Nível {level}</span><span className="text-xs text-muted-foreground tabular-nums">{(profile.xp || 0).toLocaleString('pt-BR')} XP</span></div>
          <div className="h-3 rounded-full bg-secondary overflow-hidden"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${xpPct}%` }} /></div>
          <div className="flex justify-between mt-1"><span className="text-[10px] text-muted-foreground">{prevXp.toLocaleString('pt-BR')}</span><span className="text-[10px] text-muted-foreground">{nextXp.toLocaleString('pt-BR')} XP</span></div>
        </GlassCard>

        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><CalendarDays className="h-4 w-4 text-amber-400" /> Últimas partidas</h2>
          {!analytics?.recent.length ? <EmptyStateCard icon={CalendarDays} message="Nenhuma partida sua registrada." /> : (
            <div className="space-y-2">
              {analytics.recent.map(({ match, result }, i) => (
                <div key={match.id || i} className="rounded-xl border border-border/60 bg-secondary/20 p-3 flex items-center gap-3">
                  <ResultPill won={result.won} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">vs {(result.opponent || []).join(' & ') || 'Adversário'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{match.tournament_name || match.location || 'Partida'} · {tournamentRound(match.notes)}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{String(match.date || '').slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Crown className="h-4 w-4 text-amber-400" /> Sala de troféus</h2>
          {!analytics?.titles.length ? <EmptyStateCard icon={Crown} message="Seu primeiro título ainda está por vir." /> : (
            <div className="grid sm:grid-cols-2 gap-2">
              {analytics.titles.map((title, i) => (
                <div key={`${title}-${i}`} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 flex items-center gap-3">
                  <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold truncate">{title}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Target className="h-4 w-4 text-primary" /> Ranking de atributos</h2>
          <div className="space-y-2">
            {topAttributes.map((attr, i) => (
              <div key={attr.key} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                <span className="text-xs font-medium w-24 truncate">{attr.label}</span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, attr.value)}%`, opacity: Math.max(.35, 1 - i * .055) }} /></div>
                <span className="text-xs font-black tabular-nums w-8 text-right">{attr.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </PageContainer>
  );
}

function MiniMetric({ icon: Icon, label, value, detail }) {
  return <div className="glass rounded-xl p-3"><Icon className="h-4 w-4 text-primary mb-2" /><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-lg font-black tabular-nums">{value}</p>{detail && <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>}</div>;
}

function Insight({ icon: Icon, label, value, detail }) {
  return <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 flex gap-3"><div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-primary" /></div><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-xs font-bold truncate mt-0.5">{value}</p>{detail && <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>}</div></div>;
}
