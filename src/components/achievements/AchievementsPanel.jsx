import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Star, Search, ChevronDown, ChevronUp, HelpCircle, Check, Clock } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { CompactStats, CompactListItem, EmptyState, ProgressBar } from '@/components/design-system';
import { CATEGORY_META } from '@/lib/achievementsData';
import { presentableAchievements, evaluateAchievements, syncPlayerAchievements } from '@/lib/achievementEngine.js';
import { buildAchievementContext } from '@/lib/achievementContext.js';
import { getWorldRank } from '@/lib/padel';
import AchievementCard from './AchievementCard';

// Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte F): mesma regra de agrupamento
// que a avaliação já usa internamente — trigger_type sozinho já é a
// "escada" certa (7 rungs de play_official_match, 5 de reach_rank...),
// exceto max_attribute, que precisa do atributo específico (10 atributos
// independentes, não uma escada só).
function ladderKey(achievement) {
  return achievement.attribute_key ? `${achievement.trigger_type}:${achievement.attribute_key}` : achievement.trigger_type;
}

const CATEGORY_FILTERS = [{ key: 'all', label: 'Todas' }, ...Object.entries(CATEGORY_META).map(([id, meta]) => ({ key: id, label: meta.label }))];

// Fase 12 (Parte 41): "Próximas conquistas" — as N mais perto de
// desbloquear entre TODAS as categorias, não uma por categoria forçada.
const NEXT_UP_COUNT = 5;

function progressLabel(row) {
  const { achievement, value } = row;
  if (achievement.trigger_type === 'reach_rank') return `#${value || '—'} → Top ${achievement.threshold}`;
  if (achievement.trigger_type === 'reach_coins') return `${Math.round((value || 0)).toLocaleString('pt-BR')} / ${achievement.threshold.toLocaleString('pt-BR')}`;
  return `${value || 0} / ${achievement.threshold}`;
}

export default function AchievementsPanel({ profile }) {
  const [rows, setRows] = useState([]);
  const [unlockedMeta, setUnlockedMeta] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedLadders, setExpandedLadders] = useState(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const worldRank = await getWorldRank(profile).catch(() => ({ rank: 0 }));
        const context = await buildAchievementContext(profile, { worldRank });
        // Fase 12 (Parte 33-36): reconciliação de save antigo roda UMA vez
        // por perfil (flag persistida) — depois disso, todo sync aqui é um
        // desbloqueio ao vivo normal, com recompensa normal.
        const needsReconciliation = !profile.achievements_v2_reconciled;
        const syncResult = await syncPlayerAchievements(profile, context, { localGame, reconciliation: needsReconciliation }).catch(() => null);
        if (needsReconciliation) {
          await localGame.entities.PlayerProfile.update(profile.id, { achievements_v2_reconciled: true }).catch(() => {});
        }
        const unlocked = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id }).catch(() => []);
        if (cancelled) return;
        setUnlockedMeta(new Map(unlocked.map((u) => [u.achievement_id, u])));
        setRows(evaluateAchievements(syncResult?.profile || profile, context));
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const rowById = useMemo(() => new Map(rows.map((row) => [row.achievement.id, row])), [rows]);
  const allPresentable = useMemo(() => presentableAchievements(), []);

  // Fase 12 (Parte 46): dentro de cada escada, só o próximo degrau ainda
  // bloqueado aparece por padrão — os demais ficam atrás de "ver mais".
  const laddersById = useMemo(() => {
    const groups = new Map();
    for (const achievement of allPresentable) {
      const key = ladderKey(achievement);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(achievement);
    }
    for (const list of groups.values()) list.sort((a, b) => a.threshold - b.threshold);
    return groups;
  }, [allPresentable]);

  const nextUp = useMemo(() => {
    const candidates = rows.filter((row) => row.evaluable && !row.unlocked);
    return candidates.sort((a, b) => b.percent - a.percent).slice(0, NEXT_UP_COUNT);
  }, [rows]);

  const filteredAchievements = useMemo(() => {
    let result = allPresentable;
    if (category !== 'all') result = result.filter((a) => a.category === category);
    if (search) {
      const query = search.toLowerCase();
      result = result.filter((a) => a.name?.toLowerCase().includes(query) || a.description?.toLowerCase().includes(query));
    }
    return result;
  }, [allPresentable, category, search]);

  // Fase 12 (Parte 46): dentro da lista filtrada, cada escada mostra só o
  // primeiro degrau ainda bloqueado (ou o último, se todos já desbloqueados)
  // por padrão — os outros ficam disponíveis via "ver mais X" por escada.
  const visibleAchievements = useMemo(() => {
    const seen = new Set();
    const visible = [];
    for (const achievement of filteredAchievements) {
      const key = ladderKey(achievement);
      if (seen.has(key)) continue;
      const ladder = laddersById.get(key) || [achievement];
      if (ladder.length === 1 || expandedLadders.has(key)) {
        for (const item of ladder) if (filteredAchievements.includes(item)) visible.push(item);
      } else {
        const nextLocked = ladder.find((item) => !unlockedMeta.has(item.id));
        visible.push(nextLocked || ladder[ladder.length - 1]);
      }
      seen.add(key);
    }
    return visible;
  }, [filteredAchievements, laddersById, expandedLadders, unlockedMeta]);

  const stats = useMemo(() => {
    const unlocked = allPresentable.filter((a) => unlockedMeta.has(a.id));
    return { unlocked: unlocked.length, total: allPresentable.length, points: unlocked.reduce((sum, a) => sum + (a.points || 0), 0) };
  }, [allPresentable, unlockedMeta]);

  const completed = useMemo(() => visibleAchievements.filter((a) => unlockedMeta.has(a.id)), [visibleAchievements, unlockedMeta]);
  const inProgress = useMemo(() => visibleAchievements.filter((a) => !unlockedMeta.has(a.id) && a.visibility !== 'secreto'), [visibleAchievements, unlockedMeta]);
  const secrets = useMemo(() => visibleAchievements.filter((a) => a.visibility === 'secreto' && !unlockedMeta.has(a.id)), [visibleAchievements, unlockedMeta]);

  if (loading) return null;

  return (
    <div className="space-y-4">
      <CompactStats items={[
        { label: 'desbloqueadas', value: `${stats.unlocked}/${stats.total}`, icon: Trophy, tone: 'premium' },
        { label: 'pontos', value: stats.points.toLocaleString('pt-BR'), icon: Star },
      ]} />

      {/* Fase 12 (Parte 41): "Próximas conquistas" — sempre visível no topo,
          independente do filtro de categoria abaixo. */}
      {nextUp.length > 0 && (
        <section className="space-y-1.5">
          <p className="px-1 text-[10px] font-black uppercase tracking-wider text-primary">Próximas conquistas</p>
          <div className="rounded-2xl border border-border/60 divide-y divide-border/40 overflow-hidden">
            {nextUp.map((row) => (
              <CompactListItem
                key={row.achievement.id}
                leading={<Clock className="h-4 w-4 text-primary" />}
                title={row.achievement.name}
                meta={progressLabel(row)}
                trailing={<div className="w-16"><ProgressBar value={row.percent} max={100} size="sm" /></div>}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conquista..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs font-bold outline-none">
          {CATEGORY_FILTERS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </div>

      {visibleAchievements.length === 0 ? (
        <EmptyState icon={Trophy} title="Nenhuma conquista encontrada" description="Ajuste a busca ou os filtros para localizar outros desafios." compact />
      ) : (
        <div className="space-y-4">
          {inProgress.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 animate-stagger">
              {inProgress.map((achievement) => {
                const key = ladderKey(achievement);
                const ladder = laddersById.get(key) || [achievement];
                const hasMore = ladder.length > 1 && !expandedLadders.has(key);
                return (
                  <div key={achievement.id} className="relative">
                    <AchievementCard achievement={achievement} unlocked={false} progress={rowById.get(achievement.id)} onClick={() => {}} />
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => setExpandedLadders((prev) => new Set(prev).add(key))}
                        className="mt-1 flex w-full items-center justify-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                      >
                        <ChevronDown className="h-3 w-3" /> Ver mais {ladder.length - 1} nível(is)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {secrets.length > 0 && (
            <section className="space-y-1.5">
              <p className="px-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Conquistas secretas</p>
              <div className="rounded-2xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                {secrets.map((achievement) => (
                  <CompactListItem key={achievement.id} leading={<HelpCircle className="h-4 w-4 text-muted-foreground/60" />} title="???" meta="Conquista secreta" />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section className="space-y-1.5">
              <button type="button" onClick={() => setShowCompleted((v) => !v)} className="flex w-full items-center justify-between px-1 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Concluídas ({completed.length})</span>
                {showCompleted ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showCompleted && (
                <div className="rounded-2xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                  {completed.map((achievement) => {
                    const meta = unlockedMeta.get(achievement.id);
                    const dateLabel = meta?.unlocked_date ? new Date(meta.unlocked_date).toLocaleDateString('pt-BR') : null;
                    return (
                      <CompactListItem
                        key={achievement.id}
                        leading={<Check className="h-4 w-4 text-emerald-400" />}
                        title={achievement.name}
                        meta={dateLabel ? `Desbloqueada em ${dateLabel}` : 'Desbloqueada'}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
