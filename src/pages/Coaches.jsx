import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, Brain, Handshake, Search, SlidersHorizontal, UserCheck, Users, Wallet } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { EmptyState, Page, PageContent, PageHeader, PageSkeleton, ProgressBar, StatCard, StatusBadge, Surface } from '@/components/design-system';
import CoachCard from '@/components/coaches/CoachCard';
import CoachDetail from '@/components/coaches/CoachDetail';
import {
  buildCoachDiscovery,
  calculateAffinity,
  COACH_SPECIALTY_INFO,
  COACH_TIERS,
  evaluateCoachForCareer,
  filterCoachDiscovery,
  getDefaultCoachDiscoveryFilter,
  sortCoachDiscovery,
} from '@/lib/coaches';
import { useToast } from '@/components/ui/use-toast';
import { ensureStarterCoach, hirePrimaryCoach, renewPrimaryCoach, replaceWithStarterCoach } from '@/game-core/coachLifecycle';

const STATUS_FILTERS = [
  ['all', 'Todos'],
  ['available', 'Disponíveis'],
  ['recommended', 'Recomendados'],
  ['budget', 'Dentro do orçamento'],
  ['blocked', 'Bloqueados'],
];

function currency(value) {
  return `${Math.max(0, Number(value) || 0).toLocaleString('pt-BR')} moedas`;
}

export default function Coaches() {
  const [searchParams] = useSearchParams();
  const openedCoachRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [hiredCoach, setHiredCoach] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('available');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('recommendation');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  // Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 4): o filtro
  // padrão para uma carreira nova é "available" (getDefaultCoachDiscoveryFilter),
  // que pode listar dezenas de treinadores de uma vez sem paginação nenhuma —
  // isto só limita quantos cards renderizam por vez, sem tocar em
  // buildCoachDiscovery/filterCoachDiscovery/sortCoachDiscovery nem inventar
  // nenhum critério de recomendação novo.
  const [visibleCount, setVisibleCount] = useState(12);
  const { toast } = useToast();

  useEffect(() => { setVisibleCount(12); }, [statusFilter, specialtyFilter, sortOrder, search]);

  useEffect(() => { load(); }, []);

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
      const [dbCoaches, transactions] = activeProfile ? await Promise.all([
        localGame.entities.Coach.list('-reputation', 500),
        localGame.entities.FinancialTransaction.filter({ profile_id: activeProfile.id }),
      ]) : [[], []];
      const latestClose = (transactions || [])
        .filter((entry) => entry.type === 'monthly_close')
        .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))[0];
      const hired = starterResult.coach || (dbCoaches || []).find((coach) => coach.id === activeProfile?.coach_id) || null;
      setProfile(activeProfile);
      setCoaches(dbCoaches || []);
      setHiredCoach(hired);
      setMonthlyIncome(Number(latestClose?.income) > 0 ? Number(latestClose.income) : null);
      setStatusFilter(getDefaultCoachDiscoveryFilter(activeProfile));
    } catch (error) {
      console.error(error);
      toast({ title: 'Não foi possível abrir o mercado', description: 'Tente novamente em instantes.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const discovery = useMemo(() => buildCoachDiscovery(
    coaches.filter((coach) => coach.id !== hiredCoach?.id),
    profile,
    { monthlyIncome },
  ), [coaches, hiredCoach?.id, monthlyIncome, profile]);

  const visible = useMemo(() => sortCoachDiscovery(filterCoachDiscovery(discovery, {
    status: statusFilter,
    specialty: specialtyFilter,
    search,
  }), sortOrder), [discovery, search, sortOrder, specialtyFilter, statusFilter]);

  const sections = useMemo(() => {
    if (statusFilter !== 'all') return [{
      id: statusFilter,
      title: statusFilter === 'blocked' ? 'Ainda não disponíveis' : statusFilter === 'recommended' ? 'Recomendados para sua carreira' : 'Disponíveis para você',
      description: statusFilter === 'blocked' ? 'Veja exatamente o que falta para liberar cada profissional.' : 'Opções que atendem às regras atuais da sua carreira.',
      items: visible,
    }];
    return [
      { id: 'available', title: 'Disponíveis para você', description: 'Profissionais que podem ser contratados agora.', items: visible.filter((item) => item.availability.available) },
      { id: 'blocked', title: 'Ainda não disponíveis', description: 'Continuam visíveis para orientar sua progressão.', items: visible.filter((item) => !item.availability.available) },
    ];
  }, [statusFilter, visible]);

  const selectedEvaluation = useMemo(() => {
    if (!selected || !profile) return null;
    return discovery.find((item) => item.coach.id === selected.id) || evaluateCoachForCareer(selected, profile, { monthlyIncome });
  }, [discovery, monthlyIncome, profile, selected]);

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

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  const availableCount = discovery.filter((item) => item.availability.available).length;
  const beginnerAvailableCount = discovery.filter((item) => item.availability.available && item.coach.tier === 'iniciante').length;
  const affinityCurrent = hiredCoach && profile ? calculateAffinity(hiredCoach, profile) : 0;
  const trust = Number(profile?.coach_trust ?? 55);
  const tactical = Number(profile?.coach_tactical_understanding ?? 20);

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
        <PageHeader
          eyebrow="Equipe técnica"
          icon={Users}
          title="Técnicos principais"
          description="Compare profissionais, entenda os requisitos e descubra quem pode assumir sua dupla agora."
          tone="brand"
          stats={<>
            <StatusBadge tone="success">{availableCount} disponíveis</StatusBadge>
            <StatusBadge tone="info">{beginnerAvailableCount} de formação</StatusBadge>
          </>}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Caixa atual" value={currency(profile?.coins)} detail="saldo para assinatura" icon={Wallet} tone="brand" />
          <StatCard label="Receita mensal" value={monthlyIncome ? currency(monthlyIncome) : '—'} detail={monthlyIncome ? 'último fechamento' : 'ainda sem fechamento'} icon={Banknote} tone="success" />
          <StatCard label="Confiança" value={`${trust}%`} detail="relação com o técnico" icon={Handshake} tone={trust >= 70 ? 'success' : 'warning'} />
          <StatCard label="Afinidade atual" value={`${affinityCurrent}%`} detail="compatibilidade esportiva" icon={Brain} tone="info" />
        </div>

        {hiredCoach && (
          <Surface tone="brand" className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-black text-primary">{(hiredCoach.name || '?')[0]}</div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-primary"><UserCheck className="h-3.5 w-3.5" /> Técnico atual</p>
                <p className="mt-0.5 truncate text-base font-black">{hiredCoach.name}</p>
                <p className="text-[10px] text-muted-foreground">{COACH_SPECIALTY_INFO[hiredCoach.specialty]?.label || hiredCoach.specialty} · {COACH_TIERS[hiredCoach.tier]?.label || hiredCoach.tier} · {profile?.coach_paid_by_club ? 'pago pelo clube' : `${currency(profile?.coach_monthly_salary || hiredCoach.monthly_cost)}/mês`}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleRenew} className="rounded-xl bg-secondary/60 px-3 py-2 text-[11px] font-bold hover:bg-secondary">Renovar</button>
                <button type="button" onClick={() => setSelected(hiredCoach)} className="rounded-xl bg-primary/10 px-3 py-2 text-[11px] font-black text-primary hover:bg-primary/15">Ver detalhes</button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><p className="mb-1 text-[9px] font-bold uppercase text-muted-foreground">Confiança</p><ProgressBar value={trust} tone={trust >= 70 ? 'success' : 'warning'} /></div>
              <div><p className="mb-1 text-[9px] font-bold uppercase text-muted-foreground">Entendimento tático</p><ProgressBar value={tactical} tone="info" /></div>
            </div>
          </Surface>
        )}

        <Surface className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <div><p className="text-sm font-black">Encontre seu próximo técnico</p><p className="text-[10px] text-muted-foreground">O mercado é calculado apenas quando os dados carregam ou os filtros mudam.</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setStatusFilter(id)} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${statusFilter === id ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground'}`}>{label}</button>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_190px_190px]">
            <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/35 px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, cidade ou especialidade..." className="min-h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </label>
            <select value={specialtyFilter} onChange={(event) => setSpecialtyFilter(event.target.value)} aria-label="Filtrar especialidade" className="min-h-10 rounded-xl border border-border/60 bg-background/70 px-3 text-xs font-bold outline-none">
              <option value="all">Todas as especialidades</option>
              {Object.entries(COACH_SPECIALTY_INFO).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
            </select>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Ordenar técnicos" className="min-h-10 rounded-xl border border-border/60 bg-background/70 px-3 text-xs font-bold outline-none">
              <option value="recommendation">Mais relevantes</option>
              <option value="quality">Maior OVR</option>
              <option value="salary">Menor salário</option>
              <option value="value">Custo-benefício</option>
              <option value="name">Nome</option>
            </select>
          </div>
        </Surface>

        {visible.length === 0 ? (
          <EmptyState icon={Users} eyebrow="Mercado de técnicos" title="Nenhum profissional neste recorte" description="Ajuste os filtros para ver outras opções. Técnicos bloqueados continuam acessíveis no filtro correspondente." compact />
        ) : sections.map((section) => section.items.length > 0 && (
          <section key={section.id} className="space-y-3">
            <div>
              <h2 className="text-lg font-black">{section.title}</h2>
              <p className="text-xs text-muted-foreground">{section.description} · {section.items.length} resultado{section.items.length === 1 ? '' : 's'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {section.items.slice(0, visibleCount).map((evaluation) => (
                <CoachCard key={evaluation.coach.id} evaluation={evaluation} onDetails={() => setSelected(evaluation.coach)} onHire={() => setSelected(evaluation.coach)} />
              ))}
            </div>
            {section.items.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 12)}
                className="mx-auto block rounded-xl border border-border/60 bg-secondary/30 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Mostrar mais ({section.items.length - visibleCount} restantes)
              </button>
            )}
          </section>
        ))}

        {selected && (
          <CoachDetail
            coach={selected}
            profile={profile}
            evaluation={selectedEvaluation}
            currentCoach={hiredCoach}
            isHired={hiredCoach?.id === selected.id}
            onClose={() => setSelected(null)}
            onHire={() => handleHire(selected)}
            onFire={handleFire}
          />
        )}
      </PageContent>
    </Page>
  );
}
