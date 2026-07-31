import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Trophy, Users, Globe, Crown, Link, Plus, TrendingUp, CalendarDays } from 'lucide-react';
import { overallRating } from '@/lib/padel';
import { ProfileMini } from '@/components/padel/Shared';
import { LoadingScreen, PageHeader, EmptyStateCard, TabBar, PageContainer } from '@/components/padel/ui';
import { loadModuleTasks } from '@/lib/moduleLoading';

const TABS = [
  { key: 'circuit', label: 'Circuito', icon: Trophy },
  { key: 'race', label: 'Race', icon: CalendarDays },
  { key: 'teams', label: 'Duplas', icon: Link },
  { key: 'players', label: 'Jogadores', icon: Trophy },
  { key: 'clubs', label: 'Clubes', icon: Users },
  { key: 'countries', label: 'Países', icon: Globe },
];

export default function Ranking() {
  const [tab, setTab] = useState('circuit');
  const [players, setPlayers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { p, c, t, a } = await loadModuleTasks({
          p: { task: () => localGame.entities.PlayerProfile.list('-xp', 100), fallback: [], label: 'perfis do ranking' },
          c: { task: () => localGame.entities.Club.list('-club_points', 100), fallback: [], label: 'clubes do ranking' },
          t: { task: () => localGame.entities.TeamRanking.list('-ranking_points', 100), fallback: [], label: 'ranking de duplas' },
          a: { task: () => localGame.entities.AthleteProfile.list('ranking_position', 200), fallback: [], label: 'atletas do ranking' },
        });
        setPlayers(p || []);
        setClubs(c || []);
        setTeams(t || []);
        setAthletes(a || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  // Country ranking aggregate
  const countryMap = {};
  (players || []).forEach(p => {
    const c = p.country || 'Outros';
    if (!countryMap[c]) countryMap[c] = { name: c, players: 0, totalXp: 0, totalOvr: 0 };
    countryMap[c].players++;
    countryMap[c].totalXp += (p.xp || 0);
    countryMap[c].totalOvr += overallRating(p);
  });
  const countries = Object.values(countryMap).map(c => ({ ...c, avgOvr: Math.round(c.totalOvr / c.players) })).sort((a, b) => b.totalXp - a.totalXp);


  const normalizeName = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');
  const activeAthletes = (athletes || []).filter(a => !a.retired && a.career_phase !== 'Aposentado');

  // O elenco profissional real vive principalmente em TeamRanking. Convertemos cada
  // integrante das duplas em uma entrada individual para Circuito, Race e Jogadores.
  // Assim, as três abas usam o mesmo universo da aba Duplas e continuam atualizando
  // quando os torneios alteram os pontos das equipes.
  const teamAthleteMap = new Map();
  for (const team of teams || []) {
    const teamPoints = Math.max(0, Number(team.ranking_points ?? team.rank_points) || 0);
    const teamRace = Math.max(0, Number(team.race_points ?? team.season_points ?? teamPoints) || 0);
    const members = [
      { name: team.player1_name, id: team.player1_id, country: team.player1_country },
      { name: team.player2_name, id: team.player2_id, country: team.player2_country },
    ];
    for (const member of members) {
      const key = normalizeName(member.name);
      if (!key) continue;
      const current = teamAthleteMap.get(key);
      const candidate = {
        id: member.id || `team-athlete-${key.replace(/[^a-z0-9]+/g, '-')}`,
        name: member.name,
        sport_name: member.name,
        country: member.country || team.country || team.nationality || 'Internacional',
        circuit_category: team.circuit_category || 'Profissional',
        overall_rating: Number(team.overall_rating ?? team.overall) || 70,
        world_ranking_points: teamPoints,
        ranking_points: teamPoints,
        race_points: teamRace,
        source_team: true,
      };
      if (!current || candidate.world_ranking_points > current.world_ranking_points) {
        teamAthleteMap.set(key, candidate);
      }
    }
  }

  const mergedAthleteMap = new Map();
  for (const athlete of [...activeAthletes, ...teamAthleteMap.values()]) {
    const key = normalizeName(athlete.name || athlete.sport_name);
    if (!key) continue;
    const current = mergedAthleteMap.get(key);
    if (!current) {
      mergedAthleteMap.set(key, athlete);
      continue;
    }
    mergedAthleteMap.set(key, {
      ...athlete,
      ...current,
      id: current.id || athlete.id,
      name: current.name || athlete.name,
      sport_name: current.sport_name || athlete.sport_name,
      country: current.country || athlete.country,
      overall_rating: Math.max(Number(current.overall_rating ?? current.overall) || 0, Number(athlete.overall_rating ?? athlete.overall) || 0),
      world_ranking_points: Math.max(Number(current.world_ranking_points ?? current.ranking_points) || 0, Number(athlete.world_ranking_points ?? athlete.ranking_points) || 0),
      ranking_points: Math.max(Number(current.world_ranking_points ?? current.ranking_points) || 0, Number(athlete.world_ranking_points ?? athlete.ranking_points) || 0),
      race_points: Math.max(Number(current.race_points) || 0, Number(athlete.race_points) || 0),
    });
  }
  const rankingAthletes = [...mergedAthleteMap.values()];

  const playerEntries = (players || []).map(p => ({
    ...p,
    name: p.sport_name || p.name || 'Jogador',
    sport_name: p.sport_name || p.name || 'Jogador',
    country: p.country || 'Brasil',
    overall_rating: overallRating(p),
    world_ranking_points: Number(p.rank_points ?? p.ranking_points ?? p.world_ranking_points) || 0,
    race_points: Number(p.race_points) || 0,
    is_player_profile: true,
  }));

  const dedupedCircuit = [...rankingAthletes];
  for (const player of playerEntries) {
    const alreadyIncluded = dedupedCircuit.some(a => a.id === player.id || (
      String(a.name || '').toLowerCase() === String(player.name || '').toLowerCase() &&
      String(a.country || '').toLowerCase() === String(player.country || '').toLowerCase()
    ));
    if (!alreadyIncluded) dedupedCircuit.push(player);
  }

  const circuitAthletes = [...dedupedCircuit].sort((a, b) => (Number(b.world_ranking_points ?? b.ranking_points) || 0) - (Number(a.world_ranking_points ?? a.ranking_points) || 0));
  const raceAthletes = [...dedupedCircuit].sort((a, b) => (Number(b.race_points) || 0) - (Number(a.race_points) || 0));

  function CircuitList({ items, race = false }) {
    if (!items.length) return <EmptyStateCard icon={Trophy} message="O circuito será preenchido após o próximo avanço semanal." />;
    return (
      <>
        <Podium
          items={items}
          renderName={a => a.name || 'Atleta'}
          renderSub={a => `${Number(race ? a.race_points : (a.world_ranking_points ?? a.ranking_points)) || 0} pts`}
        />
        {items.slice(0, 100).map((a, i) => {
          const points = Number(race ? a.race_points : (a.world_ranking_points ?? a.ranking_points)) || 0;
          const previous = Number(a.ranking_previous_position) || i + 1;
          const movement = previous - (i + 1);
          return (
            <div key={a.id || `${a.name}-${i}`} className="glass rounded-2xl p-3 flex items-center gap-3">
              <div className={`text-2xl font-black w-8 text-center ${i === 0 ? 'text-amber-400' : 'text-muted-foreground/50'}`}>{i + 1}</div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0">
                <span className="font-black text-primary">{(a.name || '?')[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{a.name || 'Atleta'}</p>
                <p className="text-[10px] text-muted-foreground">{a.country || a.nationality || 'Internacional'} · {a.circuit_category || 'Future'} · {Number(a.overall_rating ?? a.overall) || 0} OVR</p>
              </div>
              <div className="text-right">
                <p className="font-black text-primary tabular-nums">{points.toLocaleString('pt-BR')}</p>
                <p className={`text-[9px] uppercase flex items-center justify-end gap-0.5 ${movement > 0 ? 'text-green-400' : movement < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  <TrendingUp className={`h-3 w-3 ${movement < 0 ? 'rotate-180' : ''}`} /> {movement === 0 ? 'estável' : `${Math.abs(movement)} pos.`}
                </p>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  const podiumColors = ['text-amber-400 bg-amber-500/10', 'text-slate-300 bg-slate-500/10', 'text-orange-400 bg-orange-500/10'];

  function Podium({ items, renderName, renderSub }) {
    if (items.length < 3) return null;
    return (
      <div className="flex items-end justify-center gap-2 py-4">
        {[1, 0, 2].map((idx) => {
          const item = items[idx];
          if (!item) return null;
          const heights = ['h-24', 'h-28', 'h-20'];
          const pos = idx + 1;
          return (
            <div key={idx} className="flex flex-col items-center" style={{ order: idx }}>
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/40 to-secondary flex items-center justify-center ring-2 mb-1" style={{ borderColor: pos === 1 ? 'hsl(45 93% 47%)' : 'transparent' }}>
                <Users className="h-5 w-5 text-primary" />
              </div>
              <span className="text-[10px] font-bold truncate max-w-[80px] text-center">{renderName(item)}</span>
              {pos === 1 && <Crown className="h-4 w-4 text-amber-400 -mb-1" />}
              <div className={`w-20 ${heights[idx]} rounded-t-xl flex flex-col items-center justify-center ${podiumColors[idx]}`}>
                <span className="text-2xl font-black">{pos}</span>
                <span className="text-[9px] opacity-70 text-center px-1">{renderSub(item)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader icon={Trophy} title="Ranking" subtitle="Os melhores do circuito mundial" accent="amber" />

      <TabBar tabs={TABS} activeTab={tab} onTabChange={setTab} variant="segmented" />

      {/* Lists */}
      <div className="space-y-2">
        {tab === 'circuit' && <CircuitList items={circuitAthletes} />}
        {tab === 'race' && <CircuitList items={raceAthletes} race />}

        {/* Teams (primary) */}
        {tab === 'teams' && (
          teams.length === 0 ? (
            <EmptyStateCard icon={Link} message="Nenhuma dupla ranqueada ainda." />
          ) : (
            <>
              <Podium
                items={teams}
                renderName={t => `${t.player1_name} & ${t.player2_name}`}
                renderSub={t => `${t.ranking_points} pts`}
              />
              {teams.map((t, i) => (
                <div key={t.id} className="glass rounded-2xl p-3 flex items-center gap-3">
                  <div className={`text-2xl font-black w-6 text-center ${i === 0 ? 'text-amber-400' : 'text-muted-foreground/50'}`}>{i + 1}</div>
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{t.player1_name} & {t.player2_name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.wins || 0}V · {t.losses || 0}D · {(t.titles || []).length} título(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-primary tabular-nums">{t.ranking_points || 0}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">pontos</p>
                  </div>
                </div>
              ))}
            </>
          )
        )}

        {/* Jogadores — mesma classificação mundial mostrada na Carreira */}
        {tab === 'players' && <CircuitList items={circuitAthletes} />}

        {/* Clubs */}
        {tab === 'clubs' && (
          <>
          <div className="flex justify-end mb-2">
            <RouterLink to="/clubs" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-3.5 w-3.5" /> Gerenciar clubes
            </RouterLink>
          </div>
          {clubs.length === 0 ? (
            <EmptyStateCard icon={Users} message="Nenhum clube cadastrado." />
          ) : clubs.map((c, i) => (
            <div key={c.id} className="glass rounded-2xl p-3 flex items-center gap-3">
              <div className={`text-2xl font-black w-6 text-center ${i === 0 ? 'text-amber-400' : 'text-muted-foreground/50'}`}>{i + 1}</div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center overflow-hidden">
                {c.logo_url ? <img src={c.logo_url} alt="" className="h-full w-full object-cover" /> : <span className="font-black text-primary text-lg">{(c.name || '?')[0]?.toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">{c.city || ''}{c.city && c.country ? ', ' : ''}{c.country || ''} · {c.member_count || 0} membros</p>
              </div>
              <div className="text-right">
                <p className="font-black text-primary tabular-nums">{c.club_points || 0}</p>
                <p className="text-[9px] text-muted-foreground uppercase">pontos</p>
              </div>
            </div>
          ))}
          </>
        )}

        {/* Countries */}
        {tab === 'countries' && countries.map((c, i) => (
          <div key={c.name} className="glass rounded-2xl p-3 flex items-center gap-3">
            <div className={`text-2xl font-black w-6 text-center ${i === 0 ? 'text-amber-400' : 'text-muted-foreground/50'}`}>{i + 1}</div>
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-accent/30 to-secondary flex items-center justify-center">
              <Globe className="h-5 w-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{c.name}</p>
              <p className="text-[10px] text-muted-foreground">{c.players} jogadores · {c.avgOvr} OVR médio</p>
            </div>
            <div className="text-right">
              <p className="font-black text-primary tabular-nums">{c.totalXp.toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground uppercase">XP total</p>
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}