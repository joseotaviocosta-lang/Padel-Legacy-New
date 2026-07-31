import React, { useMemo, useState } from 'react';
import { ScrollText, Search, BookOpen, Calendar } from 'lucide-react';
import { HISTORY_ENTRIES, CATEGORY_CONFIG, IMPORTANCE_CONFIG, DECADES } from '@/lib/historyData';
import { PageHeader, TabBar, FilterPills, EmptyStateCard } from '@/components/padel/ui';
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
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <PageHeader icon={ScrollText} title="História do Padel" subtitle="Da fundação em 1962 aos dias atuais" accent="amber" />

      <div className="glass rounded-2xl p-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar na história do padel..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

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
        <EmptyStateCard icon={Search} title="Nada encontrado" message="Tente outra busca ou filtro." />
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
    </div>
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