import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Search, Inbox, Lightbulb, History, Handshake, FileText, RefreshCw, AlertTriangle, Coins, CalendarDays } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { getPlayerRelationships } from '@/lib/relationships';
import {
  getActivePartnership, getPartnershipHistory, startPartnership, endPartnership,
  getInbox, generateAdvisorTips,
  getPartnerSwitchCount, getInstabilityPenalty, negotiatePrizeSplit, addConversation,
  sendMessage,
} from '@/lib/partnershipSystem';
import { getAvailablePartners } from '@/lib/career';
import { LoadingScreen, EmptyStateCard } from '@/components/padel/ui';
import { PageHeader, StatCard, StatusBadge } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import PartnerOverview from '@/components/partner/PartnerOverview';
import PartnerSearch from '@/components/partner/PartnerSearch';
import InboxPanel from '@/components/partner/InboxPanel';
import AdvisorPanel from '@/components/partner/AdvisorPanel';
import PartnerNegotiationModal from '@/components/partner/PartnerNegotiationModal';
import { renewPartnerContract, releasePartner } from '@/game-core/partnerLifecycle';
import PartnerOffersPanel from '@/components/partner/PartnerOffersPanel';
import { acceptPartnerOffer, ensureInitialPartnerOffers, listPartnerOffers, rejectPartnerOffer } from '@/lib/partnerOffers';

const TABS = [
  { id: 'offers', label: 'Propostas recebidas', icon: Handshake },
  { id: 'search', label: 'Buscar parceiro', icon: Search },
  { id: 'overview', label: 'Minha dupla', icon: Users },
  { id: 'inbox', label: 'Caixa de Entrada', icon: Inbox },
  { id: 'advisors', label: 'Assessores', icon: Lightbulb },
  { id: 'contract', label: 'Contrato', icon: FileText },
  { id: 'history', label: 'Histórico', icon: History },
];

export default function PartnerHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [relationships, setRelationships] = useState([]);
  const [activePartnership, setActivePartnership] = useState(null);
  const [history, setHistory] = useState([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [tips, setTips] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState(null);
  const [busyOfferId, setBusyOfferId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('view') || 'offers');
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [showConverse, setShowConverse] = useState(false);
  const proposalsRef = useRef([]);
  const { toast } = useToast();

  const selectTab = useCallback((tab, extra = {}) => {
    setActiveTab(tab);
    const next = new URLSearchParams(); next.set('view', tab);
    Object.entries(extra).forEach(([key, value]) => value && next.set(key, value));
    setSearchParams(next, { replace: true });
  }, [setSearchParams]);

  const load = useCallback(async () => {
    if (!profile) return;
    const [active, hist, rels, msgs] = await Promise.all([
      getActivePartnership(profile.id),
      getPartnershipHistory(profile.id),
      getPlayerRelationships(profile.id),
      getInbox(profile.id),
    ]);
    setActivePartnership(active);
    setHistory(hist || []);
    setRelationships(rels || []);
    setInboxCount((msgs || []).filter(m => m.status === 'nao_lida').length);

    const switchCount = await getPartnerSwitchCount(profile.id);
    const advisorTips = await generateAdvisorTips(profile, active, proposalsRef.current, switchCount);
    setTips(advisorTips);
  }, [profile]);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (profile) load();
  }, [profile, load]);

  // PartnerOffer is the source of truth; inbox messages only reference offers.
  useEffect(() => {
    if (!profile || !relationships) return;
    (async () => {
      setOffersLoading(true); setOffersError(null);
      try {
        const available = getAvailablePartnersForSearch(profile);
        const rows = activePartnership ? await listPartnerOffers(profile.id) : await ensureInitialPartnerOffers(profile, available);
        proposalsRef.current = rows; setProposals(rows);
        await load();
        if (activePartnership && !searchParams.get('view')) selectTab('overview');
      } catch (error) { console.error('partner offers', error); setOffersError(error); }
      finally { setOffersLoading(false); }
    })();
  }, [profile?.id, activePartnership?.id]);

  if (loading) return <LoadingScreen />;

  if (!profile) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <EmptyStateCard icon={Users} title="Perfil não encontrado" message="Não foi possível carregar seu perfil." />
      </div>
    );
  }

  const switchCount = history.filter(p => p.status === 'encerrada_jogador').length;
  const instability = getInstabilityPenalty(switchCount);

  async function handleInvite(bot) {
    try {
      const { partnership, profile: updated } = await startPartnership(profile, bot, 60, 50);
      setActivePartnership(partnership);
      setProfile(updated);
      toast({ title: 'Parceria formada!', description: `${bot.name} é sua nova dupla por 60 dias.` });
      await load();
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível formar a parceria.', variant: 'destructive' });
    }
  }

  async function reloadOffers() {
    setOffersLoading(true); setOffersError(null);
    try { const rows = await listPartnerOffers(profile.id); proposalsRef.current = rows; setProposals(rows); }
    catch (error) { setOffersError(error); }
    finally { setOffersLoading(false); }
  }

  async function handleAcceptOffer(offer) {
    setBusyOfferId(offer.id);
    try {
      const result = await acceptPartnerOffer(profile, offer);
      setProfile(result.profile); setActivePartnership(result.partnership);
      toast({ title: 'Dupla formada', description: `Você e ${result.partnership.partner_name} agora jogarão juntos. Entrosamento inicial: ${result.partnership.chemistry}.` });
      await reloadOffers(); await load(); selectTab('overview');
    } catch (error) { toast({ title: 'Não foi possível confirmar', description: error.message, variant: 'destructive' }); }
    finally { setBusyOfferId(null); }
  }

  async function handleRejectOffer(offer) {
    setBusyOfferId(offer.id);
    try { await rejectPartnerOffer(profile, offer); toast({ title: 'Proposta recusada', description: 'A decisão foi registrada e as demais propostas continuam disponíveis.' }); await reloadOffers(); await load(); }
    catch (error) { toast({ title: 'Erro ao recusar', description: error.message, variant: 'destructive' }); }
    finally { setBusyOfferId(null); }
  }

  async function handleEndPartnership() {
    if (!activePartnership) return;
    try {
      await endPartnership(activePartnership.id, 'encerrada_jogador', 'Decisão do jogador');
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        partner_id: null, partner_name: null, partner_locked_until: null, partner_chemistry: 50,
      });
      setProfile(updated);
      setActivePartnership(null);
      toast({ title: 'Parceria encerrada', description: 'Você está sem dupla agora.' });
      await load();
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível encerrar.', variant: 'destructive' });
    }
  }

  async function handleNegotiate(newTerms) {
    if (!activePartnership) return;
    try {
      const updated = await negotiatePrizeSplit(activePartnership.id, newTerms.split);
      setActivePartnership(updated);
      setShowNegotiation(false);
      toast({ title: 'Negociação concluída', description: `Divisão ajustada para ${newTerms.split}%/${100 - newTerms.split}%.` });
    } catch (e) {
      toast({ title: 'Erro', description: 'Falha na negociação.', variant: 'destructive' });
    }
  }

  async function handleRenewContract(terms) {
    try {
      const result = await renewPartnerContract(profile, terms);
      setProfile(result.profile || profile);
      setActivePartnership(result.partnership);
      toast({ title: 'Contrato renovado!', description: `A dupla segue unida até ${result.partnership.contract_end_date}.` });
      await load();
    } catch (e) {
      toast({ title: 'Erro na renovação', description: e?.message || 'Não foi possível renovar o contrato.', variant: 'destructive' });
    }
  }

  async function handleReleaseContract() {
    try {
      const result = await releasePartner(profile, 'Rescisão solicitada na gestão de contrato');
      setProfile(result.profile || profile);
      setActivePartnership(null);
      toast({
        title: 'Contrato encerrado',
        description: result.penalty > 0 ? `Multa de ${result.penalty} moedas aplicada.` : 'A parceria foi encerrada sem multa.',
      });
      await load();
      setActiveTab('search');
    } catch (e) {
      toast({ title: 'Erro na rescisão', description: e?.message || 'Não foi possível encerrar o contrato.', variant: 'destructive' });
    }
  }

  async function handleConverse(text, tone) {
    if (!activePartnership) return;
    const updated = await addConversation(activePartnership.id, profile.sport_name || 'Você', text, tone);
    if (updated) setActivePartnership(updated);
    setShowConverse(false);
    const description = tone === 'positivo' || tone === 'apoio'
      ? 'A confiança e a moral da dupla melhoraram.'
      : tone === 'negativo'
        ? 'A conversa gerou tensão na parceria.'
        : 'A conversa foi registrada no histórico da dupla.';
    toast({ title: 'Conversa registrada', description });
    await load();
  }

  async function handleInboxAction(action, msg) {
    if (action.type === 'view_partner_offer') {
      selectTab('offers', { offer: action.payload?.offerId || msg.related_entity_id });
    } else if (action.type === 'accept_partnership') {
      const { bot, duration, split } = action.payload;
      const { partnership, profile: updated } = await startPartnership(profile, bot, duration, split);
      setActivePartnership(partnership);
      setProfile(updated);
      toast({ title: 'Proposta aceita!', description: `${bot.name} é sua nova dupla.` });
      await load();
    } else if (action.type === 'decline_partnership') {
      toast({ title: 'Proposta recusada' });
    } else if (action.type === 'counter_proposal') {
      const { bot } = action.payload;
      await sendMessage(profile.id, {
        message_type: 'negociacao',
        sender_name: profile.sport_name || 'Você',
        sender_type: 'atleta',
        title: `Contraproposta para ${bot.name}`,
        content: `Gostaria de negociar termos diferentes para a parceria.`,
        status: 'lida',
        career_date: profile.career_date,
      });
      toast({ title: 'Contraproposta enviada', description: `${bot.name} vai responder em breve.` });
    }
  }

  const chemistry = activePartnership?.chemistry ?? profile?.partner_chemistry ?? 0;
  const confidence = activePartnership?.trust ?? activePartnership?.confidence ?? 0;
  const sharedMatches = activePartnership?.shared_matches ?? 0;
  const offerCount = proposals.filter((offer) => offer.status === 'pendente' || !offer.status).length;

  return (
    <div className="px-4 md:px-8 py-5 md:py-6 max-w-6xl mx-auto space-y-5 animate-fade-in">
      <PageHeader
        icon={Handshake}
        eyebrow="Dupla e relações"
        title={activePartnership ? `Você e ${activePartnership.partner_name}` : 'Construa sua próxima dupla'}
        description={activePartnership
          ? 'Acompanhe vínculo, contrato, conversas e decisões esportivas da parceria.'
          : 'Analise propostas e encontre um parceiro compatível com seu lado e estilo de jogo.'}
        tone="brand"
        breadcrumb={['Carreira', 'Dupla e relações']}
        action={inboxCount > 0 ? <StatusBadge tone="info" icon={Inbox}>{inboxCount} não lida(s)</StatusBadge> : null}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Situação" value={activePartnership ? 'Dupla ativa' : 'Sem dupla'} detail={activePartnership?.partner_name || 'Escolha uma proposta'} icon={Users} tone={activePartnership ? 'success' : 'warning'} />
        <StatCard label="Entrosamento" value={`${Math.round(chemistry)}/100`} detail={sharedMatches > 0 ? `${sharedMatches} partidas juntos` : 'Construído com jogos e treinos'} icon={Handshake} tone="brand" />
        <StatCard label="Confiança" value={`${Math.round(confidence)}/100`} detail="Relação profissional da dupla" icon={Lightbulb} tone="info" />
        <StatCard label="Propostas" value={offerCount} detail={inboxCount > 0 ? `${inboxCount} mensagem(ns) nova(s)` : 'Mercado atualizado'} icon={Inbox} tone="premium" />
      </div>

      {/* Instability banner */}
      {switchCount >= 2 && (
        <div className="glass rounded-2xl p-4 border border-amber-500/30 bg-amber-500/5 flex items-center gap-3">
          <span className={`text-2xl font-black ${instability.color}`}>{switchCount}</span>
          <div>
            <p className={`font-bold text-sm ${instability.color}`}>{instability.label}</p>
            <p className="text-[10px] text-muted-foreground">{instability.desc}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-0 z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-2xl border border-border/50 bg-background/90 p-1.5 shadow-sm backdrop-blur-xl scrollbar-none">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
              {t.id === 'inbox' && inboxCount > 0 && <span className="bg-primary-foreground/20 text-primary-foreground text-[8px] px-1 rounded-full">{inboxCount}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'offers' && (
        <PartnerOffersPanel profile={profile} offers={proposals} loading={offersLoading} error={offersError} busyOfferId={busyOfferId} focusOfferId={searchParams.get('offer')} onRetry={reloadOffers} onAccept={handleAcceptOffer} onReject={handleRejectOffer} onSearch={() => selectTab('search')} />
      )}

      {activeTab === 'overview' && (
        <PartnerOverview
          partnership={activePartnership}
          profile={profile}
          onEnd={handleEndPartnership}
          onNegotiate={() => setShowNegotiation(true)}
          onConverse={() => setShowConverse(true)}
        />
      )}

      {activeTab === 'search' && (
        <PartnerSearch
          profile={profile}
          relationships={relationships}
          onInvite={handleInvite}
        />
      )}

      {activeTab === 'inbox' && (
        <InboxPanel profile={profile} onAction={handleInboxAction} />
      )}

      {activeTab === 'advisors' && (
        <AdvisorPanel tips={tips} />
      )}

      {activeTab === 'contract' && (
        <ContractPanel
          partnership={activePartnership}
          profile={profile}
          onRenew={handleRenewContract}
          onRelease={handleReleaseContract}
        />
      )}

      {activeTab === 'history' && (
        <PartnerHistory history={history} />
      )}

      {/* Modals */}
      {showNegotiation && activePartnership && (
        <PartnerNegotiationModal
          partnership={activePartnership}
          profile={profile}
          onClose={() => setShowNegotiation(false)}
          onConfirm={handleNegotiate}
        />
      )}

      {showConverse && activePartnership && (
        <ConverseModal
          partnerName={activePartnership.partner_name}
          onClose={() => setShowConverse(false)}
          onSend={handleConverse}
        />
      )}
    </div>
  );
}

function getAvailablePartnersForSearch(profile) {
  return getAvailablePartners(profile);
}

function ContractPanel({ partnership, profile, onRenew, onRelease }) {
  const [durationDays, setDurationDays] = useState(60);
  const [prizeSplit, setPrizeSplit] = useState(partnership?.prize_split_pct ?? 50);
  const [monthlySalary, setMonthlySalary] = useState(partnership?.monthly_salary ?? 100);
  const [confirmRelease, setConfirmRelease] = useState(false);

  useEffect(() => {
    setPrizeSplit(partnership?.prize_split_pct ?? 50);
    setMonthlySalary(partnership?.monthly_salary ?? 100);
  }, [partnership]);

  if (!partnership) {
    return <EmptyStateCard icon={FileText} title="Sem contrato ativo" message="Escolha uma dupla para criar e administrar um contrato." />;
  }

  const careerDate = profile?.career_date || '—';
  const endDate = partnership.contract_end_date || partnership.scheduled_end_date || '—';
  const morale = partnership.partner_morale ?? 70;
  const chemistry = partnership.chemistry ?? profile?.partner_chemistry ?? 50;
  const status = partnership.contract_status || 'ativo';
  const isRenewal = partnership.renewal_available || status === 'vencido';
  const estimatedPenalty = endDate !== '—' && careerDate < endDate
    ? Math.min(Number(profile?.coins) || 0, Math.max(50, Math.round((Number(partnership.monthly_salary) || 100) * 0.5)))
    : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass rounded-2xl p-5 border border-primary/20">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Contrato atual</p>
            <h3 className="font-black text-xl mt-1">{partnership.partner_name}</h3>
            <p className="text-xs text-muted-foreground mt-1">Status: <span className="font-bold text-primary capitalize">{status}</span></p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center"><Handshake className="h-6 w-6 text-primary" /></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ContractMetric icon={CalendarDays} label="Vencimento" value={endDate} />
          <ContractMetric icon={Coins} label="Salário mensal" value={`${partnership.monthly_salary || 0} moedas`} />
          <ContractMetric icon={FileText} label="Sua premiação" value={`${partnership.prize_split_pct ?? 50}%`} />
          <ContractMetric icon={Users} label="Entrosamento" value={`${chemistry}/100`} />
        </div>

        <div className="mt-4 space-y-2">
          <ProgressBar label="Moral do parceiro" value={morale} />
          <ProgressBar label="Entrosamento da dupla" value={chemistry} />
        </div>
      </div>

      {isRenewal && (
        <div className="glass rounded-2xl p-4 border border-amber-500/30 bg-amber-500/5 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <div><p className="font-bold text-sm text-amber-400">Renovação necessária</p><p className="text-xs text-muted-foreground">O contrato venceu. Renove dentro da janela disponível para não perder a dupla.</p></div>
        </div>
      )}

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4"><RefreshCw className="h-5 w-5 text-primary" /><h3 className="font-black">Renovar e renegociar</h3></div>
        <div className="grid md:grid-cols-3 gap-4">
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Duração</span><select value={durationDays} onChange={e=>setDurationDays(Number(e.target.value))} className="w-full glass rounded-xl p-3 text-sm"><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option><option value={120}>120 dias</option><option value={180}>180 dias</option></select></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Sua parte da premiação</span><input type="number" min="35" max="70" value={prizeSplit} onChange={e=>setPrizeSplit(Number(e.target.value))} className="w-full glass rounded-xl p-3 text-sm" /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Salário mensal</span><input type="number" min="0" value={monthlySalary} onChange={e=>setMonthlySalary(Number(e.target.value))} className="w-full glass rounded-xl p-3 text-sm" /></label>
        </div>
        <button onClick={()=>onRenew({durationDays, prizeSplit, monthlySalary})} className="w-full mt-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90">Confirmar novo contrato</button>
      </div>

      <div className="glass rounded-2xl p-5 border border-red-500/20">
        <h3 className="font-black text-sm text-red-400">Rescisão</h3>
        <p className="text-xs text-muted-foreground mt-1">Encerrar antes do vencimento pode gerar multa de até 50% do salário mensal.</p>
        {estimatedPenalty > 0 && <p className="text-xs font-bold text-amber-400 mt-2">Multa estimada: {estimatedPenalty} moedas</p>}
        {!confirmRelease ? <button onClick={()=>setConfirmRelease(true)} className="mt-3 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-xs font-bold">Solicitar rescisão</button> : <div className="flex gap-2 mt-3"><button onClick={()=>setConfirmRelease(false)} className="flex-1 py-2 rounded-xl glass text-xs font-bold">Cancelar</button><button onClick={onRelease} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold">Confirmar rescisão</button></div>}
      </div>
    </div>
  );
}

function ContractMetric({ icon: Icon, label, value }) {
  return <div className="rounded-xl bg-secondary/40 p-3"><Icon className="h-4 w-4 text-primary mb-2"/><p className="text-[9px] uppercase text-muted-foreground font-bold">{label}</p><p className="text-xs font-bold mt-1 break-words">{value}</p></div>;
}

function ProgressBar({ label, value }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return <div><div className="flex justify-between text-[10px] mb-1"><span className="text-muted-foreground">{label}</span><span className="font-bold">{safe}</span></div><div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width:`${safe}%`}} /></div></div>;
}

function PartnerHistory({ history }) {
  if (!history || history.length === 0) {
    return (
      <EmptyStateCard icon={History} title="Sem histórico" message="Suas parcerias anteriores aparecerão aqui." />
    );
  }
  const STATUS_LABELS = {
    encerrada_amigavel: { label: 'Amigável', color: 'text-green-400' },
    encerrada_jogador: { label: 'Você encerrou', color: 'text-amber-400' },
    encerrada_parceiro: { label: 'Parceiro encerrou', color: 'text-red-400' },
    expirada: { label: 'Expirada', color: 'text-muted-foreground' },
  };
  return (
    <div className="space-y-2 animate-stagger">
      {history.map(p => {
        const sl = STATUS_LABELS[p.status] || STATUS_LABELS.expirada;
        return (
          <div key={p.id} className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0">
              <span className="font-black text-muted-foreground">{(p.partner_name || '?')[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{p.partner_name}</p>
              <p className="text-[10px] text-muted-foreground">
                {p.started_career_date} → {p.ended_career_date || '—'} · {p.shared_matches || 0} partidas · {p.shared_wins || 0}V
              </p>
            </div>
            <div className="text-right">
              <span className={`text-[10px] font-bold ${sl.color}`}>{sl.label}</span>
              <p className="text-[9px] text-muted-foreground">Entros. {p.chemistry || 0}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConverseModal({ partnerName, onClose, onSend }) {
  const [text, setText] = useState('');
  const [tone, setTone] = useState('neutro');

  const TEMPLATES = [
    { text: `Ótimo jogo hoje! Estamos jogando bem juntos.`, tone: 'positivo' },
    { text: `Precisamos treinar mais o voleio na próxima semana.`, tone: 'neutro' },
    { text: `Não concordei com aquela jogada no tie-break.`, tone: 'negativo' },
    { text: `Vamos focar no próximo torneio, tenho confiança em nós.`, tone: 'positivo' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div className="glass rounded-t-3xl md:rounded-3xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-base">Conversar com {partnerName}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">×</button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">Escolha um tom ou escreva sua mensagem:</p>

        <div className="flex gap-2 mb-3">
          {['positivo', 'neutro', 'negativo'].map(t => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-colors ${tone === t ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="space-y-1.5 mb-3">
          {TEMPLATES.map((tpl, i) => (
            <button
              key={i}
              onClick={() => { setText(tpl.text); setTone(tpl.tone); }}
              className="w-full glass rounded-xl p-2.5 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              "{tpl.text}"
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Escreva sua mensagem..."
          rows={3}
          className="w-full glass rounded-xl p-3 text-sm outline-none placeholder:text-muted-foreground mb-3 resize-none"
        />

        <button
          onClick={() => text.trim() && onSend(text, tone)}
          disabled={!text.trim()}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
