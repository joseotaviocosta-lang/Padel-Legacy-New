import React, { useMemo, useState, useEffect } from 'react';
import { Search, Users, UserCheck } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { PageHeader, FilterPills, EmptyStateCard, LoadingScreen } from '@/components/padel/ui';
import CoachCard from '@/components/coaches/CoachCard';
import CoachDetail from '@/components/coaches/CoachDetail';
import { COACHES_DATA, COACH_TIERS, calculateAffinity, canHireCoach } from '@/lib/coaches';
import { useToast } from '@/components/ui/use-toast';

const TIER_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'iniciante', label: 'Iniciante' },
  { id: 'regional', label: 'Regional' },
  { id: 'profissional', label: 'Profissional' },
  { id: 'elite', label: 'Elite' },
  { id: 'lendario', label: 'Lendário' },
];

export default function Coaches() {
  const [profile, setProfile] = useState(null);
  const [hiredCoach, setHiredCoach] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const profiles = await localGame.entities.PlayerProfile.list('-created_date', 1);
      if (profiles && profiles[0]) setProfile(profiles[0]);

      // Load coaches from DB (or seed if empty)
      let dbCoaches = await localGame.entities.Coach.list('-reputation', 50);
      if (!dbCoaches || dbCoaches.length === 0) {
        await localGame.entities.Coach.bulkCreate(COACHES_DATA.map(c => ({ ...c })));
        dbCoaches = await localGame.entities.Coach.list('-reputation', 50);
      }
      setCoaches(dbCoaches || []);

      // Find hired coach
      const profile = profiles?.[0];
      if (profile?.coach_id) {
        const hired = (dbCoaches || []).find(c => c.id === profile.coach_id);
        if (hired) setHiredCoach(hired);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return coaches.filter(c => {
      if (activeFilter !== 'all' && c.tier !== activeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (c.name || '').toLowerCase().includes(s) || (c.city || '').toLowerCase().includes(s) || (c.specialty || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [coaches, activeFilter, search]);

  async function handleHire(coach) {
    if (!profile) return;
    const check = canHireCoach(coach, profile);
    if (!check.allowed) {
      toast({ title: 'Não disponível', description: check.reason, variant: 'destructive' });
      return;
    }
    const totalCost = (coach.monthly_cost || 0) + (coach.sign_on_bonus || 0);
    const updated = await localGame.entities.PlayerProfile.update(profile.id, {
      coins: (profile.coins || 0) - totalCost,
      coach_id: coach.id,
      coach_name: coach.name,
      coach_hired_date: profile.career_date,
      coach_monthly_salary: coach.monthly_cost || 0,
      coach_signing_cost: coach.sign_on_bonus || 0,
      coach_contract_status: 'active',
    });
    setProfile(updated);
    setHiredCoach(coach);
    setSelected(null);
    toast({ title: 'Contratado!', description: `${coach.name} é seu novo treinador.` });
  }

  async function handleFire() {
    if (!profile || !hiredCoach) return;
    const updated = await localGame.entities.PlayerProfile.update(profile.id, {
      coach_id: null,
      coach_name: null,
      coach_monthly_salary: 0,
      coach_contract_status: 'terminated',
    });
    setProfile(updated);
    setHiredCoach(null);
    setSelected(null);
    toast({ title: 'Demitido', description: `${hiredCoach.name} não é mais seu treinador.` });
  }

  if (loading) return <LoadingScreen />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <PageHeader icon={Users} title="Treinadores" subtitle="Contrate o mentor perfeito para sua carreira" accent="primary" />

      {/* Current Coach */}
      {hiredCoach && (
        <div className="glass rounded-2xl p-4 border border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-primary" />
            <span className="text-[10px] uppercase tracking-wide text-primary font-bold">Treinador Atual</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <span className="font-black text-primary">{(hiredCoach.name || '?')[0]}</span>
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">{hiredCoach.name}</p>
              <p className="text-[10px] text-muted-foreground">{hiredCoach.specialty} · {COACH_TIERS[hiredCoach.tier]?.label}</p>
            </div>
            <button onClick={() => setSelected(hiredCoach)} className="text-[11px] font-bold text-primary hover:opacity-80 px-3 py-1.5 rounded-lg bg-primary/10">
              Ver Detalhes
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="glass rounded-2xl p-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, cidade ou especialidade..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <FilterPills filters={TIER_FILTERS} activeFilter={activeFilter} onFilterChange={setActiveFilter} />

      {filtered.length === 0 ? (
        <EmptyStateCard icon={Users} title="Nenhum treinador" message="Nenhum treinador encontrado com esses filtros." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 animate-stagger">
          {filtered.map(coach => {
            const affinity = profile ? calculateAffinity(coach, profile) : null;
            return (
              <CoachCard
                key={coach.id}
                coach={coach}
                affinity={affinity}
                isHired={hiredCoach?.id === coach.id}
                onClick={() => setSelected(coach)}
              />
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <CoachDetail
          coach={selected}
          profile={profile}
          isHired={hiredCoach?.id === selected.id}
          onClose={() => setSelected(null)}
          onHire={hiredCoach?.id === selected.id ? handleFire : () => handleHire(selected)}
          onFire={handleFire}
        />
      )}
    </div>
  );
}
