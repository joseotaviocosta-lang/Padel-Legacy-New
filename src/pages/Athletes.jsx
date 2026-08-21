import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Users, Search, SlidersHorizontal, AlertTriangle, Trophy, ListFilter } from 'lucide-react';
import { ensureMyProfile, buildWorldRankingSnapshot } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
// Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.10): migrado do wrapper
// deprecated em padel/ui.jsx (ambos marcados "@deprecated" no próprio
// arquivo) para os primitives reais do design-system — esta era a única
// página do app inteiro ainda fora de Page/PageContent.
import { EmptyState, Page, PageContent, PageHeader, PageSkeleton, Tabs } from '@/components/design-system';
import { ensureAthleteProfiles, generateRelationships, getAthletes, PERSONALITIES } from '@/lib/athleteBehavior';
import AthleteCard from '@/components/athletes/AthleteCard';
import AthleteDetail from '@/components/athletes/AthleteDetail';

const PAGE_SIZE = 60;

const PHASE_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'top100', label: 'Top 100' },
  { id: 'rising', label: 'Em ascensão' },
  { id: 'elite', label: 'Elite' },
  { id: 'veteran', label: 'Veteranos' },
];

export default function Athletes() {
  const [athletes, setAthletes] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Hotfix pré-beta (docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md, item 8): a fonte
  // pode falhar (exceção real) sem que isso seja o mesmo que "os filtros não
  // encontraram ninguém". `sourceError` distingue os dois — a UI nunca deve
  // mostrar "Nenhum atleta encontrado com esses filtros" quando na verdade a
  // fonte nem carregou.
  const [sourceError, setSourceError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [rankById, setRankById] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [persFilter, setPersFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [styleFilter, setStyleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('ranking');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setSourceError(null);
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        if (!active) return;
        setProfile(p);
        await ensureAthleteProfiles();
        await generateRelationships();
        const list = await getAthletes();
        if (!active) return;
        setAthletes(list || []);
        // Item 7 do hotfix: "ordenar por ranking" usa a posição canônica
        // (buildWorldRankingSnapshot, Fase 11) em vez do campo
        // `ranking_position` bruto — esse só é atualizado semanalmente para
        // uma amostra dos atletas de maior Overall (circuitLifecycle.js),
        // então fica obsoleto para o resto da população. Reaproveita o
        // `profile` já carregado nesta mesma passada — nenhum fetch extra.
        if (p) {
          const snapshot = await buildWorldRankingSnapshot(p);
          if (!active) return;
          setRankById(new Map(snapshot.entries.map((entry) => [entry.id, entry.rank])));
        }
      } catch (e) {
        console.error('[Athletes] falha ao carregar atletas', e);
        if (active) setSourceError(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reloadToken]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [phaseFilter, persFilter, styleFilter, deferredSearch, sortBy]);

  const filtered = useMemo(() => athletes
    .filter((a) => {
      if (phaseFilter === 'all') return true;
      if (phaseFilter === 'top100') return Number(rankById?.get(a.id) ?? a.ranking_position ?? 9999) <= 100;
      if (phaseFilter === 'elite') return Number(rankById?.get(a.id) ?? a.ranking_position ?? 9999) <= 30 || Number(a.overall_rating || 0) >= 84;
      if (phaseFilter === 'rising') return ['prospect', 'rising'].includes(a.career_stage) || a.career_phase === 'Ascensão';
      if (phaseFilter === 'veteran') return a.career_stage === 'veteran' || a.career_phase === 'Veterano';
      return true;
    })
    .filter(a => persFilter === 'all' || a.personality === persFilter)
    .filter(a => styleFilter === 'all' || a.play_style === styleFilter)
    .filter(a => !deferredSearch || `${a.name || ''} ${a.country || ''}`.toLowerCase().includes(deferredSearch))
    .sort((a, b) => {
      if (sortBy === 'form') return Number(b.form || b.current_form || 0) - Number(a.form || a.current_form || 0);
      if (sortBy === 'clutch') return Number(b.behavior_axes?.clutch || 0) - Number(a.behavior_axes?.clutch || 0);
      if (sortBy === 'overall') return Number(b.overall_rating || 0) - Number(a.overall_rating || 0);
      const rankA = rankById?.get(a.id) ?? Number(a.ranking_position || 9999);
      const rankB = rankById?.get(b.id) ?? Number(b.ranking_position || 9999);
      return rankA - rankB;
    }), [athletes, phaseFilter, persFilter, styleFilter, deferredSearch, sortBy, rankById]);

  const PERS_FILTERS = [{ id: 'all', label: 'Todas' }, ...PERSONALITIES.map(p => ({ id: p.id, label: p.label }))];
  const STYLE_FILTERS = [
    { id: 'all', label: 'Todos os estilos' },
    { id: 'Agressivo', label: 'Agressivo' },
    { id: 'Defensivo', label: 'Defensivo' },
    { id: 'Equilibrado', label: 'Equilibrado' },
    { id: 'Tático', label: 'Tático' },
    { id: 'Potência', label: 'Potência' },
  ];

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  // Item 8 do hotfix: fonte que falhou tem sua própria tela — nunca a mesma
  // mensagem de "filtros sem resultado".
  if (sourceError) {
    return (
      <Page><PageContent>
        <PageHeader dense icon={Users} title="Atletas do Circuito" description="Personalidades, evolução e relacionamentos dos atletas IA" tone="brand" />
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar os atletas do circuito"
          description="Sua carreira e seu save não foram afetados."
          action={<button type="button" onClick={() => setReloadToken((value) => value + 1)} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Tentar novamente</button>}
        />
      </PageContent></Page>
    );
  }

  return (
    <Page><PageContent>
      <PageHeader dense icon={Users} title="Atletas" description="Personalidades, evolução e relacionamentos dos atletas IA" tone="brand" hudLabel="Scouting do circuito" hudItems={[
        { label: 'no circuito', value: athletes.length, icon: Users },
        { label: 'na lista', value: filtered.length, icon: ListFilter, tone: 'info' },
        { label: 'sua posição', value: profile?.id ? `#${rankById?.get(profile.id) || '—'}` : '—', icon: Trophy, tone: 'premium' },
      ]} />

      <div className="grid grid-cols-2 gap-2 border-y border-border/45 py-2 md:grid-cols-[1fr_180px_180px_180px]">
        <label className="relative col-span-2 block md:col-span-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar atleta ou país..." className="w-full rounded-xl border border-border bg-background/50 pl-9 pr-3 py-2 text-sm" />
        </label>
        <label className="relative block">
          <SlidersHorizontal className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full rounded-xl border border-border bg-background/50 pl-9 pr-3 py-2 text-sm">
            <option value="ranking">Ordenar: ranking</option>
            <option value="overall">Ordenar: overall</option>
            <option value="form">Ordenar: melhor forma</option>
            <option value="clutch">Ordenar: decisões</option>
          </select>
        </label>
        <select value={persFilter} onChange={e => setPersFilter(e.target.value)} aria-label="Filtrar personalidade" className="min-h-11 rounded-lg border border-border bg-background/50 px-2 text-xs">
          {PERS_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select value={styleFilter} onChange={e => setStyleFilter(e.target.value)} aria-label="Filtrar estilo" className="min-h-11 rounded-lg border border-border bg-background/50 px-2 text-xs">
          {STYLE_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>

      <Tabs tabs={PHASE_FILTERS.map(f => ({ key: f.id, label: f.label }))} activeTab={phaseFilter} onTabChange={setPhaseFilter} variant="buttons" />

      {filtered.length === 0 ? (
        athletes.length === 0 ? (
          // A fonte carregou sem erro, mas realmente não retornou nenhum
          // atleta — diferente de "os filtros excluíram todo mundo"
          // (item 8: nunca confundir os dois).
          <EmptyState icon={Users} title="O circuito ainda não tem atletas cadastrados" description="Isso não é esperado numa carreira normal — tente recarregar a página." />
        ) : (
          <EmptyState icon={Users} title="Nenhum atleta encontrado" description="Nenhum atleta encontrado com esses filtros." />
        )
      ) : (
        <div className="render-window overflow-hidden rounded-xl border border-border/55 animate-stagger">
          {filtered.slice(0, visibleCount).map(a => <AthleteCard key={a.id} athlete={a} displayRank={rankById?.get(a.id)} onClick={() => setSelected(a)} />)}
        </div>
      )}

      {filtered.length > visibleCount && (
        <button type="button" onClick={() => setVisibleCount(value => value + PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">
          Carregar mais atletas ({Math.min(PAGE_SIZE, filtered.length - visibleCount)})
        </button>
      )}

      {selected && <AthleteDetail athlete={selected} onClose={() => setSelected(null)} />}
    </PageContent></Page>
  );
}
