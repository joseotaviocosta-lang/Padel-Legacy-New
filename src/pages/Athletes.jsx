import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Search, SlidersHorizontal, AlertTriangle, Trophy, ListFilter, X } from 'lucide-react';
import { ensureMyProfile, buildWorldRankingSnapshot } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
// Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.10): migrado do wrapper
// deprecated em padel/ui.jsx (ambos marcados "@deprecated" no próprio
// arquivo) para os primitives reais do design-system — esta era a única
// página do app inteiro ainda fora de Page/PageContent.
import { EmptyState, Page, PageContent, PageHeader, PageSkeleton, Tabs } from '@/components/design-system';
import { ensureAthleteProfiles, generateRelationships, PERSONALITIES } from '@/lib/athleteBehavior';
import {
  DIRECTORY_SEGMENTS, buildStandingIndex, compareAthletes, inSegment, matchesAthleteSearch, standingOf, styleLabel, styleOptions,
} from '@/lib/athleteProfileDisplay.js';
import AthleteCard from '@/components/athletes/AthleteCard';
import AthleteDetail from '@/components/athletes/AthleteDetail';

const PAGE_SIZE = 60;

// Fase 5.32-C — Diretório de atletas: cabeçalho compacto → busca → recortes
// → lista → perfil sob demanda.
//   - população: o catálogo INTEIRO de atletas (antes só os 200 de maior
//     OVR — o "Top 100" deixava de fora 31 a 52 dos 100 primeiros do ranking
//     e aposentados/atletas comuns não eram encontráveis);
//   - posição: a Mundial atual pela autoridade do Ranking (snapshot), sem
//     cair no `ranking_position` gravado pelo circuito;
//   - busca sem acento por nome e país; recortes com definição documentada
//     em athleteProfileDisplay.js; estilos vindos dos dados;
//   - perfil por deep link (`?athlete=<id>`, só leitura), como no Ranking;
//     parceiros e ex-parceiros abrem dentro do perfil, com "voltar para".
// Só leitura ao abrir o perfil. A montagem segue chamando
// ensureAthleteProfiles (cria só bots ausentes) e generateRelationships,
// como antes desta fase.
export default function Athletes() {
  const [searchParams] = useSearchParams();
  const [athletes, setAthletes] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Hotfix pré-beta (docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md, item 8): a fonte
  // pode falhar (exceção real) sem que isso seja o mesmo que "os filtros não
  // encontraram ninguém". `sourceError` distingue os dois.
  const [sourceError, setSourceError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [standingIndex, setStandingIndex] = useState(null);
  const [segment, setSegment] = useState('all');
  const [persFilter, setPersFilter] = useState('all');
  const [styleFilter, setStyleFilter] = useState('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [trail, setTrail] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('ranking');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredSearch = useDeferredValue(search);
  const openedFromUrlRef = useRef(null);

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
        // Catálogo inteiro (sem o corte de 200 de getAthletes()).
        const list = await localGame.entities.AthleteProfile.list('-overall_rating');
        if (!active) return;
        setAthletes(list || []);
        // Posição canônica (buildWorldRankingSnapshot, a mesma do Ranking).
        if (p) {
          const snapshot = await buildWorldRankingSnapshot(p);
          if (!active) return;
          setStandingIndex(buildStandingIndex(snapshot));
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
  }, [segment, persFilter, styleFilter, deferredSearch, sortBy]);

  const rankOf = useCallback((id) => standingIndex?.world.get(id)?.rank || null, [standingIndex]);
  const byId = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes]);
  const styles = useMemo(() => styleOptions(athletes), [athletes]);

  const filtered = useMemo(() => athletes
    .filter((a) => inSegment(a, segment, rankOf(a.id)))
    .filter((a) => persFilter === 'all' || a.personality === persFilter)
    .filter((a) => styleFilter === 'all' || styleLabel(a) === styleFilter)
    .filter((a) => matchesAthleteSearch(a, deferredSearch))
    .sort(compareAthletes(sortBy, rankOf)), [athletes, segment, persFilter, styleFilter, deferredSearch, sortBy, rankOf]);

  // Deep link: /world/directory?tab=athletes&athlete=<id> abre o perfil (uma vez).
  useEffect(() => {
    const requested = searchParams.get('athlete');
    if (!requested || loading || openedFromUrlRef.current === requested) return;
    if (byId.has(requested)) {
      openedFromUrlRef.current = requested;
      setSelectedId(requested);
    }
  }, [searchParams, loading, byId]);

  // A URL não é reescrita com o modal aberto: o ModalShell guarda a própria
  // entrada de histórico (overlayBackStack) e um replace a sobrescreveria,
  // quebrando o "voltar". Mesmo modelo do Ranking (?athlete só é lido).
  // Entre perfis (parceiro, ex-parceiros) a navegação é dentro do modal,
  // com "voltar para" o perfil anterior.
  const openAthlete = useCallback((id) => {
    if (!byId.has(id)) return;
    setTrail([]);
    setSelectedId(id);
  }, [byId]);
  const openFromProfile = useCallback((id) => {
    if (!byId.has(id) || id === selectedId) return;
    setTrail((current) => (selectedId ? [...current, selectedId] : current));
    setSelectedId(id);
  }, [byId, selectedId]);
  const backInTrail = useCallback(() => {
    setTrail((current) => {
      const previous = current[current.length - 1];
      if (previous) setSelectedId(previous);
      return current.slice(0, -1);
    });
  }, []);
  const closeAthlete = useCallback(() => { setSelectedId(null); setTrail([]); }, []);

  const PERS_FILTERS = [{ id: 'all', label: 'Todas as personalidades' }, ...PERSONALITIES.map((p) => ({ id: p.id, label: p.label }))];
  const extraFilters = (persFilter !== 'all' ? 1 : 0) + (styleFilter !== 'all' ? 1 : 0);
  const selected = selectedId ? byId.get(selectedId) || null : null;

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

  const activeCount = athletes.length - athletes.filter((a) => inSegment(a, 'retired')).length;
  const playerRank = profile?.id ? rankOf(profile.id) : null;

  return (
    <Page><PageContent>
      <PageHeader dense icon={Users} title="Atletas" description="Encontre atletas, veja posição, nível, parceiro e carreira" tone="brand" hudLabel="Scouting do circuito" hudItems={[
        { label: `na lista · ${activeCount} em atividade`, value: filtered.length, icon: ListFilter, tone: 'info' },
        { label: 'sua posição', value: playerRank ? `#${playerRank}` : 'sem ranking', icon: Trophy, tone: 'premium' },
      ]} />

      <div className="space-y-2" data-directory-controls>
        <div className="flex min-w-0 gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Buscar atleta</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar atleta ou país..."
              className="min-h-11 w-full rounded-xl border border-border bg-background/50 py-2 pl-9 pr-9 text-sm"
              data-directory-search
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setShowMoreFilters((value) => !value)}
            aria-expanded={showMoreFilters}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${extraFilters ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground'}`}
            data-directory-filter="more"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Filtros</span>
            {extraFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{extraFilters}</span>}
          </button>
        </div>

        {showMoreFilters && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-directory-more-filters>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Ordenar" className="min-h-11 rounded-xl border border-border bg-background/50 px-3 text-sm">
              <option value="ranking">Ordenar: ranking mundial</option>
              <option value="overall">Ordenar: OVR</option>
              <option value="form">Ordenar: melhor forma</option>
              <option value="clutch">Ordenar: decisões</option>
            </select>
            <select value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} aria-label="Filtrar estilo" className="min-h-11 rounded-xl border border-border bg-background/50 px-3 text-sm">
              <option value="all">Todos os estilos</option>
              {styles.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={persFilter} onChange={(e) => setPersFilter(e.target.value)} aria-label="Filtrar personalidade" className="min-h-11 rounded-xl border border-border bg-background/50 px-3 text-sm">
              {PERS_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        )}

        <Tabs tabs={DIRECTORY_SEGMENTS.map((f) => ({ key: f.id, label: f.label }))} activeTab={segment} onTabChange={setSegment} variant="buttons" />
      </div>

      {filtered.length === 0 ? (
        athletes.length === 0 ? (
          <EmptyState icon={Users} title="O circuito ainda não tem atletas cadastrados" description="Isso não é esperado numa carreira normal — tente recarregar a página." />
        ) : (
          <EmptyState icon={Users} title="Nenhum atleta encontrado" description="Nenhum atleta encontrado com esses filtros." />
        )
      ) : (
        <div className="render-window overflow-hidden rounded-2xl border border-border/55 bg-card/40" data-directory-list>
          {filtered.slice(0, visibleCount).map((a) => (
            <AthleteCard key={a.id} athlete={a} worldRank={rankOf(a.id)} onClick={() => openAthlete(a.id)} />
          ))}
        </div>
      )}

      {filtered.length > visibleCount && (
        <button type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">
          Carregar mais atletas ({Math.min(PAGE_SIZE, filtered.length - visibleCount)} de {filtered.length - visibleCount})
        </button>
      )}

      {selected && (
        <AthleteDetail
          athlete={selected}
          standing={standingOf(standingIndex, selected.id)}
          onClose={closeAthlete}
          onOpenAthlete={openFromProfile}
          back={trail.length ? { name: byId.get(trail[trail.length - 1])?.name || 'perfil anterior', onBack: backInTrail } : null}
        />
      )}
    </PageContent></Page>
  );
}
