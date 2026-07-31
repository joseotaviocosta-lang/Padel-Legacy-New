import React, { useMemo, useState } from 'react';
import { Crown, Search, Trophy, Award, FileText } from 'lucide-react';
import { HOF_LEGENDS, HOF_CRITERIA, HOF_CATEGORY_CONFIG, HOF_TYPE_CONFIG } from '@/lib/hallOfFameData';
import { PageHeader, TabBar, FilterPills, EmptyStateCard } from '@/components/padel/ui';
import HallOfFameCard from '@/components/hof/HallOfFameCard';
import HallOfFameDetail from '@/components/hof/HallOfFameDetail';
import LegendComparison from '@/components/hof/LegendComparison';

export default function HallOfFame() {
  const [activeTab, setActiveTab] = useState('legends');
  const [activeType, setActiveType] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    return HOF_LEGENDS.filter(e => {
      if (activeType !== 'all' && e.entity_type !== activeType) return false;
      if (search) {
        const s = search.toLowerCase();
        return e.name.toLowerCase().includes(s) || (e.bio || '').toLowerCase().includes(s) || (e.nationality || '').toLowerCase().includes(s);
      }
      return true;
    }).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }, [activeType, search]);

  const types = [{ id: 'all', label: 'Todos' }, ...Object.entries(HOF_TYPE_CONFIG).map(([id, t]) => ({ id, label: t.label }))];

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <PageHeader icon={Crown} title="Hall da Fama" subtitle="As maiores lendas da história do padel" accent="amber" />

      <TabBar
        tabs={[
          { key: 'legends', label: 'Lendas', icon: Crown },
          { key: 'criteria', label: 'Critérios', icon: FileText },
          { key: 'compare', label: 'Comparações', icon: Award },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="segmented"
      />

      {activeTab === 'legends' && (
        <>
          <div className="glass rounded-2xl p-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar lendas..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <FilterPills filters={types} activeFilter={activeType} onFilterChange={setActiveType} />
          {filtered.length === 0 ? (
            <EmptyStateCard icon={Crown} title="Nenhuma lenda encontrada" message="Tente outra busca ou filtro." />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 animate-stagger">
              {filtered.map(entry => (
                <HallOfFameCard key={entry.name} entry={entry} onClick={() => setSelected(entry)} />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'criteria' && <CriteriaView />}
      {activeTab === 'compare' && <LegendComparison legends={HOF_LEGENDS} />}

      <HallOfFameDetail entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CriteriaView() {
  return (
    <div className="space-y-4 animate-stagger">
      {Object.entries(HOF_CRITERIA).map(([type, criteria]) => {
        const typeConfig = HOF_TYPE_CONFIG[type] || {};
        return (
          <div key={type} className="glass rounded-2xl p-4">
            <h3 className="text-sm font-black mb-1 capitalize">{typeConfig.label || type}</h3>
            <p className="text-[11px] text-muted-foreground mb-3">Critérios para indução ao Hall da Fama como {typeConfig.label || type}</p>
            <div className="space-y-2">
              {criteria.map(c => (
                <div key={c.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-secondary/30">
                  <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Trophy className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-xs font-bold">{c.label}</p>
                      <span className="text-[10px] font-black text-primary">{c.weight}%</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{c.description}</p>
                    <p className="text-[10px] text-amber-400 mt-0.5">Mínimo: {c.min}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}