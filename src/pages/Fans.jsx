import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, Users, Star, Activity, RefreshCw, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { PageHeader, LoadingScreen, EmptyStateCard, FilterPills } from '@/components/padel/ui';
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
      const user = await base44.auth.me();
      const profiles = await base44.entities.PlayerProfile.filter({ user_id: user?.id });
      const activeProfile = profiles?.[0] || (await base44.entities.PlayerProfile.list('-created_date', 1))?.[0];
      setProfile(activeProfile || null);
      if (activeProfile) setPlayerFanBase(await getOrCreatePlayerFanBase(activeProfile));
      setFanBases((await base44.entities.FanBase.list('-total_fans', 200)) || []);
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
  const avgMorale = fanBases.length ? Math.round(fanBases.reduce((s, f) => s + Number(f.morale || 0), 0) / fanBases.length) : 0;
  const viralClubs = fanBases.filter((f) => f.trend === 'subindo').length;
  const status = getFanEvaluationStatus(playerFanBase, profile?.career_date);

  if (loading) return <LoadingScreen />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <PageHeader icon={Megaphone} title="Torcidas" subtitle="Popularidade, moral e crescimento da sua base de fãs" accent="primary" />

      {profile && playerFanBase && (
        <div className="glass rounded-2xl p-4 space-y-3 border border-primary/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Sua torcida</p>
              <h2 className="text-lg font-black">{playerFanBase.total_fans?.toLocaleString('pt-BR')} fãs</h2>
              <p className="text-xs text-muted-foreground">Moral {playerFanBase.morale}/100 · Popularidade {playerFanBase.popularity}/100 · Tendência {playerFanBase.trend}</p>
            </div>
            <button onClick={evaluate} disabled={evaluating || status.isComplete} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              <RefreshCw className={`h-4 w-4 ${evaluating ? 'animate-spin' : ''}`} />
              {status.isComplete ? 'Mês já avaliado' : evaluating ? 'Avaliando...' : 'Avaliar mês'}
            </button>
          </div>
          {playerFanBase.monthly_fan_change !== undefined && (
            <div className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-green-400" /><span>Última variação: {playerFanBase.monthly_fan_change >= 0 ? '+' : ''}{Number(playerFanBase.monthly_fan_change).toLocaleString('pt-BR')} fãs</span></div>
          )}
          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-3 flex flex-col items-center gap-1"><Users className="h-4 w-4 text-primary" /><span className="text-lg font-black tabular-nums">{totalFans.toLocaleString('pt-BR')}</span><span className="text-[9px] uppercase text-muted-foreground">Total Fãs</span></div>
        <div className="glass rounded-2xl p-3 flex flex-col items-center gap-1"><Activity className="h-4 w-4 text-green-400" /><span className="text-lg font-black tabular-nums">{avgMorale}</span><span className="text-[9px] uppercase text-muted-foreground">Moral Média</span></div>
        <div className="glass rounded-2xl p-3 flex flex-col items-center gap-1"><Star className="h-4 w-4 text-amber-400" /><span className="text-lg font-black tabular-nums">{viralClubs}</span><span className="text-[9px] uppercase text-muted-foreground">Em Alta</span></div>
      </div>

      <div className="space-y-2">
        <FilterPills filters={FILTERS} activeFilter={typeFilter} onFilterChange={setTypeFilter} />
        <FilterPills filters={BEHAVIOR_FILTERS} activeFilter={behaviorFilter} onFilterChange={setBehaviorFilter} />
        <div className="flex gap-2">{[{ id: 'fans', label: 'Mais Fãs' }, { id: 'popularity', label: 'Popularidade' }, { id: 'morale', label: 'Moral' }].map((s) => <button key={s.id} onClick={() => setSort(s.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${sort === s.id ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground'}`}>{s.label}</button>)}</div>
      </div>

      {filtered.length === 0 ? <EmptyStateCard icon={Megaphone} message="Nenhuma torcida encontrada com esses filtros." /> : <div className="grid md:grid-cols-2 gap-3 animate-stagger">{filtered.slice(0, 40).map((fb) => <FanBaseCard key={fb.id} fanBase={fb} onClick={() => setSelected(fb)} />)}</div>}
      {selected && <FanBaseDetail fanBase={selected} onClose={() => setSelected(null)} onUpdate={(updated) => { setSelected(updated); setFanBases((prev) => prev.map((f) => f.id === updated.id ? updated : f)); }} />}
    </div>
  );
}
