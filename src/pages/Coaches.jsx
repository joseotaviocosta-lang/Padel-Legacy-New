import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Users, UserCheck, Info, Brain, Handshake, CalendarDays } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { FilterPills } from '@/components/padel/ui';
import { EmptyState, PageSkeleton } from '@/components/design-system';
import { Page, PageContent, PageHeader, Surface, StatCard, StatusBadge, ProgressBar } from '@/components/design-system';
import CoachCard from '@/components/coaches/CoachCard';
import CoachDetail from '@/components/coaches/CoachDetail';
import { COACH_TIERS, COACH_SPECIALTY_INFO, calculateAffinity } from '@/lib/coaches';
import { useToast } from '@/components/ui/use-toast';
import { ensureStarterCoach, hirePrimaryCoach, replaceWithStarterCoach, renewPrimaryCoach } from '@/game-core/coachLifecycle';

const TIER_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'iniciante', label: 'Iniciante' },
  { id: 'regional', label: 'Regional' },
  { id: 'profissional', label: 'Profissional' },
  { id: 'elite', label: 'Elite' },
  { id: 'lendario', label: 'Lendário' },
];

export default function Coaches() {
  const [searchParams] = useSearchParams();
  const openedCoachRef = useRef(null);
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

  useEffect(() => {
    const requestedId = searchParams.get('coach');
    if (!requestedId || loading || openedCoachRef.current === requestedId) return;
    openedCoachRef.current = requestedId;
    const requested = coaches.find((coach) => String(coach.id) === requestedId);
    if (requested) setSelected(requested);
  }, [coaches, loading, searchParams]);

  async function load() {
    setLoading(true);
    try {
      const profiles = await localGame.entities.PlayerProfile.list('-created_date', 1);
      const rawProfile = profiles?.[0] || null;
      const starterResult = rawProfile ? await ensureStarterCoach(rawProfile) : { profile: rawProfile, coach: null };
      const activeProfile = starterResult.profile || rawProfile;
      setProfile(activeProfile);
      const dbCoaches = await localGame.entities.Coach.list('-reputation', 500);
      setCoaches(dbCoaches || []);
      const hired = starterResult.coach || (dbCoaches || []).find(c => c.id === activeProfile?.coach_id) || null;
      setHiredCoach(hired);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return coaches.filter(c => {
      if (activeFilter !== 'all' && String(c.tier || '').toLowerCase() !== activeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (c.name || '').toLowerCase().includes(s) || (c.city || '').toLowerCase().includes(s) || (c.specialty || '').toLowerCase().includes(s) || (COACH_SPECIALTY_INFO[c.specialty]?.label || '').toLowerCase().includes(s) || (c.specializations || []).some(item => String(item).toLowerCase().includes(s));
      }
      return true;
    });
  }, [coaches, activeFilter, search]);

  async function handleHire(coach) {
    if (!profile) return;
    try {
      const updated = await hirePrimaryCoach(profile, coach, 12);
      setProfile(updated);
      setHiredCoach(coach);
      setSelected(null);
      toast({ title: 'Treinador contratado', description: `${coach.name} assume a dupla por 12 meses, com salário mensal de ${updated.coach_monthly_salary} moedas.` });
    } catch (error) {
      toast({ title: 'Não foi possível contratar', description: error?.message || 'Verifique os requisitos e o saldo.', variant: 'destructive' });
    }
  }

  async function handleFire() {
    if (!profile || !hiredCoach) return;
    try {
      const result = await replaceWithStarterCoach(profile);
      setProfile(result.profile);
      setHiredCoach(result.coach);
      setSelected(null);
      toast({ title: 'Treinador substituído', description: `${hiredCoach.name} deixou a equipe. ${result.coach?.name || 'O treinador de formação do clube'} assume temporariamente.` });
    } catch (error) {
      toast({ title: 'Falha ao substituir', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    }
  }

  async function handleRenew() {
    if (!profile || !hiredCoach) return;
    try {
      const updated = await renewPrimaryCoach(profile, hiredCoach, 12);
      setProfile(updated);
      toast({ title: 'Contrato renovado', description: `${hiredCoach.name} permanece por mais 12 meses.` });
    } catch (error) {
      toast({ title: 'Falha na renovação', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    }
  }

  const availableCount = filtered.length;

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  const affinityCurrent = hiredCoach && profile ? calculateAffinity(hiredCoach, profile) : null;
  const trust = Number(profile?.coach_trust ?? 55);
  const tactical = Number(profile?.coach_tactical_understanding ?? 20);

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
      <PageHeader
        eyebrow="Equipe técnica"
        icon={Users}
        title="Treinador principal"
        description="O comandante esportivo da dupla: define filosofia, conduz treinos e orienta decisões durante as partidas."
        tone="brand"
        stats={hiredCoach ? <>
          <StatusBadge tone="success">Obrigatório</StatusBadge>
          <StatusBadge tone="info">{COACH_TIERS[hiredCoach.tier]?.label || hiredCoach.tier}</StatusBadge>
          <StatusBadge tone="premium">{profile?.coach_paid_by_club ? 'Pago pelo clube' : `${profile?.coach_monthly_salary || hiredCoach.monthly_cost || 0}/mês`}</StatusBadge>
        </> : null}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Confiança" value={`${trust}%`} detail="relação profissional" icon={Handshake} tone={trust >= 70 ? 'success' : 'warning'} />
        <StatCard label="Entendimento" value={`${tactical}%`} detail="leitura da dupla" icon={Brain} tone="info" />
        <StatCard label="Afinidade" value={`${affinityCurrent?.score ?? affinityCurrent ?? 0}%`} detail="compatibilidade atual" icon={UserCheck} tone="brand" />
        <StatCard label="Contrato" value={profile?.coach_paid_by_club ? 'Clube' : `${profile?.coach_monthly_salary || hiredCoach?.monthly_cost || 0}`} detail={profile?.coach_contract_end_date || 'temporário'} icon={CalendarDays} tone="premium" />
      </div>

      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <Surface tone="brand" className="p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-black">A dupla sempre possui um treinador</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">O treinador principal lidera a comissão técnica, recebe salário mensal e influencia treinos, confiança, entrosamento e decisões táticas durante as partidas. O treinador de formação fornecido pelo clube não tem custo para o atleta.</p>
            </div>
          </div>
        </Surface>
        <Surface className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mercado disponível</p>
          <p className="mt-1 text-2xl font-black">{coaches.length} treinadores</p>
          <p className="text-xs text-muted-foreground">{availableCount} exibidos com o filtro atual</p>
        </Surface>
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
        <Surface tone="brand" className="p-4">
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
              <p className="text-[10px] text-muted-foreground">{COACH_SPECIALTY_INFO[hiredCoach.specialty]?.label || hiredCoach.specialty} · {COACH_TIERS[hiredCoach.tier]?.label} · {profile?.coach_paid_by_club ? 'pago pelo clube' : `${profile?.coach_monthly_salary || hiredCoach.monthly_cost} moedas/mês`}</p><p className="text-[9px] text-muted-foreground">Confiança {profile?.coach_trust ?? 55}/100 · contrato até {profile?.coach_contract_end_date || 'fim da temporada'}</p>
            </div>
            <div className="flex gap-2"><button onClick={handleRenew} className="text-[11px] font-bold text-foreground px-3 py-1.5 rounded-lg bg-secondary/60">Renovar</button><button onClick={() => setSelected(hiredCoach)} className="text-[11px] font-bold text-primary hover:opacity-80 px-3 py-1.5 rounded-lg bg-primary/10">Ver detalhes</button></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Confiança</p><ProgressBar value={trust} tone={trust >= 70 ? 'success' : 'warning'} /></div>
            <div><p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Entendimento tático</p><ProgressBar value={tactical} tone="info" /></div>
          </div>
        </Surface>
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
        <EmptyState icon={Users} eyebrow="Mercado de treinadores" title="Nenhum treinador encontrado" description="Ajuste os filtros ou avance o calendário para atualizar a disponibilidade mensal do mercado." compact />
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
      </PageContent>
    </Page>
  );
}
