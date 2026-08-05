import React, { useMemo, useState } from 'react';
import { ScrollText, Search, BookOpen, Calendar } from 'lucide-react';
import { HISTORY_ENTRIES, CATEGORY_CONFIG, IMPORTANCE_CONFIG, DECADES } from '@/lib/historyData';
import { TabBar, FilterPills } from '@/components/padel/ui';
import { Page, PageContent, PageHeader, Surface, StatCard, EmptyState } from '@/components/design-system';
import HistoryEntryCard from '@/components/history/HistoryEntryCard';
import HistoryEntryModal from '@/components/history/HistoryEntryModal';

export default function History() {
  const [activeTab, setActiveTab] = useState('timeline');
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);

  const filtered = useMemo(() => {
    return HISTORY_ENTRIES.filter(e => {
      if (activeCategory !== 'all' && e.category !== activeCategory) return false;
      if (search) {
        const s = search.toLowerCase();
        return e.title.toLowerCase().includes(s) || e.description.toLowerCase().includes(s) || (e.tags || []).some(t => t.includes(s));
      }
      return true;
    }).sort((a, b) => a.year - b.year);
  }, [activeCategory, search]);

  const relatedEntries = useMemo(() => {
    if (!selectedEntry?.related_entries) return [];
    return HISTORY_ENTRIES.filter(e => selectedEntry.related_entries.includes(e.title));
  }, [selectedEntry]);

  const categories = [{ id: 'all', label: 'Tudo' }, ...Object.entries(CATEGORY_CONFIG).map(([id, c]) => ({ id, label: c.label }))];

  return (
    <Page>
      <PageContent>
        <PageHeader eyebrow="Memória do esporte" title="História do Padel" description="Explore os acontecimentos que moldaram o esporte desde sua origem até o circuito moderno." icon={ScrollText} tone="premium" breadcrumb={['Mundo', 'História']} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard icon={Calendar} label="Período" value="1962–Hoje" tone="premium" />
          <StatCard icon={BookOpen} label="Eventos" value={HISTORY_ENTRIES.length} tone="info" />
          <StatCard icon={ScrollText} label="Resultados" value={filtered.length} />
        </div>

      <Surface padding="compact" className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar na história do padel..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </Surface>

      <FilterPills filters={categories} activeFilter={activeCategory} onFilterChange={setActiveCategory} />

      <TabBar
        tabs={[
          { key: 'timeline', label: 'Linha do Tempo', icon: Calendar },
          { key: 'encyclopedia', label: 'Enciclopédia', icon: BookOpen },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="segmented"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="Nada encontrado" description="Tente outra busca ou categoria histórica." />
      ) : activeTab === 'timeline' ? (
        <TimelineView entries={filtered} onSelect={setSelectedEntry} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 animate-stagger">
          {filtered.map(entry => (
            <HistoryEntryCard key={entry.title} entry={entry} onClick={() => setSelectedEntry(entry)} />
          ))}
        </div>
      )}

      <HistoryEntryModal
        entry={selectedEntry}
        relatedEntries={relatedEntries}
        onSelectRelated={setSelectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
      </PageContent>
    </Page>
  );
}

function TimelineView({ entries, onSelect }) {
  const grouped = useMemo(() => {
    const map = {};
    DECADES.forEach(d => { map[d] = []; });
    entries.forEach(e => {
      if (!map[e.decade]) map[e.decade] = [];
      map[e.decade].push(e);
    });
    return map;
  }, [entries]);

  return (
    <div className="space-y-6">
      {DECADES.map(decade => {
        const items = grouped[decade];
        if (!items || items.length === 0) return null;
        return (
          <div key={decade}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-black">{decade}s</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{items.length} eventos</p>
              </div>
              <div className="flex-1 h-px bg-border/40" />
            </div>
            <div className="relative pl-6 space-y-3">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border/40" />
              {items.map((entry, i) => (
                <TimelineItem key={entry.title + i} entry={entry} onClick={() => onSelect(entry)} delay={i * 0.05} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineItem({ entry, onClick, delay }) {
  const imp = IMPORTANCE_CONFIG[entry.importance] || IMPORTANCE_CONFIG.normal;
  return (
    <div
      className="relative cursor-pointer fade-up"
      style={{ animationDelay: `${delay}s` }}
      onClick={onClick}
    >
      <div className={`absolute -left-6 top-3 h-3 w-3 rounded-full ${imp.bg} border-2 ${imp.border} ring-4 ring-background`} />
      <div className="glass glass-hover rounded-xl p-3 hover-lift">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-black text-primary tabular-nums">{entry.year}</span>
          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${imp.bg} ${imp.color}`}>{imp.label}</span>
        </div>
        <h3 className="font-bold text-sm leading-tight mb-1">{entry.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{entry.description}</p>
      </div>
    </div>
  );
}