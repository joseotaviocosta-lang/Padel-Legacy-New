import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Lock, HelpCircle, Star, Search } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { CompactStats, EmptyState, Tabs } from '@/components/design-system';
import { CATEGORY_META } from '@/lib/achievementsData';
import { evaluateAchievements, syncPlayerAchievements } from '@/lib/achievementEngine.js';
import { getWorldRank } from '@/lib/padel';
import { loadModuleTasks } from '@/lib/moduleLoading';
import AchievementCard from './AchievementCard';

const VISIBILITY_TABS = [
  { key: 'all', label: 'Todas', icon: Trophy },
  { key: 'publico', label: 'Visíveis', icon: Star },
  { key: 'oculto', label: 'Ocultas', icon: Lock },
  { key: 'secreto', label: 'Secretas', icon: HelpCircle },
];

// Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 8/9/10):
// era a página Achievements.jsx inteira — agora um painel reutilizável
// (aba "Conquistas" da página unificada de Objetivos, Missions.jsx). Fonte
// canônica de progressão de longo prazo: nada mais na carreira calcula um
// "próximo objetivo" por conta própria (ver seasonCareerPlan.js, que passou
// a consultar `evaluateAchievements`/`findNextLockedAchievement` daqui).
export default function AchievementsPanel({ profile }) {
  const [achievements, setAchievements] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState(new Set());
  const [worldRank, setWorldRank] = useState({ rank: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { achs, unlocked, rank } = await loadModuleTasks({
          achs: { task: () => localGame.entities.Achievement.filter({}, '-points', 500), fallback: [], label: 'catálogo de conquistas' },
          unlocked: { task: () => localGame.entities.PlayerAchievement.filter({ profile_id: profile.id }), fallback: [], label: 'conquistas do jogador' },
          rank: { task: () => getWorldRank(profile), fallback: { rank: 0, total: 0 }, label: 'ranking mundial' },
        });
        if (cancelled) return;
        setAchievements(achs || []);
        setUnlockedIds(new Set((unlocked || []).map((u) => u.achievement_id)));
        setWorldRank(rank || { rank: 0, total: 0 });
        // Ponto de sincronização adicional (idempotente — nunca re-concede);
        // os pontos principais ficam junto de incrementMissionProgress já
        // existente (partida de torneio, treino), esta é só uma rede de
        // segurança ao abrir a aba.
        const syncResult = await syncPlayerAchievements(profile, { worldRank: rank }, { localGame }).catch(() => null);
        if (!cancelled && syncResult?.unlocked?.length) {
          const refreshed = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id }).catch(() => []);
          setUnlockedIds(new Set((refreshed || []).map((u) => u.achievement_id)));
        }
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const progressByAchievementId = useMemo(() => {
    if (!profile?.id) return new Map();
    const rows = evaluateAchievements(profile, { worldRank });
    return new Map(rows.map((row) => [row.achievement.id, row]));
  }, [profile, worldRank]);

  const filtered = useMemo(() => {
    let result = achievements;
    if (visibility !== 'all') result = result.filter((a) => a.visibility === visibility);
    if (category !== 'all') result = result.filter((a) => a.category === category);
    if (search) {
      const query = search.toLowerCase();
      result = result.filter((a) => a.name?.toLowerCase().includes(query) || a.description?.toLowerCase().includes(query) || a.mystery_description?.toLowerCase().includes(query));
    }
    return result;
  }, [achievements, visibility, category, search]);

  const stats = useMemo(() => {
    const unlocked = achievements.filter((a) => unlockedIds.has(a.id));
    return { unlocked: unlocked.length, total: achievements.length, points: unlocked.reduce((sum, a) => sum + (a.points || 0), 0) };
  }, [achievements, unlockedIds]);

  if (loading) return null;

  return (
    <div className="space-y-3">
      <CompactStats items={[
        { label: 'desbloqueadas', value: `${stats.unlocked}/${stats.total}`, icon: Trophy, tone: 'premium' },
        { label: 'pontos', value: stats.points.toLocaleString('pt-BR'), icon: Star },
      ]} />

      <Tabs tabs={VISIBILITY_TABS} activeTab={visibility} onTabChange={setVisibility} variant="buttons" />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conquista..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs font-bold outline-none">
          <option value="all">Todas as categorias</option>
          {Object.entries(CATEGORY_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Trophy} title="Nenhuma conquista encontrada" description="Ajuste a busca ou os filtros para localizar outros desafios." compact />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 animate-stagger">
          {filtered.map((achievement) => (
            <AchievementCard
              key={achievement.id}
              achievement={achievement}
              unlocked={unlockedIds.has(achievement.id)}
              progress={progressByAchievementId.get(achievement.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
