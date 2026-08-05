import React, { useMemo, useState, useEffect } from 'react';
import { Search, Users, UserCheck, Info } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { PageHeader, FilterPills, EmptyStateCard, LoadingScreen } from '@/components/padel/ui';
import CoachCard from '@/components/coaches/CoachCard';
import CoachDetail from '@/components/coaches/CoachDetail';
import { COACHES_DATA, COACH_TIERS, COACH_SPECIALTY_INFO, calculateAffinity, canHireCoach } from '@/lib/coaches';
import { useToast } from '@/components/ui/use-toast';
import { getStaffSlots } from '@/lib/staffCatalog';
import { syncStaffEffects } from '@/game-core/staffLifecycle';

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

      // Sincroniza o catálogo completo. Saves antigos costumavam ter apenas 2 treinadores.
      let dbCoaches = await localGame.entities.Coach.list('-reputation', 100);
      const normalizeName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
      const existingNames = new Set((dbCoaches || []).map(coach => normalizeName(coach.name)));
      const missingCoaches = COACHES_DATA.filter(coach => !existingNames.has(normalizeName(coach.name)));
      if (missingCoaches.length > 0) {
        await localGame.entities.Coach.bulkCreate(missingCoaches.map(coach => ({ ...coach })));
        dbCoaches = await localGame.entities.Coach.list('-reputation', 100);
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
        return (c.name || '').toLowerCase().includes(s) || (c.city || '').toLowerCase().includes(s) || (c.specialty || '').toLowerCase().includes(s) || (COACH_SPECIALTY_INFO[c.specialty]?.label || '').toLowerCase().includes(s) || (c.specializations || []).some(item => String(item).toLowerCase().includes(s));
      }
      return true;
    });
  }, [coaches, activeFilter, search]);

  async function handleHire(coach) {
    if (!profile) return;
    const supportStaff = await localGame.entities.PlayerStaffHire.filter({ profile_id: profile.id });
    const slots = getStaffSlots(profile.career_level || 1);
    const occupied = (supportStaff || []).length + (profile.coach_id && profile.coach_contract_status !== 'terminated' ? 1 : 0);
    if (!profile.coach_id && occupied >= slots) {
      toast({ title: 'Comissão completa', description: `Todas as ${slots} vagas estão ocupadas. Libere uma vaga em Economia → Comissão.`, variant: 'destructive' });
      return;
    }
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
    const synced = await syncStaffEffects(updated);
    setProfile(synced);
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
    const synced = await syncStaffEffects(updated);
    setProfile(synced);
    setHiredCoach(null);
    setSelected(null);
    toast({ title: 'Demitido', description: `${hiredCoach.name} não é mais seu treinador.` });
  }

  const availableCount = filtered.length;

  if (loading) return <LoadingScreen />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <PageHeader icon={Users} title="Treinadores" subtitle="Escolha uma filosofia que complemente seu estilo e acelere sua evolução" accent="primary" />

      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <div className="glass rounded-2xl border border-primary/20 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-black">O treinador define como você evolui</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Ele não aumenta o Overall instantaneamente. Seus bônus melhoram a eficiência dos treinos, a preparação física, a confiança ou a leitura tática conforme a especialidade e a afinidade com seu atleta.</p>
            </div>
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mercado disponível</p>
          <p className="mt-1 text-2xl font-black">{coaches.length} treinadores</p>
          <p className="text-xs text-muted-foreground">{availableCount} exibidos com o filtro atual</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(COACH_SPECIALTY_INFO).map(([key, info]) => (
          <button key={key} type="button" onClick={() => setSearch(key)} className="rounded-xl border border-border/60 bg-card/60 p-3 text-left transition hover:border-primary/35 hover:bg-primary/5">
            <p className="text-xs font-black">{info.label}</p>
            <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{info.summary}</p>
          </button>
        ))}
      </div>

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
          placeholder="Buscar por nome, cidade, especialidade ou estilo..."
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
                profile={profile}
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
