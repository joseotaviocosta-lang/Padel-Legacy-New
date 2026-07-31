import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen, Search, Sparkles, TrendingUp, X } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { LoadingScreen, PageHeader, EmptyStateCard, GlassCard } from '@/components/padel/ui';
import { ENCYCLOPEDIA_ENTRIES, ENCYCLOPEDIA_CATEGORIES } from '@/lib/encyclopediaData';
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
        const existing = await safeModuleTask(
          () => localGame.entities.EncyclopediaEntry.list('-created_date', 500),
          { label: 'enciclopédia', fallback: [] },
        );
        const existingNames = new Set((existing || []).map(e => e.name));
        const missing = ENCYCLOPEDIA_ENTRIES.filter(e => !existingNames.has(e.name));
        if (missing.length > 0) {
          await safeModuleTask(() => localGame.entities.EncyclopediaEntry.bulkCreate(missing), { label: 'criação da enciclopédia', fallback: null });
          const all = await safeModuleTask(
            () => localGame.entities.EncyclopediaEntry.list('-created_date', 500),
            { label: 'releitura da enciclopédia', fallback: ENCYCLOPEDIA_ENTRIES },
          );
          setEntries(all || ENCYCLOPEDIA_ENTRIES);
        } else {
          setEntries(existing || []);
        }
      } catch (e) {
        console.error(e);
        setEntries(ENCYCLOPEDIA_ENTRIES);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = entries;
    if (category !== 'all') result = result.filter(e => e.category === category);
    if (showFeaturedOnly) result = result.filter(e => e.is_featured);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.name?.toLowerCase().includes(q) ||
        e.summary?.toLowerCase().includes(q) ||
        e.content?.toLowerCase().includes(q) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [entries, category, search, showFeaturedOnly]);

  const featured = useMemo(() => entries.filter(e => e.is_featured).slice(0, 4), [entries]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    entries.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });
    return counts;
  }, [entries]);

  function findEntryByName(name) {
    const found = entries.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (found) setSelected(found);
  }

  if (loading) return <LoadingScreen />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={BookOpen} title="Enciclopédia Padel Legacy" subtitle={`${entries.length} entradas sobre o universo do padel`} accent="primary">
        <span className="text-xs text-muted-foreground">📚 Conhecimento total</span>
      </PageHeader>

      {/* Featured carousel */}
      {featured.length > 0 && !search && category === 'all' && (
        <GlassCard className="border-primary/30">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h2 className="font-bold text-sm">Em Destaque</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {featured.map(e => (
              <button key={e.id} onClick={() => setSelected(e)} className="glass rounded-xl p-2.5 text-left hover:border-primary/40 transition-all group">
                <span className={`text-[8px] font-bold uppercase tracking-wide ${ENCYCLOPEDIA_CATEGORIES[e.category]?.color || 'text-primary'}`}>
                  {ENCYCLOPEDIA_CATEGORIES[e.category]?.label || ''}
                </span>
                <p className="font-bold text-[11px] leading-tight line-clamp-2 mt-0.5 group-hover:text-primary">{e.name}</p>
                <p className="text-[9px] text-muted-foreground line-clamp-1 mt-0.5">{e.summary}</p>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar atletas, clubes, termos, regras..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl glass text-sm focus:outline-none focus:border-primary/40"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
          className={`px-3 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-1.5 ${showFeaturedOnly ? 'bg-primary/15 text-primary' : 'glass text-muted-foreground'}`}
        >
          <TrendingUp className="h-4 w-4" />
        </button>
      </div>

      {/* Category filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        <CategoryPill label="Todos" count={entries.length} active={category === 'all'} onClick={() => setCategory('all')} />
        {Object.entries(ENCYCLOPEDIA_CATEGORIES).map(([key, meta]) => {
          const count = categoryCounts[key] || 0;
          if (count === 0) return null;
          return (
            <CategoryPill
              key={key}
              label={meta.label}
              count={count}
              active={category === key}
              onClick={() => setCategory(key)}
              color={meta.color}
            />
          );
        })}
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground px-1">
        {filtered.length} {filtered.length === 1 ? 'entrada encontrada' : 'entradas encontradas'}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyStateCard icon={BookOpen} message="Nenhuma entrada encontrada com esses filtros." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-stagger">
          {filtered.map(entry => (
            <EncyclopediaCard key={entry.id || entry.name} entry={entry} onClick={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <EncyclopediaDetail
          entry={selected}
          onRelated={findEntryByName}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function CategoryPill({ label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
        active ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {count > 0 && <span className={`text-[9px] ${active ? 'opacity-70' : 'opacity-50'}`}>({count})</span>}
    </button>
  );
}