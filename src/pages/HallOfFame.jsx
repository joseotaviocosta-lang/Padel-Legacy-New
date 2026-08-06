import React, { useMemo, useState } from 'react';
import { Award, Crown, FileText, Search, Trophy, Users } from 'lucide-react';
import { HOF_CRITERIA, HOF_LEGENDS, HOF_TYPE_CONFIG } from '@/lib/hallOfFameData';
import { EmptyStateCard, FilterPills, TabBar } from '@/components/padel/ui';
import { CardGrid, Page, PageContent, PageHeader, PageSection, StatCard, StatusBadge, Surface } from '@/components/design-system';
import HallOfFameCard from '@/components/hof/HallOfFameCard';
import HallOfFameDetail from '@/components/hof/HallOfFameDetail';
import LegendComparison from '@/components/hof/LegendComparison';

export default function HallOfFame() {
  const [activeTab, setActiveTab] = useState('legends');
  const [activeType, setActiveType] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => HOF_LEGENDS.filter((entry) => {
    if (activeType !== 'all' && entry.entity_type !== activeType) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return entry.name.toLowerCase().includes(term) || (entry.bio || '').toLowerCase().includes(term) || (entry.nationality || '').toLowerCase().includes(term);
  }).sort((a, b) => (b.rating || 0) - (a.rating || 0)), [activeType, search]);

  const types = [{ id: 'all', label: 'Todos' }, ...Object.entries(HOF_TYPE_CONFIG).map(([id, type]) => ({ id, label: type.label }))];
  const averageRating = HOF_LEGENDS.length ? Math.round(HOF_LEGENDS.reduce((sum, legend) => sum + Number(legend.rating || 0), 0) / HOF_LEGENDS.length) : 0;
  const countries = new Set(HOF_LEGENDS.map((legend) => legend.nationality).filter(Boolean)).size;
  const entityTypes = new Set(HOF_LEGENDS.map((legend) => legend.entity_type).filter(Boolean)).size;

  return (
    <Page size="default">
      <PageContent>
        <PageHeader
          eyebrow="Memória do circuito"
          title="Hall da Fama"
          description="As maiores lendas, duplas e profissionais que construíram a história do padel."
          icon={Crown}
          tone="premium"
          breadcrumb={['Mundo', 'História', 'Hall da Fama']}
          stats={[
            <StatusBadge key="legends" tone="premium" icon={Crown}>{HOF_LEGENDS.length} homenageados</StatusBadge>,
            <StatusBadge key="types" tone="info" icon={Users}>{entityTypes} categorias</StatusBadge>,
          ]}
        />

        <CardGrid columns={3}>
          <StatCard label="Lendas registradas" value={HOF_LEGENDS.length} detail="Histórias preservadas" icon={Crown} tone="premium" />
          <StatCard label="Nota média" value={averageRating} detail="Avaliação histórica" icon={Award} tone="brand" />
          <StatCard label="Países representados" value={countries} detail="Alcance internacional" icon={Trophy} tone="info" />
        </CardGrid>

        <Surface padding="compact" className="sticky top-2 z-10 backdrop-blur-xl">
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
        </Surface>

        {activeTab === 'legends' && (
          <PageSection>
            <Surface padding="compact">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-secondary/55 px-3 py-2.5">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lendas, países ou histórias..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                </div>
                <FilterPills filters={types} activeFilter={activeType} onFilterChange={setActiveType} />
              </div>
            </Surface>

            {filtered.length === 0 ? (
              <EmptyStateCard icon={Crown} title="Nenhuma lenda encontrada" message="Tente outra busca ou filtro." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 animate-stagger">
                {filtered.map((entry) => <HallOfFameCard key={entry.name} entry={entry} onClick={() => setSelected(entry)} />)}
              </div>
            )}
          </PageSection>
        )}

        {activeTab === 'criteria' && <CriteriaView />}
        {activeTab === 'compare' && <LegendComparison legends={HOF_LEGENDS} />}

        <HallOfFameDetail entry={selected} onClose={() => setSelected(null)} />
      </PageContent>
    </Page>
  );
}

function CriteriaView() {
  return (
    <div className="space-y-4 animate-stagger">
      {Object.entries(HOF_CRITERIA).map(([type, criteria]) => {
        const typeConfig = HOF_TYPE_CONFIG[type] || {};
        return (
          <Surface key={type} variant="elevated">
            <div className="mb-4">
              <StatusBadge tone="premium">{typeConfig.label || type}</StatusBadge>
              <h3 className="mt-2 text-lg font-black">Critérios de indução</h3>
              <p className="mt-1 text-xs text-muted-foreground">Requisitos utilizados para reconhecer uma carreira histórica nesta categoria.</p>
            </div>
            <div className="space-y-2">
              {criteria.map((criterion) => (
                <div key={criterion.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/35 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Trophy className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">{criterion.label}</p><strong className="text-xs text-primary">{criterion.weight}%</strong></div>
                    <p className="mt-1 text-xs text-muted-foreground">{criterion.description}</p>
                    <p className="mt-1 text-[11px] font-semibold text-premium">Mínimo: {criterion.min}</p>
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        );
      })}
    </div>
  );
}
