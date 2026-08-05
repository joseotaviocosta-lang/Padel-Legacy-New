import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Globe2, Users, Eye, Star, X, Handshake, Send, UserRoundCog, BriefcaseBusiness, Info, ShieldCheck } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { LoadingScreen } from '@/components/padel/ui';
import { Page, PageContent, PageHeader, CardGrid, StatCard, Surface, StatusBadge, EmptyState } from '@/components/design-system';
import { getGlobalMarketSnapshot, processGlobalMarketMonth, getPlayerScoutingReports, getScoutingLevels, scoutAthlete, toggleShortlist, getNegotiationPreview, submitPartnerOffer } from '@/game-core';
import { COACH_TIERS, COACH_SPECIALTY_INFO } from '@/lib/coaches';
import { useToast } from '@/components/ui/use-toast';

const PAGE_SIZE = 50;
const TABS = [
  { id: 'athletes', label: 'Atletas', icon: Users },
  { id: 'teams', label: 'Duplas', icon: Handshake },
  { id: 'coaches', label: 'Treinadores', icon: UserRoundCog },
  { id: 'movements', label: 'Movimentações', icon: BriefcaseBusiness },
];

function money(value) { return Number(value || 0).toLocaleString('pt-BR'); }
function initials(name) { return String(name || '?').split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }

export default function WorldMarket() {
  const [profile, setProfile] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [reports, setReports] = useState([]);
  const [tab, setTab] = useState('athletes');
  const [search, setSearch] = useState('');
  const [athleteFilter, setAthleteFilter] = useState('livres');
  const [coachTier, setCoachTier] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [scouting, setScouting] = useState(null);
  const [negotiating, setNegotiating] = useState(false);
  const [offerTerms, setOfferTerms] = useState({ durationDays: 60, partnerPrizeShare: 50, monthlySalary: 0, signingBonus: 0 });
  const { toast } = useToast();
  const scoutingLevels = getScoutingLevels();

  useEffect(() => { load(); }, []);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [tab, search, athleteFilter, coachTier]);

  async function load() {
    setLoading(true);
    try {
      const user = await localGame.auth.me();
      const current = await ensureMyProfile(user);
      const market = await getGlobalMarketSnapshot(current, current?.career_date);
      const scoutingReports = await getPlayerScoutingReports(current?.id).catch(() => []);
      setProfile(current);
      setSnapshot(market);
      setReports(scoutingReports || []);
    } catch (error) {
      toast({ title: 'Erro no mercado', description: error.message || 'Não foi possível carregar o mercado mundial.', variant: 'destructive' });
    } finally { setLoading(false); }
  }

  async function processMonth() {
    setProcessing(true);
    try {
      const result = await processGlobalMarketMonth(profile, profile?.career_date);
      setSnapshot(result.snapshot);
      toast({ title: result.skipped ? 'Mercado já atualizado' : 'Mercado renovado', description: result.skipped ? `O mês ${result.snapshot.month} já estava processado.` : 'Disponibilidade, valores e oportunidades foram atualizados.' });
    } catch (error) {
      toast({ title: 'Falha ao atualizar', description: error.message || 'Não foi possível processar o mercado.', variant: 'destructive' });
    } finally { setProcessing(false); }
  }

  const reportMap = useMemo(() => Object.fromEntries(reports.map((report) => [report.athlete_id, report])), [reports]);
  const athletes = useMemo(() => (snapshot?.athletes || []).filter((athlete) => {
    if (athleteFilter === 'livres' && athlete.market_status !== 'livre') return false;
    if (athleteFilter === 'observacao' && !reportMap[athlete.id]?.is_shortlisted) return false;
    if (athleteFilter === 'ativos' && athlete.career_status === 'aposentado') return false;
    return `${athlete.name || ''} ${athlete.country || ''}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => (Number(a.world_rank) || 9999) - (Number(b.world_rank) || 9999)), [snapshot, athleteFilter, search, reportMap]);

  const teams = useMemo(() => (snapshot?.teams || []).filter((team) => `${team.player1_name || ''} ${team.player2_name || ''}`.toLowerCase().includes(search.toLowerCase())), [snapshot, search]);
  const coaches = useMemo(() => (snapshot?.coaches || []).filter((coach) => {
    if (!coach.market_available) return false;
    if (coachTier !== 'all' && coach.tier !== coachTier) return false;
    return `${coach.name || ''} ${coach.specialty_label || ''} ${coach.nationality || ''}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => (Number(a.market_salary) || 0) - (Number(b.market_salary) || 0)), [snapshot, coachTier, search]);

  function openAthlete(athlete) {
    setSelected({ type: 'athlete', data: athlete });
    setOfferTerms({ durationDays: 60, partnerPrizeShare: 50, monthlySalary: Math.max(50, Number(athlete.expected_salary) || 500), signingBonus: Math.max(100, Math.round((Number(athlete.market_value) || 1000) * 0.08)) });
  }

  async function handleScout(levelKey) {
    const athlete = selected?.data;
    if (!athlete) return;
    setScouting(levelKey);
    try {
      const result = await scoutAthlete(profile, athlete, levelKey);
      if (result.profile) setProfile(result.profile);
      const next = await getPlayerScoutingReports(profile.id);
      setReports(next || []);
      toast({ title: 'Relatório concluído', description: `${athlete.name} foi analisado.` });
    } catch (error) { toast({ title: 'Scouting não realizado', description: error.message, variant: 'destructive' }); }
    finally { setScouting(null); }
  }

  async function handleShortlist(athlete) {
    const next = !reportMap[athlete.id]?.is_shortlisted;
    await toggleShortlist(profile, athlete, next);
    setReports(await getPlayerScoutingReports(profile.id));
  }

  async function handleOffer() {
    const athlete = selected?.data;
    if (!athlete) return;
    setNegotiating(true);
    try {
      const report = reportMap[athlete.id];
      const result = await submitPartnerOffer(profile, athlete, report, offerTerms);
      if (result.profile) setProfile(result.profile);
      toast({ title: result.accepted ? 'Proposta aceita!' : 'Proposta recusada', description: result.accepted ? `${athlete.name} agora forma dupla com você.` : 'Os termos não foram suficientes.', variant: result.accepted ? 'default' : 'destructive' });
      if (result.accepted) { setSelected(null); await load(); }
    } catch (error) { toast({ title: 'Negociação não concluída', description: error.message, variant: 'destructive' }); }
    finally { setNegotiating(false); }
  }

  if (loading) return <LoadingScreen />;
  const athlete = selected?.type === 'athlete' ? selected.data : null;
  const report = athlete ? reportMap[athlete.id] : null;
  const preview = athlete ? getNegotiationPreview(profile, athlete, report, offerTerms) : null;

  return <Page size="default" className="animate-fade-in">
    <PageContent>
      <PageHeader
        eyebrow="Circuito profissional"
        icon={Globe2}
        title="Mercado Mundial"
        description="Compare atletas, acompanhe duplas e encontre profissionais compatíveis com a próxima fase da sua carreira."
        tone="info"
        breadcrumb={['Mundo', 'Mercado']}
        action={<button onClick={processMonth} disabled={processing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`} />{processing ? 'Atualizando...' : 'Atualizar mês'}</button>}
        stats={[
          <StatusBadge key="month" tone="info">Mercado {snapshot?.month || 'atual'}</StatusBadge>,
          <StatusBadge key="status" tone="success">Atualização mensal ativa</StatusBadge>,
        ]}
      />

      <CardGrid columns={4}>
        <StatCard label="Atletas ativos" value={snapshot?.summary?.activeAthletes || 0} detail="universo competitivo" icon={Users} tone="brand" />
        <StatCard label="Duplas ranqueadas" value={snapshot?.summary?.activeTeams || 0} detail="parcerias no circuito" icon={Handshake} tone="info" />
        <StatCard label="Técnicos disponíveis" value={snapshot?.summary?.availableCoaches || 0} detail="mercado deste mês" icon={UserRoundCog} tone="warning" />
        <StatCard label="Opções iniciantes" value={snapshot?.summary?.beginnerCoaches || 0} detail="acessíveis agora" icon={ShieldCheck} tone="success" />
      </CardGrid>

      <Surface padding="compact" className="flex gap-1 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold whitespace-nowrap transition ${tab === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </Surface>

      <Surface padding="compact" className="flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, país ou especialidade" className="w-full rounded-xl border border-border/70 bg-secondary/35 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /></div>
        {tab === 'athletes' && <div className="flex gap-1 overflow-x-auto">{[['livres','Livres'],['ativos','Ativos'],['observacao','Observação'],['todos','Todos']].map(([id,label]) => <button key={id} onClick={() => setAthleteFilter(id)} className={`rounded-xl px-3 py-2 text-xs font-extrabold whitespace-nowrap ${athleteFilter === id ? 'bg-primary/15 text-primary' : 'bg-secondary/45 text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div>}
        {tab === 'coaches' && <select value={coachTier} onChange={(event) => setCoachTier(event.target.value)} className="rounded-xl border border-border/70 bg-secondary/35 px-3 py-2 text-sm outline-none focus:border-primary/50"><option value="all">Todas as categorias</option>{Object.entries(COACH_TIERS).map(([key,value]) => <option key={key} value={key}>{value.label}</option>)}</select>}
      </Surface>

    {tab === 'athletes' && (athletes.length === 0 ? <EmptyState icon={Users} title="Nenhum atleta encontrado" description="Altere os filtros ou aguarde a próxima atualização mensal." /> : <div className="render-window space-y-2">{athletes.slice(0, visibleCount).map((item) => <div key={item.id} className="glass rounded-2xl p-3 flex items-center gap-3"><div className="w-12 text-center font-black text-primary">#{item.world_rank || '—'}</div><div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-black">{initials(item.name)}</div><div className="min-w-0 flex-1"><p className="font-bold text-sm truncate">{item.name}</p><p className="text-[10px] text-muted-foreground">{item.country || '—'} · OVR {item.overall_rating || 0} · Pot. {item.potential || 0} · {item.market_status}</p></div><div className="hidden sm:block text-right"><p className="font-black text-sm">{money(item.market_value)}</p><p className="text-[9px] text-muted-foreground">valor</p></div><button onClick={() => handleShortlist(item)} className={`p-2 rounded-xl ${reportMap[item.id]?.is_shortlisted ? 'bg-amber-400/15 text-amber-400' : 'bg-secondary/50 text-muted-foreground'}`}><Star className={`h-4 w-4 ${reportMap[item.id]?.is_shortlisted ? 'fill-current' : ''}`} /></button><button onClick={() => openAthlete(item)} className="p-2 rounded-xl bg-primary/15 text-primary"><Eye className="h-4 w-4" /></button></div>)}{visibleCount < athletes.length && <button onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">Carregar mais</button>}</div>)}

    {tab === 'teams' && (teams.length === 0 ? <EmptyState icon={Handshake} title="Nenhuma dupla ranqueada" description="O circuito formará novas duplas conforme o calendário avançar." /> : <div className="render-window space-y-2">{teams.slice(0, visibleCount).map((team) => <div key={team.id || team.team_key} className="glass rounded-2xl p-3 grid grid-cols-[48px_1fr_auto] gap-3 items-center"><p className="font-black text-primary text-center">#{team.ranking_position}</p><div><p className="font-bold text-sm">{team.player1_name} / {team.player2_name}</p><p className="text-[10px] text-muted-foreground">{team.matches_played} jogos · {team.win_rate}% vitórias · {team.titles?.length || 0} títulos</p></div><div className="text-right"><p className="font-black">{money(team.ranking_points)}</p><p className="text-[9px] text-muted-foreground">pontos</p></div></div>)}{visibleCount < teams.length && <button onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">Carregar mais</button>}</div>)}

    {tab === 'coaches' && <div className="space-y-3"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 flex gap-2"><Info className="h-4 w-4 text-primary mt-0.5" /><p className="text-xs text-muted-foreground">O mercado garante opções iniciantes em todos os meses. Técnicos de elite aparecem com menor frequência e exigem carreira mais consolidada.</p></div>{coaches.length === 0 ? <EmptyState icon={UserRoundCog} title="Nenhum treinador disponível" description="Troque a categoria ou aguarde a próxima atualização mensal." /> : <div className="render-window grid md:grid-cols-2 gap-3">{coaches.slice(0, visibleCount).map((coach) => { const tier = COACH_TIERS[coach.tier] || COACH_TIERS.regional; const specialty = COACH_SPECIALTY_INFO[coach.specialty]; return <button key={coach.id || coach.name} onClick={() => setSelected({ type:'coach', data:coach })} className="glass rounded-2xl p-4 text-left hover:border-primary/40 border border-transparent transition"><div className="flex items-start gap-3"><div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-black">{initials(coach.name)}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="font-black text-sm truncate">{coach.name}</p><span className={`text-[9px] px-2 py-0.5 rounded-full ${tier.bg} ${tier.color}`}>{tier.label}</span></div><p className="text-[10px] text-muted-foreground">{specialty?.label || coach.specialty_label} · Rep. {coach.reputation || 0}</p><p className="mt-2 text-xs text-muted-foreground line-clamp-2">{specialty?.summary || coach.philosophy}</p><div className="mt-3 flex justify-between"><span className="text-xs font-black text-primary">{money(coach.market_salary)}/mês</span><span className="text-[10px] text-muted-foreground">Demanda {String(coach.market_demand || 'media').replace('_',' ')}</span></div></div></div></button>; })}{visibleCount < coaches.length && <button onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} className="md:col-span-2 w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">Carregar mais</button>}</div>}</div>}

    {tab === 'movements' && ((snapshot?.recentMovements || []).length === 0 ? <EmptyState icon={BriefcaseBusiness} title="Sem movimentações recentes" description="Avance o calendário para acompanhar trocas de dupla, aposentadorias e mudanças de mercado." /> : <div className="render-window space-y-2">{snapshot.recentMovements.slice(0, visibleCount).map((event) => <div key={event.id} className="glass rounded-2xl p-4"><div className="flex justify-between gap-3"><p className="font-bold text-sm">{event.title}</p><span className="text-[10px] text-muted-foreground whitespace-nowrap">{event.event_date}</span></div><p className="mt-1 text-xs text-muted-foreground">{event.content}</p></div>)}{visibleCount < snapshot.recentMovements.length && <button onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">Carregar mais</button>}</div>)}

    {selected && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="w-full max-w-xl max-h-[90vh] overflow-y-auto glass rounded-3xl p-5 space-y-4"><div className="flex items-start gap-3"><div className="h-12 w-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-black">{initials(selected.data.name)}</div><div className="flex-1"><p className="font-black text-lg">{selected.data.name}</p><p className="text-xs text-muted-foreground">{selected.type === 'athlete' ? `${selected.data.country || '—'} · #${selected.data.world_rank || '—'}` : `${selected.data.specialty_label} · ${COACH_TIERS[selected.data.tier]?.label || selected.data.tier}`}</p></div><button onClick={() => setSelected(null)} className="p-2 rounded-xl bg-secondary/50"><X className="h-4 w-4" /></button></div>
      {selected.type === 'coach' && <><div className="grid grid-cols-2 gap-2"><Surface padding="compact"><p className="text-[10px] text-muted-foreground">Salário mensal</p><p className="text-lg font-black">{money(selected.data.market_salary)}</p></Surface><Surface padding="compact"><p className="text-[10px] text-muted-foreground">Bônus de assinatura</p><p className="text-lg font-black">{money(selected.data.market_signing_bonus)}</p></Surface></div><div className="rounded-2xl bg-secondary/30 p-4"><p className="font-bold text-sm">Como ajuda</p><p className="mt-1 text-xs text-muted-foreground">{COACH_SPECIALTY_INFO[selected.data.specialty]?.summary || selected.data.philosophy}</p><div className="mt-3 flex flex-wrap gap-1">{(selected.data.specializations || []).slice(0,5).map((item) => <span key={item} className="rounded-full bg-primary/10 text-primary px-2 py-1 text-[10px]">{String(item).replaceAll('_',' ')}</span>)}</div></div><p className="text-xs text-muted-foreground">A contratação continua sendo concluída na aba Treinadores, onde afinidade, vagas e requisitos são validados.</p></>}
      {selected.type === 'athlete' && <><div className="grid grid-cols-3 gap-2"><Surface padding="compact"><p className="text-[10px] text-muted-foreground">Overall</p><p className="text-xl font-black">{athlete.overall_rating || 0}</p></Surface><Surface padding="compact"><p className="text-[10px] text-muted-foreground">Potencial</p><p className="text-xl font-black">{athlete.potential || 0}</p></Surface><Surface padding="compact"><p className="text-[10px] text-muted-foreground">Encaixe</p><p className="text-xl font-black">{report?.tactical_fit || '—'}</p></Surface></div><div><p className="font-bold text-sm mb-2">Scouting</p><div className="grid grid-cols-3 gap-2">{Object.entries(scoutingLevels).map(([key,level]) => <button key={key} onClick={() => handleScout(key)} disabled={Boolean(scouting)} className="rounded-xl bg-secondary/40 p-3 text-left disabled:opacity-50"><p className="text-xs font-bold">{level.label}</p><p className="text-[10px] text-muted-foreground">{money(level.cost)} moedas</p></button>)}</div></div>{athlete.market_status === 'livre' && <div className="space-y-3 border-t border-border/50 pt-4"><p className="font-bold text-sm">Proposta de dupla</p><div className="grid grid-cols-2 gap-2"><input type="number" value={offerTerms.monthlySalary} onChange={(event) => setOfferTerms((value) => ({ ...value, monthlySalary:Number(event.target.value) }))} className="rounded-xl bg-secondary/40 border border-border/60 px-3 py-2 text-sm" placeholder="Salário" /><input type="number" value={offerTerms.signingBonus} onChange={(event) => setOfferTerms((value) => ({ ...value, signingBonus:Number(event.target.value) }))} className="rounded-xl bg-secondary/40 border border-border/60 px-3 py-2 text-sm" placeholder="Bônus" /></div><div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex justify-between"><span className="text-xs text-muted-foreground">Chance estimada</span><strong className="text-primary">{preview?.acceptanceChance || 0}%</strong></div><button onClick={handleOffer} disabled={negotiating || !preview?.canAfford} className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"><Send className="h-4 w-4" />{negotiating ? 'Enviando...' : 'Enviar proposta'}</button></div>}</>}
    </div></div>}
    </PageContent>
  </Page>;
}
