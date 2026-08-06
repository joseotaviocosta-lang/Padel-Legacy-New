import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, Sparkles, Tags, TrendingUp, X } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { EmptyStateCard, LoadingScreen } from '@/components/padel/ui';
import { CardGrid, Page, PageContent, PageHeader, PageSection, StatCard, StatusBadge, Surface, SurfaceHeader } from '@/components/design-system';
import { ENCYCLOPEDIA_CATEGORIES, ENCYCLOPEDIA_ENTRIES } from '@/lib/encyclopediaData';
import EncyclopediaCard from '@/components/encyclopedia/EncyclopediaCard';
import EncyclopediaDetail from '@/components/encyclopedia/EncyclopediaDetail';
import { safeModuleTask } from '@/lib/moduleLoading';

export default function Encyclopedia() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const existing = await safeModuleTask(() => localGame.entities.EncyclopediaEntry.list('-created_date', 500), { label: 'enciclopédia', fallback: [] });
        const existingNames = new Set((existing || []).map((entry) => entry.name));
        const missing = ENCYCLOPEDIA_ENTRIES.filter((entry) => !existingNames.has(entry.name));
        if (missing.length > 0) {
          await safeModuleTask(() => localGame.entities.EncyclopediaEntry.bulkCreate(missing), { label: 'criação da enciclopédia', fallback: null });
          const all = await safeModuleTask(() => localGame.entities.EncyclopediaEntry.list('-created_date', 500), { label: 'releitura da enciclopédia', fallback: ENCYCLOPEDIA_ENTRIES });
          setEntries(all || ENCYCLOPEDIA_ENTRIES);
        } else setEntries(existing || []);
      } catch (error) {
        console.error(error);
        setEntries(ENCYCLOPEDIA_ENTRIES);
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = entries;
    if (category !== 'all') result = result.filter((entry) => entry.category === category);
    if (showFeaturedOnly) result = result.filter((entry) => entry.is_featured);
    if (search) {
      const query = search.toLowerCase();
      result = result.filter((entry) => entry.name?.toLowerCase().includes(query) || entry.summary?.toLowerCase().includes(query) || entry.content?.toLowerCase().includes(query) || (entry.tags || []).some((tag) => tag.toLowerCase().includes(query)));
    }
    return result;
  }, [entries, category, search, showFeaturedOnly]);

  const featured = useMemo(() => entries.filter((entry) => entry.is_featured).slice(0, 4), [entries]);
  const categoryCounts = useMemo(() => entries.reduce((counts, entry) => ({ ...counts, [entry.category]: (counts[entry.category] || 0) + 1 }), {}), [entries]);
  const categoryTotal = Object.keys(categoryCounts).length;

  function findEntryByName(name) {
    const found = entries.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (found) setSelected(found);
  }

  if (loading) return <LoadingScreen />;

  return (
    <Page size="default">
      <PageContent>
        <PageHeader
          eyebrow="Conhecimento do circuito"
          title="Enciclopédia Padel Legacy"
          description="Regras, termos, atletas, clubes e histórias para compreender todo o universo do jogo."
          icon={BookOpen}
          tone="info"
          breadcrumb={['Mundo', 'Enciclopédia']}
          stats={[
            <StatusBadge key="entries" tone="info" icon={BookOpen}>{entries.length} entradas</StatusBadge>,
            <StatusBadge key="categories" tone="brand" icon={Tags}>{categoryTotal} categorias</StatusBadge>,
          ]}
        />

        <CardGrid columns={3}>
          <StatCard label="Entradas" value={entries.length} detail="Base total de conhecimento" icon={BookOpen} tone="info" />
          <StatCard label="Em destaque" value={entries.filter((entry) => entry.is_featured).length} detail="Conteúdos recomendados" icon={Sparkles} tone="premium" />
          <StatCard label="Resultados" value={filtered.length} detail="Com os filtros atuais" icon={Search} tone="brand" />
        </CardGrid>

        {featured.length > 0 && !search && category === 'all' && (
          <Surface variant="premium">
            <SurfaceHeader title="Em destaque" description="Conteúdos essenciais para compreender melhor a carreira e o circuito." icon={Sparkles} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((entry) => (
                <button key={entry.id || entry.name} onClick={() => setSelected(entry)} className="rounded-xl border border-border/65 bg-background/35 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
                  <span className={`text-[9px] font-extrabold uppercase tracking-wide ${ENCYCLOPEDIA_CATEGORIES[entry.category]?.color || 'text-primary'}`}>{ENCYCLOPEDIA_CATEGORIES[entry.category]?.label || ''}</span>
                  <p className="mt-1 line-clamp-2 text-sm font-bold leading-tight">{entry.name}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{entry.summary}</p>
                </button>
              ))}
            </div>
          </Surface>
        )}

        <PageSection>
          <Surface padding="compact" className="sticky top-2 z-10 backdrop-blur-xl">
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" placeholder="Buscar atletas, clubes, termos ou regras..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-border/60 bg-secondary/45 py-2.5 pl-9 pr-9 text-sm outline-none transition-colors focus:border-primary/45" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>}
                </div>
                <button onClick={() => setShowFeaturedOnly(!showFeaturedOnly)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${showFeaturedOnly ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border/60 bg-secondary/45 text-muted-foreground'}`} aria-label="Mostrar apenas destaques"><TrendingUp className="h-4 w-4" /></button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <CategoryPill label="Todos" count={entries.length} active={category === 'all'} onClick={() => setCategory('all')} />
                {Object.entries(ENCYCLOPEDIA_CATEGORIES).map(([key, meta]) => {
                  const count = categoryCounts[key] || 0;
                  if (count === 0) return null;
                  return <CategoryPill key={key} label={meta.label} count={count} active={category === key} onClick={() => setCategory(key)} />;
                })}
              </div>
            </div>
          </Surface>

          {filtered.length === 0 ? (
            <EmptyStateCard icon={BookOpen} message="Nenhuma entrada encontrada com esses filtros." />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 animate-stagger">
              {filtered.map((entry) => <EncyclopediaCard key={entry.id || entry.name} entry={entry} onClick={setSelected} />)}
            </div>
          )}
        </PageSection>

        {selected && <EncyclopediaDetail entry={selected} onRelated={findEntryByName} onClose={() => setSelected(null)} />}
      </PageContent>
    </Page>
  );
}

function CategoryPill({ label, count, active, onClick }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:text-foreground'}`}>{label}<span className="text-[9px] opacity-60">({count})</span></button>;
}
