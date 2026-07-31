import React, { useState, useEffect } from 'react';
import { Building2, Zap, Heart, Shield, TrendingUp, Brain, Coins, Sparkles } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { PageHeader, LoadingScreen } from '@/components/padel/ui';
import FacilityCard from '@/components/training/FacilityCard';
import { FACILITY_LIST, FACILITY_CATEGORIES, getCenterEffects, getCenterLevel, getCenterReputation, DEFAULT_FACILITIES } from '@/lib/trainingCenter';
import { useToast } from '@/components/ui/use-toast';

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

export default function TrainingCenterPage() {
  const [profile, setProfile] = useState(null);
  const [center, setCenter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const profiles = await localGame.entities.PlayerProfile.list('-created_date', 1);
      if (profiles && profiles[0]) {
        setProfile(profiles[0]);
        const centers = await localGame.entities.TrainingCenter.filter({ profile_id: profiles[0].id }, null, 1);
        if (centers && centers.length > 0) {
          setCenter(centers[0]);
        } else {
          const created = await localGame.entities.TrainingCenter.create({
            profile_id: profiles[0].id,
            name: 'Centro de Treinamento',
            level: 1,
            facilities: { ...DEFAULT_FACILITIES },
            total_invested: 0,
            reputation_bonus: 0,
          });
          setCenter(created);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handleUpgrade(facilityId) {
    if (!center || !profile) return;
    const facility = FACILITY_LIST.find(f => f.id === facilityId);
    const currentLevel = center.facilities?.[facilityId] || 0;
    const nextLevel = facility.levels[currentLevel + 1];
    if (!nextLevel) return;

    if ((profile.coins || 0) < nextLevel.cost) {
      toast({ title: 'Moedas insuficientes', description: `Precisa de ${nextLevel.cost} moedas.`, variant: 'destructive' });
      return;
    }

    setBusy(facilityId);
    try {
      const newFacilities = { ...center.facilities, [facilityId]: currentLevel + 1 };
      const newInvested = (center.total_invested || 0) + nextLevel.cost;
      const updated = await localGame.entities.TrainingCenter.update(center.id, {
        facilities: newFacilities,
        total_invested: newInvested,
        level: getCenterLevel({ facilities: newFacilities }),
        reputation_bonus: getCenterReputation({ facilities: newFacilities }),
      });
      setCenter(updated);

      // Deduct coins from profile
      const updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
        coins: (profile.coins || 0) - nextLevel.cost,
      });
      setProfile(updatedProfile);

      toast({ title: 'Evoluído!', description: `${facility.name} agora está no nível ${currentLevel + 1}.` });
    } catch (e) {
      toast({ title: 'Erro', description: 'Falha ao evoluir.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingScreen />;

  const effects = getCenterEffects(center);
  const centerLevel = getCenterLevel(center);
  const centerRep = getCenterReputation(center);
  const activeEffects = Object.entries(EFFECT_ICONS).filter(([key]) => effects[key] > 0);
  const totalFacilities = Object.values(center?.facilities || {}).reduce((a, b) => a + (b || 0), 0);

  const categories = [
    { id: 'all', label: 'Todos' },
    ...Object.entries(FACILITY_CATEGORIES).map(([id, c]) => ({ id, label: c.label })),
  ];

  const filtered = activeCategory === 'all'
    ? FACILITY_LIST
    : FACILITY_LIST.filter(f => f.category === activeCategory);

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <PageHeader icon={Building2} title="Centro de Treinamento" subtitle="Construa e evolua instalações para maximizar seu desempenho" accent="primary" />

      {/* Center Summary */}
      <div className="glass rounded-2xl p-4 grid-bg relative overflow-hidden">
        <div className="absolute -top-8 -right-8 h-32 w-32 bg-primary/15 rounded-full blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Nível do Centro</p>
            <p className="text-3xl font-black text-primary">{centerLevel}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Reputação</p>
            <p className="text-2xl font-black text-amber-400">+{centerRep}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Instalações</p>
            <p className="text-2xl font-black">{totalFacilities}/{FACILITY_LIST.length * 5}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Investido</p>
            <p className="text-lg font-black text-yellow-400">{(center?.total_invested || 0).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>

      {/* Active Effects */}
      {activeEffects.length > 0 && (
        <div className="glass rounded-2xl p-4 border border-primary/20 bg-primary/5">
          <p className="text-[10px] uppercase tracking-wide text-primary font-bold mb-3 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Benefícios Ativos
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {activeEffects.map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div key={key} className="flex items-center gap-2 glass rounded-xl p-2 bg-secondary/30">
                  <Icon className={`h-3.5 w-3.5 ${config.color} shrink-0`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-black ${config.color}`}>+{effects[key]}{key.includes('Pct') || key.includes('Reduction') ? '%' : ''}</p>
                    <p className="text-[8px] text-muted-foreground uppercase tracking-wide truncate">{config.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeCategory === c.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Facilities Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-stagger">
        {filtered.map(f => (
          <FacilityCard
            key={f.id}
            facilityId={f.id}
            center={center}
            profile={profile}
            onUpgrade={handleUpgrade}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}