import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Brain, Handshake, Search, SlidersHorizontal, UserCheck, Users, Wallet } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { CompactStats, EmptyState, Page, PageContent, PageHeader, PageSkeleton, ProgressBar, StatusBadge, Surface } from '@/components/design-system';
import CoachCard from '@/components/coaches/CoachCard';
import CoachDetail from '@/components/coaches/CoachDetail';
import {
  buildCoachDiscovery,
  buildCoachMarket,
  calculateAffinity,
  COACH_SPECIALTY_INFO,
  COACH_TIERS,
  evaluateCoachForCareer,
  filterCoachDiscovery,
  getDefaultCoachDiscoveryFilter,
  sortCoachDiscovery,
} from '@/lib/coaches';
import { useToast } from '@/components/ui/use-toast';
import { hirePrimaryCoach, renewPrimaryCoach, resolveActiveCoach } from '@/game-core/coachLifecycle';
import { useCareerProfileSync } from '@/hooks/useCareerProfileSync.js';

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
  // Starter Coach Flow (docs/STARTER_COACH_FLOW.md, Parte C-F): a visão
  // padrão (sem filtro/busca tocados) mostra um mercado curado por estágio
  // de carreira em vez do total de opções "disponíveis" de uma vez; este
  // link reverte para a lista completa de sempre.
  const [marketExpanded, setMarketExpanded] = useState(false);
  const { toast } = useToast();

  useEffect(() => { setVisibleCount(12); setMarketExpanded(false); }, [statusFilter, specialtyFilter, sortOrder, search]);

  useEffect(() => { load(); }, []);

  // Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.12): correção incidental,
  // não coberta pelo M3.7.2 na época (docs/MOBILE_M3_7_2_MATCH_DAY_REFRESH.md
  // já documentava isso como pendente) — esta página disparava
  // padel:profile-updated ao contratar/demitir mas nunca escutava o próprio
  // evento nem o do atalho global "Avançar dia", mesma causa raiz corrigida
  // em Matches.jsx/Training.jsx/Missions.jsx. Corrigido agora porque este
  // arquivo já estava sendo editado para a M4.
  useCareerProfileSync(setProfile);

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
      const resolved = rawProfile ? await resolveActiveCoach(rawProfile) : { profile: rawProfile, coach: null };
      const activeProfile = resolved.profile || rawProfile;
      const [dbCoaches, transactions] = activeProfile ? await Promise.all([
        localGame.entities.Coach.list('-reputation', 500),
        localGame.entities.FinancialTransaction.filter({ profile_id: activeProfile.id }),
      ]) : [[], []];
      const latestClose = (transactions || [])
        .filter((entry) => entry.type === 'monthly_close')
        .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))[0];
      const hired = resolved.coach || (dbCoaches || []).find((coach) => coach.id === activeProfile?.coach_id) || null;
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

  // Starter Coach Flow (docs/STARTER_COACH_FLOW.md, Parte C/E/F): reaproveita
  // buildCoachDiscovery inteiro (buildCoachMarket só embrulha) — nenhum
  // critério de elegibilidade/recomendação novo, só um recorte por estágio
  // de carreira sobre o mesmo resultado.
  const market = useMemo(() => buildCoachMarket(
    coaches.filter((coach) => coach.id !== hiredCoach?.id),
    profile,
    { monthlyIncome },
  ), [coaches, hiredCoach?.id, monthlyIncome, profile]);
  const isDefaultMarketView = statusFilter === 'available' && specialtyFilter === 'all' && !search && !marketExpanded;
  // `curated` é construído como [...highlighted, ...rest].slice(0, cap) —
  // fatiar a partir do tamanho de `highlighted` separa os dois grupos sem
  // recomputar nada.
  const marketRest = useMemo(() => market.curated.slice(market.highlighted.length), [market]);

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
      // Hotfix "Starter Coach Flow" / Single Source of Truth
      // (docs/STARTER_COACH_FLOW.md): coaches-known agora só conclui numa
      // contratação real (ver hirePrimaryCoach) — Home/Guia precisam saber
      // imediatamente, mesmo padrão já usado pelos handlers de Missions.jsx.
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('padel:onboarding-refresh', { detail: { completedStepId: 'coaches-known' } }));
        window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile: updated } }));
      }
    } catch (error) {
      toast({ title: 'Não foi possível contratar', description: error?.message || 'Verifique os requisitos e o saldo.', variant: 'destructive' });
    }
  }

  async function handleFire() {
    if (!profile || !hiredCoach) return;
    try {
      // Hotfix "Starter Coach Flow" (docs/STARTER_COACH_FLOW.md, Parte A):
      // demitir deixa o jogador sem treinador — nada reatribui um substituto
      // automaticamente (isso era exatamente o problema relatado no QA).
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        coach_id: null, coach_name: null, coach_monthly_salary: 0, coach_signing_cost: 0,
        coach_contract_status: 'terminated', coach_paid_by_club: false,
        coach_trust: 45, coach_relationship_months: 0, coach_tactical_understanding: 15,
      });
      setProfile(updated);
      setHiredCoach(null);
      setSelected(null);
      toast({ title: 'Treinador dispensado', description: `${hiredCoach.name} deixou a equipe. Escolha um novo treinador quando quiser.` });
    } catch (error) {
      toast({ title: 'Falha ao dispensar', description: error?.message || 'Tente novamente.', variant: 'destructive' });
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
          dense
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

        {/* Starter Coach Flow (docs/STARTER_COACH_FLOW.md, Parte D/12/13),
            migrado para o CompactStats compartilhado na Mobile M4
            (docs/MOBILE_M4_COMPACT_UX.md, M4.12) — mesmo padrão que este
            arquivo já tinha inventado antes de existir um primitive
            compartilhado; agora reaproveita em vez de manter duas
            implementações. Sem treinador, mostra "—" em vez de fingir que
            confiança/afinidade existem. */}
        <CompactStats items={[
          { label: '', value: currency(profile?.coins), icon: Wallet },
          { label: '', value: hiredCoach ? hiredCoach.name : 'Nenhum treinador', icon: UserCheck },
          { label: 'confiança', value: hiredCoach ? `${trust}%` : '—', icon: Handshake },
          { label: 'afinidade', value: hiredCoach ? `${affinityCurrent}%` : '—', icon: Brain },
        ]} />

        {hiredCoach ? (
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
            <div className="mt-3">
              <p className="mb-1 text-[9px] font-bold uppercase text-muted-foreground">Entendimento tático</p>
              <ProgressBar value={tactical} tone="info" />
            </div>
          </Surface>
        ) : (
          <Surface className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Técnico principal</p>
              <p className="mt-0.5 text-sm font-black">Nenhum contratado</p>
            </div>
            <span className="rounded-xl bg-primary/10 px-3 py-2 text-center text-[11px] font-black text-primary">Escolha um treinador abaixo</span>
          </Surface>
        )}

        <Surface className="space-y-3 p-4">
          {/* Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.15): a legenda
              removida aqui explicava um detalhe de cache interno (quando o
              mercado é recalculado), não uma regra útil ao jogador — não é
              informação de jogo perdida, só ruído técnico que não deveria
              ter estado na UI. */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <p className="text-sm font-black">Encontre seu próximo técnico</p>
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

        {isDefaultMarketView ? (
          // Starter Coach Flow (docs/STARTER_COACH_FLOW.md, Parte 7/8/9/15):
          // mercado curado por padrão — "Recomendados" (o que buildCoachDiscovery
          // já flagava recommended/bestValue) + "Outras opções" até o teto do
          // estágio de carreira, em vez do total "disponível" de uma vez
          // (24 numa carreira nova, medido de verdade contra o catálogo real).
          <>
            {market.highlighted.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h2 className="text-lg font-black">Recomendados para você</h2>
                  <p className="text-xs text-muted-foreground">Melhor combinação de afinidade, nível e custo-benefício para sua carreira agora.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {market.highlighted.map((evaluation) => (
                    <CoachCard key={evaluation.coach.id} evaluation={evaluation} onDetails={() => setSelected(evaluation.coach)} onHire={() => setSelected(evaluation.coach)} />
                  ))}
                </div>
              </section>
            )}
            {marketRest.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h2 className="text-lg font-black">Outras opções disponíveis</h2>
                  <p className="text-xs text-muted-foreground">Também elegíveis agora, fora da recomendação principal.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {marketRest.map((evaluation) => (
                    <CoachCard key={evaluation.coach.id} evaluation={evaluation} onDetails={() => setSelected(evaluation.coach)} onHire={() => setSelected(evaluation.coach)} />
                  ))}
                </div>
              </section>
            )}
            {market.availableCount > market.cap && (
              <button
                type="button"
                onClick={() => setMarketExpanded(true)}
                className="mx-auto block rounded-xl border border-border/60 bg-secondary/30 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Ver mercado completo ({market.availableCount} disponíveis no total)
              </button>
            )}
          </>
        ) : visible.length === 0 ? (
          <EmptyState icon={Users} eyebrow="Mercado de técnicos" title="Nenhum profissional neste recorte" description="Ajuste os filtros para ver outras opções. Técnicos bloqueados continuam acessíveis no filtro correspondente." compact />
        ) : sections.map((section) => section.items.length > 0 && (
          <section key={section.id} className="space-y-3">
            <div>
              <h2 className="text-lg font-black">{section.title}</h2>
              <p className="text-xs text-muted-foreground">{section.description} · {section.items.length} resultado{section.items.length === 1 ? '' : 's'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
