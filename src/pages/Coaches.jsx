import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCareer } from '@/careers/useCareer.js';
import { Search, SlidersHorizontal, UserCheck, Users } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { Button, EmptyState, Page, PageContent, PageHeader, PageSkeleton, ProgressBar, StatusBadge, Surface } from '@/components/design-system';
import { daysUntilIso, remainingLabel, shortDateBr } from '@/lib/partnerScreen.js';
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
import { ensureCoachMarketInitialized, hirePrimaryCoach, listCoachMarketForDate, renewPrimaryCoach, resolveActiveCoach } from '@/game-core/coachLifecycle';
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
  const { activeCareer } = useCareer();
  const [searchParams] = useSearchParams();
  const openedCoachRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [hiredCoach, setHiredCoach] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marketState, setMarketState] = useState('uninitialized');
  const [marketError, setMarketError] = useState('');
  const [marketMetrics, setMarketMetrics] = useState(null);
  const [statusFilter, setStatusFilter] = useState('available');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('recommendation');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  // Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 4): o filtro
  // padrão para uma carreira nova é "available" (getDefaultCoachDiscoveryFilter),
  // que pode listar dezenas de treinadores de uma vez sem paginação nenhuma —
  // isto só limita quantos cards renderizam por vez, sem tocar em
  // buildCoachDiscovery/filterCoachDiscovery/sortCoachDiscovery nem inventar
  // nenhum critério de recomendação novo.
  // Playthrough 4.8, Parte I/M — mesma lógica visual compacta da tela de
  // propostas de dupla: 4 cards por "página" em vez de 12, agora que o
  // card é compacto (grid de 2 colunas) e não mais uma linha full-width.
  const [visibleCount, setVisibleCount] = useState(4);
  const [highlightedVisibleCount, setHighlightedVisibleCount] = useState(4);
  const [restVisibleCount, setRestVisibleCount] = useState(4);
  // Starter Coach Flow (docs/STARTER_COACH_FLOW.md, Parte C-F): a visão
  // padrão (sem filtro/busca tocados) mostra um mercado curado por estágio
  // de carreira em vez do total de opções "disponíveis" de uma vez; este
  // link reverte para a lista completa de sempre.
  const [marketExpanded, setMarketExpanded] = useState(false);
  const { toast } = useToast();

  useEffect(() => { setVisibleCount(4); setHighlightedVisibleCount(4); setRestVisibleCount(4); setMarketExpanded(false); }, [statusFilter, specialtyFilter, sortOrder, search]);

  useEffect(() => { void load(activeCareer?.career_id); }, [activeCareer?.career_id]);

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

  async function load(careerId = activeCareer?.career_id) {
    setLoading(true);
    setMarketState('loading');
    setMarketError('');
    try {
      const profiles = await localGame.entities.PlayerProfile.list('-created_date', 1);
      const rawProfile = profiles?.[0] || null;
      const initialized = rawProfile
        ? await ensureCoachMarketInitialized(careerId)
        : { coaches: [], initialized: true, bootstrapMs: 0, queryMs: 0, seeded: 0 };
      const resolved = rawProfile ? await resolveActiveCoach(rawProfile) : { profile: rawProfile, coach: null };
      const activeProfile = resolved.profile || rawProfile;
      const [dbCoaches, transactions] = activeProfile ? await Promise.all([
        Promise.resolve(initialized.coaches),
        localGame.entities.FinancialTransaction.filter({ profile_id: activeProfile.id }),
      ]) : [[], []];
      const latestClose = (transactions || [])
        .filter((entry) => entry.type === 'monthly_close')
        .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))[0];
      const hired = resolved.coach || (dbCoaches || []).find((coach) => coach.id === activeProfile?.coach_id) || null;
      setProfile(activeProfile);
      // LOCAL-8F (8F-06): disponibilidade e salário do mês vêm da mesma
      // projeção usada pelo Mercado Mundial e pela contratação.
      setCoaches(activeProfile ? await listCoachMarketForDate(activeProfile.career_date, dbCoaches || []) : []);
      setHiredCoach(hired);
      setMonthlyIncome(Number(latestClose?.income) > 0 ? Number(latestClose.income) : null);
      setStatusFilter(getDefaultCoachDiscoveryFilter(activeProfile));
      setMarketMetrics(initialized);
      setMarketState((dbCoaches || []).length > 0 ? 'ready-with-results' : 'ready-empty');
    } catch (error) {
      console.error(error);
      setMarketError(error?.message || 'Falha ao inicializar o mercado de treinadores.');
      setMarketState('error');
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

  if (loading || marketState === 'uninitialized' || marketState === 'loading') return <PageSkeleton variant="grid" rows={6} />;

  const affinityCurrent = hiredCoach && profile ? calculateAffinity(hiredCoach, profile) : 0;
  const trust = Number(profile?.coach_trust ?? 55);
  const tactical = Number(profile?.coach_tactical_understanding ?? 20);
  // 5.31: contrato numa linha só ("N dias restantes · até DD/MM/AAAA").
  const coachEnd = profile?.coach_contract_end_date || null;
  const coachContractLine = coachEnd ? [remainingLabel(daysUntilIso(profile?.career_date, coachEnd)), `até ${shortDateBr(coachEnd)}`].filter(Boolean).join(' · ') : null;
  const filtersChanged = statusFilter !== getDefaultCoachDiscoveryFilter(profile) || specialtyFilter !== 'all' || sortOrder !== 'recommendation';

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent data-coach-market-state={marketState} data-coach-count={coaches.length} data-coach-bootstrap-ms={Math.round(marketMetrics?.bootstrapMs || 0)}>
        <PageHeader
          dense
          eyebrow="Equipe técnica"
          icon={Users}
          title="Treinador principal"
          tone="brand"
          action={<StatusBadge tone="neutral">Saldo {currency(profile?.coins)}</StatusBadge>}
        />

        {marketState === 'error' && (
          <Surface className="border-red-500/30 p-4">
            <p className="text-sm font-black text-red-300">Mercado indisponÃ­vel</p>
            <p className="mt-1 text-xs text-muted-foreground">{marketError}</p>
            <button type="button" onClick={() => load()} className="mt-3 min-h-11 rounded-xl bg-secondary px-4 text-xs font-bold">Tentar novamente</button>
          </Surface>
        )}

        {marketState === 'ready-empty' && (
          <EmptyState icon={Users} eyebrow="Mercado de tÃ©cnicos" title="Nenhum treinador disponÃ­vel" description="O bootstrap e a consulta terminaram sem encontrar profissionais para esta carreira." compact />
        )}

        {/* Fase 5.31 — quem é o técnico, quanto custa, até quando e como está a
            relação, num cartão só (antes: HUD + cartão repetiam os mesmos
            números). Sem técnico: o estado e o próximo passo, sem CTA falso. */}
        {hiredCoach ? (
          <section data-coach-hero="active" className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm">
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-black text-primary">{(hiredCoach.name || '?')[0]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-primary"><UserCheck className="h-3.5 w-3.5" /> Técnico atual</p>
                  <StatusBadge tone="success" className="shrink-0">Contratado</StatusBadge>
                </div>
                <p className="mt-0.5 truncate text-base font-black">{hiredCoach.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{COACH_SPECIALTY_INFO[hiredCoach.specialty]?.label || hiredCoach.specialty} · {COACH_TIERS[hiredCoach.tier]?.label || hiredCoach.tier}</p>
                <p className="mt-0.5 text-[11px] font-bold">{profile?.coach_paid_by_club ? 'Pago pelo clube' : `${currency(profile?.coach_monthly_salary || hiredCoach.monthly_cost)}/mês`}{coachContractLine ? <span className="font-semibold text-muted-foreground"> · {coachContractLine}</span> : null}</p>
              </div>
            </div>
            <p className="mt-3 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>Confiança <strong className="text-foreground">{trust}%</strong></span>
              <span>Afinidade <strong className="text-foreground">{affinityCurrent}%</strong></span>
            </p>
            <ProgressBar label="Entendimento tático" value={tactical} tone="info" size="sm" className="mt-2" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button level="ghost" size="sm" onClick={() => setSelected(hiredCoach)}>Ver detalhes</Button>
              <Button level="secondary" size="sm" onClick={handleRenew}>Renovar 12 meses</Button>
            </div>
          </section>
        ) : (
          <section data-coach-hero="none" className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm">
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Técnico principal</p>
              <StatusBadge tone="warning" className="shrink-0">Vaga aberta</StatusBadge>
            </div>
            <p className="mt-0.5 text-base font-black">Nenhum treinador contratado</p>
            <p className="mt-1 text-xs text-muted-foreground">O técnico guia seus treinos e lidera a comissão. Compare os recomendados abaixo: custo e efeito principal aparecem em cada cartão.</p>
          </section>
        )}

        <div className="space-y-2" data-coach-filters>
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/60 bg-background/35 px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, cidade ou especialidade..." className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </label>
            <Button level="ghost" size="sm" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className="shrink-0 border border-border/60"><SlidersHorizontal className="h-3.5 w-3.5" /> Filtros{filtersChanged ? ' •' : ''}</Button>
          </div>
          {filtersOpen && (
            <div className="grid gap-2 sm:grid-cols-3">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar situação" className="min-h-10 min-w-0 rounded-xl border border-border/60 bg-background/70 px-3 text-xs font-bold outline-none">
                {STATUS_FILTERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <select value={specialtyFilter} onChange={(event) => setSpecialtyFilter(event.target.value)} aria-label="Filtrar especialidade" className="min-h-10 min-w-0 rounded-xl border border-border/60 bg-background/70 px-3 text-xs font-bold outline-none">
                <option value="all">Todas as especialidades</option>
                {Object.entries(COACH_SPECIALTY_INFO).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
              </select>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Ordenar técnicos" className="min-h-10 min-w-0 rounded-xl border border-border/60 bg-background/70 px-3 text-xs font-bold outline-none">
                <option value="recommendation">Mais relevantes</option>
                <option value="quality">Maior OVR</option>
                <option value="salary">Menor salário</option>
                <option value="value">Custo-benefício</option>
                <option value="name">Nome</option>
              </select>
            </div>
          )}
        </div>

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
                  <h2 className="text-sm font-black">Recomendados para você</h2>
                  <p className="text-[11px] text-muted-foreground">Afinidade, nível e custo-benefício para sua carreira agora.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {market.highlighted.slice(0, highlightedVisibleCount).map((evaluation) => (
                    <CoachCard key={evaluation.coach.id} evaluation={evaluation} profile={profile} onDetails={() => setSelected(evaluation.coach)} onHire={() => setSelected(evaluation.coach)} />
                  ))}
                </div>
                {market.highlighted.length > highlightedVisibleCount && (
                  <button type="button" onClick={() => setHighlightedVisibleCount((count) => count + 4)} className="mx-auto block rounded-xl border border-border/60 bg-secondary/30 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">
                    Mostrar mais ({market.highlighted.length - highlightedVisibleCount} restantes)
                  </button>
                )}
              </section>
            )}
            {marketRest.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h2 className="text-sm font-black">Outras opções disponíveis</h2>
                  <p className="text-[11px] text-muted-foreground">Também elegíveis agora.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {marketRest.slice(0, restVisibleCount).map((evaluation) => (
                    <CoachCard key={evaluation.coach.id} evaluation={evaluation} profile={profile} onDetails={() => setSelected(evaluation.coach)} onHire={() => setSelected(evaluation.coach)} />
                  ))}
                </div>
                {marketRest.length > restVisibleCount && (
                  <button type="button" onClick={() => setRestVisibleCount((count) => count + 4)} className="mx-auto block rounded-xl border border-border/60 bg-secondary/30 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">
                    Mostrar mais ({marketRest.length - restVisibleCount} restantes)
                  </button>
                )}
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
              <h2 className="text-sm font-black">{section.title}</h2>
              <p className="text-xs text-muted-foreground">{section.description} · {section.items.length} resultado{section.items.length === 1 ? '' : 's'}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {section.items.slice(0, visibleCount).map((evaluation) => (
                <CoachCard key={evaluation.coach.id} evaluation={evaluation} profile={profile} onDetails={() => setSelected(evaluation.coach)} onHire={() => setSelected(evaluation.coach)} />
              ))}
            </div>
            {section.items.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 4)}
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
