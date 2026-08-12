import React, { useEffect, useMemo, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import {
  BarChart3, Trophy, Swords, Target, Flame, TrendingUp, Percent, Activity,
  CalendarDays, Medal, Crown, ShieldCheck, Gauge, Users, MapPin
} from 'lucide-react';
import { EmptyState, Page, PageContent, PageHeader as PremiumHeader, PageSkeleton, Surface, StatCard as PremiumStatCard, StatusBadge, Tabs } from '@/components/design-system';
import { ATTRIBUTES, formatDate, overallRating, careerExperienceSummary, careerExperienceUnlocks } from '@/lib/padel';
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
        const user = await localGame.auth.me();
        const profiles = await localGame.entities.PlayerProfile.filter({ created_by_id: user.id });
        const currentProfile = profiles?.[0] || null;
        setProfile(currentProfile);

        const [allMatches, allTournaments] = await Promise.all([
          localGame.entities.Match.list('-date', 500).catch(() => []),
          localGame.entities.Tournament.list('-date', 250).catch(() => []),
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

  if (loading) return <PageSkeleton variant="stats" rows={4} />;
  if (!profile) return <Page><PageContent><EmptyState icon={BarChart3} title="Perfil não encontrado" description="Crie seu perfil para ver suas estatísticas." /></PageContent></Page>;

  const radarData = ATTRIBUTES.map(a => ({ attribute: a.label, value: Number(profile[a.key]) || 0, fullMark: 100 }));
  const wins = analytics?.wins || 0;
  const losses = analytics?.losses || 0;
  const winLossData = [
    { name: 'Vitórias', value: wins, color: CHART_COLORS.primary },
    { name: 'Derrotas', value: losses, color: CHART_COLORS.red },
  ];
  const careerExperience = careerExperienceSummary(profile.xp || 0);
  const experienceUnlocks = careerExperienceUnlocks(careerExperience.level);
  const xpPct = careerExperience.progress;
  const prevXp = careerExperience.previousXp;
  const nextXp = careerExperience.nextXp;
  const topAttributes = [...ATTRIBUTES]
    .map(a => ({ ...a, value: Number(profile[a.key]) || 0 }))
    .sort((a, b) => b.value - a.value);

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
      <PremiumHeader
        eyebrow="Performance e memória"
        title="Estatísticas da carreira"
        description="Analise evolução, resultados, atributos e os principais marcos construídos ao longo da sua trajetória."
        icon={BarChart3}
        tone="info"
        stats={[
          <StatusBadge key="period" tone="info">{period === 'career' ? 'Carreira completa' : `Temporada ${analytics?.seasonYear}`}</StatusBadge>,
          <StatusBadge key="level" tone="premium">Experiência {careerExperience.level}/{careerExperience.maxLevel}</StatusBadge>,
        ]}
      />

      <div className="space-y-5">
        <div className="max-w-sm">
          <Tabs
            tabs={[
              { key: 'career', label: 'Carreira completa' },
              { key: 'season', label: `Temporada ${analytics?.seasonYear}` },
            ]}
            activeTab={period}
            onTabChange={setPeriod}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 animate-stagger">
          <PremiumStatCard icon={Swords} label="Partidas" value={analytics?.filtered.length || 0} detail="No período selecionado" tone="brand" />
          <PremiumStatCard icon={Percent} label="Aproveitamento" value={`${analytics?.winPct || 0}%`} detail={`${wins} vitórias`} tone="info" />
          <PremiumStatCard icon={Flame} label="Sequência atual" value={`${analytics?.streaks.currentWin || 0} V`} detail={`Recorde: ${analytics?.streaks.best || 0}`} tone="premium" />
          <PremiumStatCard icon={Activity} label="Overall" value={overallRating(profile)} detail="Força esportiva atual" tone="success" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniMetric icon={Trophy} label="Títulos" value={analytics?.titles.length || profile.tournaments_won || 0} />
          <MiniMetric icon={Medal} label="Finais" value={analytics?.finals || 0} detail={`${analytics?.finalWins || 0} vencidas`} />
          <MiniMetric icon={Crown} label="Melhor sequência" value={`${analytics?.streaks.best || 0} V`} />
          <MiniMetric icon={ShieldCheck} label="Derrotas" value={losses} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Surface>
            <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Target className="h-4 w-4 text-primary" /> Atributos</h2>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={CHART_COLORS.border} />
                <PolarAngleAxis dataKey="attribute" tick={{ fill: CHART_COLORS.muted, fontSize: 9 }} />
                <Radar dataKey="value" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.3} strokeWidth={2} />
                <Tooltip contentStyle={{ background: 'hsl(228 30% 9%)', border: '1px solid hsl(228 20% 17%)', borderRadius: '0.75rem', fontSize: '12px' }} />
              </RadarChart>
            </ResponsiveContainer>
          </Surface>

          <Surface>
            <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Trophy className="h-4 w-4 text-amber-400" /> Vitórias e derrotas</h2>
            {wins + losses === 0 ? <EmptyState icon={Trophy} title="Sem partidas" description="Nenhuma partida registrada neste período." compact /> : (
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
          </Surface>
        </div>

        <Surface>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-4"><Gauge className="h-4 w-4 text-cyan-400" /> Leitura competitiva</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <Insight icon={Users} label="Adversário mais frequente" value={analytics?.mostFaced?.name || 'Sem dados'} detail={analytics?.mostFaced ? `${analytics.mostFaced.games} confronto(s) · ${analytics.mostFaced.wins} vitória(s)` : ''} />
            <Insight icon={MapPin} label="Local mais jogado" value={analytics?.favoriteLocation?.[0] || 'Sem dados'} detail={analytics?.favoriteLocation ? `${analytics.favoriteLocation[1]} partida(s)` : ''} />
          </div>
        </Surface>

        <Surface>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-primary" /> Experiência de carreira</h2>
          <div className="flex justify-between items-baseline mb-2"><span className="font-black text-primary text-lg">Experiência de carreira · Nível {careerExperience.level}/{careerExperience.maxLevel}</span><span className="text-xs text-muted-foreground tabular-nums">{(profile.xp || 0).toLocaleString('pt-BR')} XP de carreira</span></div>
          <div className="h-3 rounded-full bg-secondary overflow-hidden"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${xpPct}%` }} /></div>
          <div className="flex justify-between mt-1"><span className="text-[10px] text-muted-foreground">{prevXp.toLocaleString('pt-BR')}</span><span className="text-[10px] text-muted-foreground">{careerExperience.isMax ? 'Nível máximo' : `${nextXp.toLocaleString('pt-BR')} XP`}</span></div>
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-bold text-primary">{experienceUnlocks.latest.title}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{experienceUnlocks.latest.description}</p>
            {experienceUnlocks.next && <p className="mt-2 text-[10px] text-muted-foreground">Próximo marco no nível {experienceUnlocks.next.level}: {experienceUnlocks.next.title}.</p>}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">A Experiência de carreira representa sua trajetória e desbloqueia profundidade de gestão. Ela não aumenta sua força automaticamente: seu desempenho continua vindo dos atributos, do Overall, da forma e da qualidade da dupla.</p>
        </Surface>

        <Surface>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><CalendarDays className="h-4 w-4 text-amber-400" /> Últimas partidas</h2>
          {!analytics?.recent.length ? <EmptyState icon={CalendarDays} title="Sem partidas recentes" description="Nenhuma partida sua registrada." compact /> : (
            <div className="space-y-2">
              {analytics.recent.map(({ match, result }, i) => (
                <div key={match.id || i} className="rounded-xl border border-border/60 bg-secondary/20 p-3 flex items-center gap-3">
                  <ResultPill won={result.won} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">vs {(result.opponent || []).join(' & ') || 'Adversário'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{match.tournament_name || match.location || 'Partida'} · {tournamentRound(match.notes)}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{formatDate(match.date)}</span>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Crown className="h-4 w-4 text-amber-400" /> Sala de troféus</h2>
          {!analytics?.titles.length ? <EmptyState icon={Crown} title="Ainda não há estatísticas nesta categoria" description="Seu primeiro título ainda está por vir." compact /> : (
            <div className="grid sm:grid-cols-2 gap-2">
              {analytics.titles.map((title, i) => (
                <div key={`${title}-${i}`} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 flex items-center gap-3">
                  <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold truncate">{title}</span>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <Surface>
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
        </Surface>
      </div>
      </PageContent>
    </Page>
  );
}

function MiniMetric({ icon: Icon, label, value, detail }) {
  return <div className="glass rounded-xl p-3"><Icon className="h-4 w-4 text-primary mb-2" /><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-lg font-black tabular-nums">{value}</p>{detail && <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>}</div>;
}

function Insight({ icon: Icon, label, value, detail }) {
  return <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 flex gap-3"><div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-primary" /></div><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-xs font-bold truncate mt-0.5">{value}</p>{detail && <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>}</div></div>;
}
