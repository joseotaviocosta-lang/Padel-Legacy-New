import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Star, Coins, Search, ChevronDown, ChevronUp, HelpCircle, Check, Clock } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { CompactStats, CompactListItem, EmptyState, ProgressBar } from '@/components/design-system';
import { CATEGORY_META } from '@/lib/achievementsData';
import { presentableAchievements, evaluateAchievements, syncPlayerAchievements } from '@/lib/achievementEngine.js';
import { buildAchievementContext } from '@/lib/achievementContext.js';
import { findNextRelevantAchievements } from '@/lib/achievementRelevance.js';
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

// Achievements Polish 12.1 (docs/ACHIEVEMENTS_POLISH_12_1.md, Parte G/H):
// "Próximas conquistas" agora vem de findNextRelevantAchievements (relevância
// real, não só percentual — Parte B) em vez do "top 5 por percent" antigo,
// que deixava idade/tempo dominar pra atletas jovens. O grid "em progresso"
// também usa a mesma relevância por padrão (12, Parte 19-21) — a Fase 12
// já tinha reduzido de 175/155 pra "só o próximo degrau de cada escada"
// (~98 cards), mas isso ainda é uma parede grande de cara; "Ver todas"
// revela o catálogo completo (mesmo grid de sempre) só quando o jogador
// pede.
const NEXT_UP_COUNT = 5;
const IN_PROGRESS_DEFAULT_COUNT = 12;

// Achievements Polish 12.1 (Parte 31): exportado nomeadamente só pra
// test:achievement-progress-display poder testar a formatação isolada
// (ranking/contadores/nenhum NaN) sem duplicar a lógica no teste — o
// `export default` do componente continua a forma normal de uso.
export function progressLabel(row) {
  const { achievement, value } = row;
  if (achievement.trigger_type === 'reach_rank') return `#${value || '—'} → Top ${achievement.threshold}`;
  if (achievement.trigger_type === 'reach_coins') return `${Math.round((value || 0)).toLocaleString('pt-BR')} / ${achievement.threshold.toLocaleString('pt-BR')}`;
  return `${value || 0} / ${achievement.threshold}`;
}

// Parte 15-18: cada linha de "Próximas" mostra nome + descrição curta +
// progresso real (nunca uma barra sem contexto) + categoria discreta +
// recompensa pequena que não compete visualmente com o objetivo.
function NextUpRow({ item }) {
  const { achievement, progress } = item;
  const categoryMeta = CATEGORY_META[achievement.category];
  return (
    <div className="flex items-start gap-3 p-3">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-bold">{achievement.name}</p>
          {categoryMeta && <span className="shrink-0 rounded-full bg-secondary/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-muted-foreground">{categoryMeta.label}</span>}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{achievement.description}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <ProgressBar value={progress.percent} max={100} size="sm" className="flex-1" />
          <span className="shrink-0 text-[10px] font-bold tabular-nums text-foreground">{progressLabel(progress)}</span>
        </div>
      </div>
      {(achievement.xp_reward > 0 || achievement.coins_reward > 0) && (
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[9px] font-bold text-muted-foreground/80">
          {achievement.xp_reward > 0 && <span className="flex items-center gap-0.5"><Star className="h-2.5 w-2.5" />{achievement.xp_reward}</span>}
          {achievement.coins_reward > 0 && <span className="flex items-center gap-0.5"><Coins className="h-2.5 w-2.5" />{achievement.coins_reward}</span>}
        </div>
      )}
    </div>
  );
}

export default function AchievementsPanel({ profile }) {
  const [rows, setRows] = useState([]);
  const [relevantList, setRelevantList] = useState([]);
  const [unlockedMeta, setUnlockedMeta] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedLadders, setExpandedLadders] = useState(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAllInProgress, setShowAllInProgress] = useState(false);

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
        const effectiveProfile = syncResult?.profile || profile;
        setUnlockedMeta(new Map(unlocked.map((u) => [u.achievement_id, u])));
        setRows(evaluateAchievements(effectiveProfile, context));
        // Achievements Polish 12.1 (Parte 26/M): uma única chamada síncrona,
        // sem storage — os 5 de "Próximas" e os 12 padrão de "Em progresso"
        // saem da MESMA lista ordenada por relevância, sem sobreposição
        // (fatiada sequencialmente), nunca uma segunda fonte paralela.
        setRelevantList(findNextRelevantAchievements(effectiveProfile, context, { limit: NEXT_UP_COUNT + IN_PROGRESS_DEFAULT_COUNT }));
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

  // Achievements Polish 12.1 (Parte B/H): as 5 primeiras da lista de
  // relevância viram "Próximas"; as próximas 12 (já sem sobreposição, fatia
  // sequencial da mesma lista ordenada) formam o padrão de "Em progresso" —
  // nunca uma segunda fonte, nunca duplicando uma conquista nas duas seções.
  const nextUp = useMemo(() => relevantList.slice(0, NEXT_UP_COUNT), [relevantList]);
  const relevantInProgressIds = useMemo(
    () => new Set(relevantList.slice(NEXT_UP_COUNT, NEXT_UP_COUNT + IN_PROGRESS_DEFAULT_COUNT).map((item) => item.achievement.id)),
    [relevantList],
  );

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
  const inProgressAll = useMemo(() => visibleAchievements.filter((a) => !unlockedMeta.has(a.id) && a.visibility !== 'secreto'), [visibleAchievements, unlockedMeta]);
  const secrets = useMemo(() => visibleAchievements.filter((a) => a.visibility === 'secreto' && !unlockedMeta.has(a.id)), [visibleAchievements, unlockedMeta]);

  // Achievements Polish 12.1 (Parte H/19-21): "98 cards ainda é muito" — a
  // Fase 12 já colapsou escadas, mas a vista padrão (sem filtro/busca ativos)
  // ainda mostrava tudo de uma vez. Por padrão, só as 12 mais relevantes
  // aparecem, com "Ver todas" revelando o grid completo — mas só quando o
  // jogador não filtrou/buscou nada (filtrar já é um pedido explícito de ver
  // um subconjunto específico, não deveria ficar limitado de novo por cima).
  const isDefaultView = category === 'all' && !search;
  const applyDensityCap = isDefaultView && !showAllInProgress;
  const inProgress = useMemo(() => {
    if (!applyDensityCap) return inProgressAll;
    // Uma escada expandida (Fase 12, "ver mais X nível(is)") precisa mostrar
    // seus degraus mesmo que eles não estivessem entre os 12 mais relevantes
    // — senão o clique em "ver mais" parece não fazer nada na vista padrão.
    return inProgressAll.filter((a) => relevantInProgressIds.has(a.id) || expandedLadders.has(ladderKey(a)));
  }, [inProgressAll, applyDensityCap, relevantInProgressIds, expandedLadders]);
  const inProgressHiddenCount = Math.max(0, inProgressAll.length - inProgress.length);

  if (loading) return null;

  return (
    <div className="space-y-4">
      <CompactStats items={[
        { label: 'desbloqueadas', value: `${stats.unlocked}/${stats.total}`, icon: Trophy, tone: 'premium' },
        { label: 'pontos', value: stats.points.toLocaleString('pt-BR'), icon: Star },
      ]} />

      {/* Achievements Polish 12.1 (Parte B/G): "Metas relevantes para sua
          carreira agora" — sempre visível no topo, independente do filtro de
          categoria abaixo. Cada linha mostra nome + descrição curta +
          progresso real + categoria + recompensa discreta (NextUpRow), não
          mais um nome pelado com um número — a relevância vem de
          findNextRelevantAchievements (progresso real + o quanto o jogador
          controla a conquista + diversidade), não mais só percentual. */}
      {nextUp.length > 0 && (
        <section className="space-y-1.5">
          <p className="px-1 text-[10px] font-black uppercase tracking-wider text-primary">Metas relevantes para sua carreira agora</p>
          <div className="rounded-2xl border border-border/60 divide-y divide-border/40 overflow-hidden">
            {nextUp.map((item) => <NextUpRow key={item.achievement.id} item={item} />)}
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

          {/* Achievements Polish 12.1 (Parte H/19-21): "Ver todas" só
              aparece quando a vista padrão realmente escondeu algo — nunca
              some sozinha (o jogador sempre consegue chegar ao catálogo
              completo), nunca aparece à toa quando não há nada escondido
              (poucas conquistas em progresso, ou o jogador já filtrou/buscou). */}
          {isDefaultView && inProgressHiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllInProgress(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border/60 py-2.5 text-xs font-bold text-muted-foreground hover:border-primary/30 hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5" /> Ver todas ({inProgressHiddenCount} conquista{inProgressHiddenCount === 1 ? '' : 's'} a mais)
            </button>
          )}
          {isDefaultView && showAllInProgress && (
            <button
              type="button"
              onClick={() => setShowAllInProgress(false)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border/60 py-2.5 text-xs font-bold text-muted-foreground hover:border-primary/30 hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Mostrar só as mais relevantes
            </button>
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
