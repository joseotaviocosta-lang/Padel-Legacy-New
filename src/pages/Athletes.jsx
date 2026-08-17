import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Users, Search, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { ensureMyProfile, buildWorldRankingSnapshot } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
import { PageHeader, FilterPills } from '@/components/padel/ui';
import { PageSkeleton } from '@/components/design-system';
import { ensureAthleteProfiles, generateRelationships, getAthletes, PERSONALITIES } from '@/lib/athleteBehavior';
import AthleteCard from '@/components/athletes/AthleteCard';
import AthleteDetail from '@/components/athletes/AthleteDetail';

const PAGE_SIZE = 60;

const PHASE_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'Ascensão', label: 'Ascensão' },
  { id: 'Auge', label: 'Auge' },
  { id: 'Declínio', label: 'Declínio' },
  { id: 'Veterano', label: 'Veteranos' },
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
    .filter(a => phaseFilter === 'all' || a.career_phase === phaseFilter)
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
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
        <PageHeader icon={Users} title="Atletas do Circuito" subtitle="Personalidades, evolução e relacionamentos dos atletas IA" accent="primary" />
        <div className="glass rounded-2xl p-10 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-400/70 mx-auto mb-3" />
          <p className="text-sm font-bold">Não foi possível carregar os atletas do circuito.</p>
          <p className="mt-1 text-xs text-muted-foreground">Sua carreira e seu save não foram afetados.</p>
          <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={Users} title="Atletas do Circuito" subtitle="Personalidades, evolução e relacionamentos dos atletas IA" accent="primary" />

      <div className="glass rounded-2xl p-3 grid gap-3 md:grid-cols-[1fr_180px]">
        <label className="relative block">
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
      </div>

      <FilterPills filters={PHASE_FILTERS} activeFilter={phaseFilter} onFilterChange={setPhaseFilter} />
      <FilterPills filters={PERS_FILTERS} activeFilter={persFilter} onFilterChange={setPersFilter} />
      <FilterPills filters={STYLE_FILTERS} activeFilter={styleFilter} onFilterChange={setStyleFilter} />

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          {athletes.length === 0 ? (
            // A fonte carregou sem erro, mas realmente não retornou nenhum
            // atleta — diferente de "os filtros excluíram todo mundo"
            // (item 8: nunca confundir os dois).
            <>
              <p className="text-sm font-bold text-muted-foreground">O circuito ainda não tem atletas cadastrados.</p>
              <p className="mt-1 text-xs text-muted-foreground">Isso não é esperado numa carreira normal — tente recarregar a página.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum atleta encontrado com esses filtros.</p>
          )}
        </div>
      ) : (
        <div className="render-window grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-stagger">
          {filtered.slice(0, visibleCount).map(a => <AthleteCard key={a.id} athlete={a} onClick={() => setSelected(a)} />)}
        </div>
      )}

      {filtered.length > visibleCount && (
        <button type="button" onClick={() => setVisibleCount(value => value + PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">
          Carregar mais atletas ({Math.min(PAGE_SIZE, filtered.length - visibleCount)})
        </button>
      )}

      {selected && <AthleteDetail athlete={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
