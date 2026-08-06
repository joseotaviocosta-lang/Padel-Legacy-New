import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Megaphone, RefreshCw, Star, TrendingUp, Users } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { LoadingScreen, EmptyStateCard, FilterPills } from '@/components/padel/ui';
import { CardGrid, Page, PageContent, PageHeader, PageSection, ProgressBar, StatCard, StatusBadge, Surface, SurfaceHeader } from '@/components/design-system';
import FanBaseCard from '@/components/fans/FanBaseCard';
import FanBaseDetail from '@/components/fans/FanBaseDetail';
import { BEHAVIOR_TYPES } from '@/lib/fanBase';
import { evaluateMonthlyFanEngagement, getFanEvaluationStatus, getOrCreatePlayerFanBase } from '@/game-core';

const FILTERS = [
  { id: 'all', label: 'Todos' }, { id: 'clube', label: 'Clubes' },
  { id: 'atleta', label: 'Atletas' }, { id: 'jogador', label: 'Jogadores' },
];
const BEHAVIOR_FILTERS = [
  { id: 'all', label: 'Comportamentos' },
  ...Object.entries(BEHAVIOR_TYPES).map(([id, b]) => ({ id, label: `${b.emoji} ${b.label}` })),
];

export default function Fans() {
  const [fanBases, setFanBases] = useState([]);
  const [profile, setProfile] = useState(null);
  const [playerFanBase, setPlayerFanBase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [notice, setNotice] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [behaviorFilter, setBehaviorFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState('fans');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const user = await localGame.auth.me();
      const profiles = await localGame.entities.PlayerProfile.filter({ user_id: user?.id });
      const activeProfile = profiles?.[0] || (await localGame.entities.PlayerProfile.list('-created_date', 1))?.[0];
      setProfile(activeProfile || null);
      if (activeProfile) setPlayerFanBase(await getOrCreatePlayerFanBase(activeProfile));
      setFanBases((await localGame.entities.FanBase.list('-total_fans', 200)) || []);
    } catch (error) {
      console.error(error);
      setNotice('Não foi possível carregar os dados da torcida.');
    }
    setLoading(false);
  }

  async function evaluate() {
    if (!profile || evaluating) return;
    setEvaluating(true);
    setNotice('');
    try {
      const result = await evaluateMonthlyFanEngagement(profile);
      setPlayerFanBase(result.fanBase);
      setNotice(result.skipped ? result.message : `Avaliação concluída: ${result.fanChange >= 0 ? '+' : ''}${result.fanChange.toLocaleString('pt-BR')} fãs.`);
      await load();
    } catch (error) {
      console.error(error);
      setNotice(error.message || 'Não foi possível avaliar a torcida.');
    }
    setEvaluating(false);
  }

  const filtered = useMemo(() => {
    let list = [...fanBases];
    if (typeFilter !== 'all') list = list.filter((f) => f.entity_type === typeFilter);
    if (behaviorFilter !== 'all') list = list.filter((f) => f.behavior === behaviorFilter);
    const key = sort === 'fans' ? 'total_fans' : sort;
    return list.sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0));
  }, [fanBases, typeFilter, behaviorFilter, sort]);

  const totalFans = fanBases.reduce((sum, f) => sum + Number(f.total_fans || 0), 0);
  const viralClubs = fanBases.filter((f) => f.trend === 'subindo').length;
  const status = getFanEvaluationStatus(playerFanBase, profile?.career_date);
  const playerFans = Number(playerFanBase?.total_fans || 0);
  const playerMorale = Number(playerFanBase?.morale || 0);
  const playerPopularity = Number(playerFanBase?.popularity || 0);

  if (loading) return <LoadingScreen />;

  return (
    <Page size="default">
      <PageContent>
        <PageHeader
          eyebrow="Universo e comunidade"
          title="Torcidas"
          description="Acompanhe popularidade, moral, crescimento e o comportamento das bases de fãs do circuito."
          icon={Megaphone}
          tone="info"
          breadcrumb={['Mundo', 'Torcidas']}
          action={profile && playerFanBase ? (
            <button onClick={evaluate} disabled={evaluating || status.isComplete} className="pl-button pl-button-primary inline-flex items-center gap-2 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${evaluating ? 'animate-spin' : ''}`} />
              {status.isComplete ? 'Mês avaliado' : evaluating ? 'Avaliando...' : 'Avaliar mês'}
            </button>
          ) : null}
          stats={[
            <StatusBadge key="bases" tone="info" icon={Users}>{fanBases.length} bases monitoradas</StatusBadge>,
            <StatusBadge key="trend" tone={viralClubs > 0 ? 'success' : 'neutral'} icon={TrendingUp}>{viralClubs} em alta</StatusBadge>,
          ]}
        />

        <CardGrid columns={4}>
          <StatCard label="Sua torcida" value={playerFans.toLocaleString('pt-BR')} detail="Seguidores da carreira" icon={Users} tone="brand" />
          <StatCard label="Popularidade" value={playerPopularity} detail="Reconhecimento público" icon={Star} tone="premium" />
          <StatCard label="Moral da torcida" value={playerMorale} detail="Humor atual dos fãs" icon={Activity} tone={playerMorale >= 65 ? 'success' : playerMorale >= 40 ? 'warning' : 'danger'} />
          <StatCard label="Circuito monitorado" value={totalFans.toLocaleString('pt-BR')} detail="Fãs em todas as bases" icon={Megaphone} tone="info" />
        </CardGrid>

        {profile && playerFanBase && (
          <Surface variant="elevated">
            <SurfaceHeader title="Sua base de fãs" description="A evolução da torcida influencia popularidade, patrocínios e presença no Universo Vivo." icon={Users} />
            <div className="grid gap-4 md:grid-cols-2">
              <ProgressBar value={playerMorale} label="Moral" valueLabel={`${playerMorale}/100`} tone={playerMorale >= 65 ? 'success' : 'warning'} />
              <ProgressBar value={playerPopularity} label="Popularidade" valueLabel={`${playerPopularity}/100`} tone="premium" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge tone={playerFanBase.trend === 'subindo' ? 'success' : playerFanBase.trend === 'caindo' ? 'danger' : 'neutral'}>
                Tendência: {playerFanBase.trend || 'estável'}
              </StatusBadge>
              {playerFanBase.monthly_fan_change !== undefined && (
                <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-success" />Última variação: {playerFanBase.monthly_fan_change >= 0 ? '+' : ''}{Number(playerFanBase.monthly_fan_change).toLocaleString('pt-BR')} fãs</span>
              )}
            </div>
            {notice && <p className="mt-3 text-xs text-muted-foreground">{notice}</p>}
          </Surface>
        )}

        <PageSection>
          <Surface padding="compact">
            <div className="space-y-3">
              <FilterPills filters={FILTERS} activeFilter={typeFilter} onFilterChange={setTypeFilter} />
              <FilterPills filters={BEHAVIOR_FILTERS} activeFilter={behaviorFilter} onFilterChange={setBehaviorFilter} />
              <div className="flex flex-wrap gap-2">
                {[{ id: 'fans', label: 'Mais fãs' }, { id: 'popularity', label: 'Popularidade' }, { id: 'morale', label: 'Moral' }].map((item) => (
                  <button key={item.id} onClick={() => setSort(item.id)} className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${sort === item.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/65 text-muted-foreground hover:text-foreground'}`}>{item.label}</button>
                ))}
              </div>
            </div>
          </Surface>

          {filtered.length === 0 ? (
            <EmptyStateCard icon={Megaphone} message="Nenhuma torcida encontrada com esses filtros." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 animate-stagger">
              {filtered.slice(0, 40).map((fanBase) => <FanBaseCard key={fanBase.id} fanBase={fanBase} onClick={() => setSelected(fanBase)} />)}
            </div>
          )}
        </PageSection>

        {selected && <FanBaseDetail fanBase={selected} onClose={() => setSelected(null)} onUpdate={(updated) => { setSelected(updated); setFanBases((prev) => prev.map((fanBase) => fanBase.id === updated.id ? updated : fanBase)); }} />}
      </PageContent>
    </Page>
  );
}
