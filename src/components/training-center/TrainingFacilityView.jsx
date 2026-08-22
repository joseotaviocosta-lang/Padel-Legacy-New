import React, { useEffect, useMemo, useState } from 'react';
import { Brain, Coins, Heart, Shield, Sparkles, TrendingUp, Users, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import FacilityCard from '@/components/training/FacilityCard.jsx';
import { EmptyState, Surface, Tabs } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import {
  DEFAULT_FACILITIES,
  FACILITY_CATEGORIES,
  FACILITY_LIST,
  getCenterEffects,
  getCenterLevel,
  getCenterReputation,
} from '@/lib/trainingCenter.js';
import { formatCoinBalance, formatGameNumber } from '@/lib/numberFormat.js';

const EFFECT_ICONS = {
  dailyTrainingBonus: { icon: Zap, label: 'Treinos extras/dia', color: 'text-primary' },
  energyRecoveryBonus: { icon: Heart, label: 'Energia extra/dia', color: 'text-green-400' },
  maxEnergyBonus: { icon: Heart, label: 'Energia máx', color: 'text-green-400' },
  injuryRiskReduction: { icon: Shield, label: 'Redução de lesão', color: 'text-cyan-400' },
  trainingGainPct: { icon: TrendingUp, label: 'Bônus ganho treino', color: 'text-primary' },
  physicalGainPct: { icon: Zap, label: 'Bônus físico', color: 'text-orange-400' },
  techniqueGainPct: { icon: Sparkles, label: 'Bônus técnica', color: 'text-cyan-400' },
  mentalGainPct: { icon: Brain, label: 'Bônus mental', color: 'text-purple-400' },
  overallGainPct: { icon: TrendingUp, label: 'Bônus global', color: 'text-amber-400' },
  coinsPerMatch: { icon: Coins, label: 'Moedas/jogo', color: 'text-yellow-400' },
  moraleBonus: { icon: Brain, label: 'Bônus moral', color: 'text-pink-400' },
};

export default function TrainingFacilityView({ profile, onProfileUpdate }) {
  const entities = /** @type {any} */ (localGame.entities);
  const [center, setCenter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const centers = await entities.TrainingCenter.filter({ profile_id: profile.id }, null, 1);
        const current = centers?.[0] || await entities.TrainingCenter.create({
          profile_id: profile.id,
          name: 'Centro de Treinamento',
          level: 1,
          facilities: { ...DEFAULT_FACILITIES },
          total_invested: 0,
          reputation_bonus: 0,
        });
        if (!cancelled) setCenter(current);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entities.TrainingCenter, profile.id]);

  const categories = useMemo(() => [
    { key: 'all', label: 'Todos' },
    ...Object.entries(FACILITY_CATEGORIES).map(([key, category]) => ({ key, label: category.label })),
  ], []);

  async function handleUpgrade(facilityId) {
    const facility = FACILITY_LIST.find((item) => item.id === facilityId);
    const currentLevel = center?.facilities?.[facilityId] || 0;
    const nextLevel = facility?.levels?.[currentLevel + 1];
    if (!center || !facility || !nextLevel) return;
    if ((profile.coins || 0) < nextLevel.cost) {
      toast({ title: 'Moedas insuficientes', description: `Precisa de ${formatCoinBalance(nextLevel.cost)} moedas.`, variant: 'destructive' });
      return;
    }
    setBusy(facilityId);
    try {
      const facilities = { ...center.facilities, [facilityId]: currentLevel + 1 };
      const updatedCenter = await entities.TrainingCenter.update(center.id, {
        facilities,
        total_invested: (center.total_invested || 0) + nextLevel.cost,
        level: getCenterLevel({ facilities }),
        reputation_bonus: getCenterReputation({ facilities }),
      });
      const updatedProfile = await entities.PlayerProfile.update(profile.id, { coins: (profile.coins || 0) - nextLevel.cost });
      setCenter(updatedCenter);
      onProfileUpdate(updatedProfile, 'training-center:facility-upgrade');
      toast({ title: 'Evoluído!', description: `${facility.name} agora está no nível ${currentLevel + 1}.` });
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao evoluir.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="rounded-2xl border border-border/60 p-5 text-sm text-muted-foreground">Carregando instalações...</div>;
  if (!center) return <EmptyState compact icon={Sparkles} eyebrow={null} title="Centro indisponível" description="Não foi possível carregar as instalações desta carreira." action={null} secondaryAction={null} className="" />;

  const effects = getCenterEffects(center);
  const activeEffects = Object.entries(EFFECT_ICONS).filter(([key]) => effects[key] > 0);
  const filtered = activeCategory === 'all' ? FACILITY_LIST : FACILITY_LIST.filter((facility) => facility.category === activeCategory);
  const totalFacilities = Object.values(center.facilities || {}).reduce((sum, level) => sum + (level || 0), 0);

  return (
    <div className="space-y-3" data-training-center-view="center">
      <Surface padding="compact">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CenterStat label="Nível" value={getCenterLevel(center)} />
          <CenterStat label="Reputação" value={`+${formatGameNumber(getCenterReputation(center), { maximumFractionDigits: 1 })}`} />
          <CenterStat label="Instalações" value={`${totalFacilities}/${FACILITY_LIST.length * 5}`} />
          <CenterStat label="Investido" value={formatCoinBalance(center.total_invested || 0)} />
        </div>
      </Surface>

      {activeEffects.length > 0 && (
        <Surface padding="compact" className="border-primary/20 bg-primary/5">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary"><Sparkles className="h-3 w-3" />Benefícios ativos</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {activeEffects.map(([key, config]) => {
              const Icon = config.icon;
              return <div key={key} className="flex min-w-0 items-center gap-2 rounded-xl bg-secondary/30 p-2"><Icon className={`h-3.5 w-3.5 shrink-0 ${config.color}`} /><div className="min-w-0"><p className={`text-sm font-black ${config.color}`}>+{formatGameNumber(effects[key], { maximumFractionDigits: 1 })}{key.includes('Pct') || key.includes('Reduction') ? '%' : ''}</p><p className="truncate text-[8px] uppercase text-muted-foreground">{config.label}</p></div></div>;
            })}
          </div>
        </Surface>
      )}

      <Surface padding="compact">
        <p className="mb-2 text-xs font-bold">Suporte ligado à preparação</p>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[10px] text-muted-foreground">Personal, fisioterapia e treinador são geridos na Comissão Técnica.</p>
          <Link to="/staff" className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary/15 px-3 text-xs font-bold text-primary"><Users className="h-4 w-4" />Ver comissão</Link>
        </div>
      </Surface>

      <Tabs tabs={categories} activeTab={activeCategory} onTabChange={setActiveCategory} variant="buttons" className="" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-stagger">
        {filtered.map((facility) => <FacilityCard key={facility.id} facilityId={facility.id} center={center} profile={profile} onUpgrade={handleUpgrade} busy={busy} />)}
      </div>
    </div>
  );
}

function CenterStat({ label, value }) {
  return <div className="rounded-xl bg-secondary/35 p-2 text-center"><p className="text-[9px] font-bold uppercase text-muted-foreground">{label}</p><p className="truncate text-lg font-black tabular-nums">{value}</p></div>;
}
