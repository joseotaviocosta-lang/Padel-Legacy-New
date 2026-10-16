import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Search, Inbox, Lightbulb, History, Handshake, FileText, RefreshCw, AlertTriangle } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { getPlayerRelationships } from '@/lib/relationships';
import {
  getActivePartnership, getPartnershipHistory, startPartnership,
  generateAdvisorTips,
  getPartnerSwitchCount, getInstabilityPenalty, negotiatePrizeSplit, addConversation,
  sendMessage,
} from '@/lib/partnershipSystem';
import { listCareerCommunications } from '@/lib/careerCommunications.js';
import { countUnreadCareerMessages } from '@/lib/notificationSelectors.js';
import { getAvailablePartners } from '@/lib/career';
import { listRetiredPartnerOriginIds, excludeRetiredPartnerTemplates } from '@/lib/partnerAthlete.js';
import { getSuggestedPartnerTerms } from '@/game-core/partnerLifecycle.js';
import { CollapsibleSection, EmptyState, ModalShell, Page, PageContent, PageHeader, PageSkeleton, StatusBadge, Surface, Tabs, Button } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import PartnerOverview, { PartnerAlert } from '@/components/partner/PartnerOverview';
import { buildPartnerContractStatus, selectPartnerAlert, selectPartnerPrimaryAction } from '@/lib/partnerScreen.js';
import PartnerSearch from '@/components/partner/PartnerSearch';
import InboxPanel from '@/components/partner/InboxPanel';
import AdvisorPanel from '@/components/partner/AdvisorPanel';
import PartnerNegotiationModal from '@/components/partner/PartnerNegotiationModal';
import { renewPartnerContract, releasePartner, schedulePartnerSeparation, calculatePartnerRenewalInterest, getContractDecisionState, CONTRACT_DECISION_STATES } from '@/game-core/partnerLifecycle';
import PartnerOffersPanel from '@/components/partner/PartnerOffersPanel';
import { acceptPartnerOffer, ensureInitialPartnerOffers, listPartnerOffers, rejectPartnerOffer } from '@/lib/partnerOffers';
import { findCommittedTournaments, resolveScheduledSeparationDate } from '@/lib/committedRoster.js';
import { useCareerProfileSync } from '@/hooks/useCareerProfileSync.js';

// Playthrough 5.20-B, Partes L/M/N — MINHA DUPLA: 7 ABAS -> 4.
//
// Medido em 360px: as 7 abas não cabiam no viewport. "Propostas", "Buscar
// parceiro" e "Caixa de Entrada" são três faces do MESMO assunto — o mercado de
// duplas — e viram filtros internos de uma aba só. "Assessores" foi auditado
// (Parte N): não são profissionais contratados, é `generateAdvisorTips`,
// conselho sobre a decisão de dupla; por isso não vai para Equipe nem Gestão,
// vira seção da Visão geral, ao lado da dupla que ele comenta.
export const TAB_DEFS = [
  { key: 'overview', label: 'Visão geral', icon: Users },
  { key: 'market', label: 'Mercado', icon: Handshake },
  { key: 'contract', label: 'Contrato', icon: FileText },
  { key: 'history', label: 'Histórico', icon: History },
];

export const MARKET_FILTERS = [
  { key: 'received', label: 'Recebidas', icon: Handshake },
  { key: 'search', label: 'Buscar', icon: Search },
  { key: 'inbox', label: 'Caixa de entrada', icon: Inbox },
];

// Parte O — COMPATIBILIDADE DE DEEP LINK. As notificações da 5.19 já gravadas
// em saves apontam para os nomes de aba ANTIGOS. Este mapa traduz cada um deles
// para a aba nova e, quando o assunto virou filtro, para o filtro certo.
export const LEGACY_VIEW_MAP = {
  offers: { tab: 'market', filter: 'received' },
  search: { tab: 'market', filter: 'search' },
  inbox: { tab: 'market', filter: 'inbox' },
  advisors: { tab: 'overview', filter: null },
  overview: { tab: 'overview', filter: null },
  contract: { tab: 'contract', filter: null },
  history: { tab: 'history', filter: null },
};

// Um `?filter=` explícito tem prioridade, para que um link novo aponte direto.
export const resolveView = (params) => {
  const view = params.get('view');
  const mapped = view ? LEGACY_VIEW_MAP[view] : null;
  const requested = params.get('filter');
  return {
    tab: mapped ? mapped.tab : 'market',
    filter: (MARKET_FILTERS.some((f) => f.key === requested) && requested)
      || (mapped && mapped.filter) || 'received',
    known: Boolean(mapped),
  };
};

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
  const [activeTab, setActiveTab] = useState(() => resolveView(searchParams).tab);
  const [marketFilter, setMarketFilter] = useState(() => resolveView(searchParams).filter);
  const offersTabActive = activeTab === 'offers' || (activeTab === 'market' && marketFilter === 'received');
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [showConverse, setShowConverse] = useState(false);
  // Playthrough 5.19, Parte F — compromissos assumidos pela parceria ATIVA,
  // resolvidos pela mesma autoridade do motor (`findCommittedTournaments`),
  // nunca por uma segunda leitura de inscrições.
  const [commitments, setCommitments] = useState([]);
  const [separationDate, setSeparationDate] = useState(null);
  const proposalsRef = useRef([]);
  const handledContractFocusRef = useRef(null);
  const { toast } = useToast();
  useCareerProfileSync(setProfile);

  const selectTab = useCallback((tab, extra = {}) => {
    const normalizedTab = tab === 'offers' ? 'market' : tab;
    const normalizedFilter = tab === 'offers' ? 'received' : (extra.filter || marketFilter);

    setActiveTab(normalizedTab);
    if (normalizedTab === 'market') setMarketFilter(normalizedFilter);

    const next = new URLSearchParams();
    const routeView = tab === 'offers' ? 'offers' : normalizedTab;
    next.set('view', routeView);
    if (normalizedTab === 'market') next.set('filter', normalizedFilter);
    Object.entries(extra).forEach(([key, value]) => value && next.set(key, value));
    setSearchParams(next, { replace: true });
  }, [setSearchParams, marketFilter]);

  const load = useCallback(async () => {
    if (!profile) return;
    const [active, hist, rels, msgs] = await Promise.all([
      getActivePartnership(profile.id),
      getPartnershipHistory(profile.id),
      getPlayerRelationships(profile.id),
      listCareerCommunications(profile.id, 100, { profile }),
    ]);
    setActivePartnership(active);
    setHistory(hist || []);
    setRelationships(rels || []);
    setInboxCount(countUnreadCareerMessages(msgs || []));

    // Playthrough 5.19, Parte F — compromissos da parceria ativa, para que a
    // consequência real do encerramento apareça ANTES da decisão.
    if (active?.id) {
      const [registrations, tournaments] = await Promise.all([
        localGame.entities.TournamentRegistration.filter({ profile_id: profile.id }, '-registered_at', 200).catch(() => []),
        localGame.entities.Tournament.list('start_date', 500).catch(() => []),
      ]);
      const committed = findCommittedTournaments({
        registrations, tournaments,
        careerDate: profile.career_date,
        partnerId: active.partner_bot_id || active.partner_id || null,
      });
      setCommitments(committed);
      const scheduled = resolveScheduledSeparationDate(
        active.contract_end_date || active.scheduled_end_date || null,
        committed,
      );
      setSeparationDate(scheduled?.extended ? scheduled.date : null);
    } else {
      setCommitments([]);
      setSeparationDate(null);
    }

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

  useEffect(() => {
    const resolved = resolveView(searchParams);
    if (resolved.known) { setActiveTab(resolved.tab); setMarketFilter(resolved.filter); }

    const focus = searchParams.get('focus');
    const focusKey = focus === 'contract-future'
      ? `${focus}:${searchParams.get('partnership') || activePartnership?.id || ''}`
      : null;
    // Playthrough 5.19, Partes D/E/G — o aviso de contrato abria a CONVERSA.
    //
    // O deep link já trazia `view=contract&focus=contract-future` e a aba de
    // contrato já existia com renovação/encerramento (ContractPanel). O defeito
    // era a linha seguinte, `setShowConverse(true)`: ela abria o diálogo de
    // conversa por cima da decisão contratual, e esse diálogo é o de pós-jogo
    // ("Ótimo jogo hoje!", "Precisamos treinar mais o voleio") — nada a ver com
    // a intenção da notificação.
    //
    // Agora o aviso leva à decisão contratual e nada mais. "Conversar com o
    // parceiro" continua existindo, acionado pelo jogador na própria aba
    // (Parte G) — só deixou de ser interceptado por um alerta de contrato.
    if (focusKey && activePartnership && handledContractFocusRef.current !== focusKey) {
      handledContractFocusRef.current = focusKey;
      setActiveTab('contract');
    }
  }, [activePartnership, searchParams]);

  // PartnerOffer is the source of truth; inbox messages only reference offers.
  useEffect(() => {
    if (!profile || !relationships) return;
    (async () => {
      setOffersLoading(true); setOffersError(null);
      try {
        const available = await getAvailablePartnersForSearch(profile);
        const rows = activePartnership ? await listPartnerOffers(profile.id) : await ensureInitialPartnerOffers(profile, available);
        proposalsRef.current = rows; setProposals(rows);
        await load();
        if (activePartnership && !searchParams.get('view')) selectTab('overview');
      } catch (error) { console.error('partner offers', error); setOffersError(error); }
      finally { setOffersLoading(false); }
    })();
  }, [profile?.id, activePartnership?.id]);

  if (loading) return <PageSkeleton variant="stats" rows={4} />;

  if (!profile) {
    return (
      <Page>
        <PageContent>
          <EmptyState icon={Users} title="Perfil não encontrado" description="Não foi possível carregar seu perfil." />
        </PageContent>
      </Page>
    );
  }

  const switchCount = history.filter(p => p.status === 'encerrada_jogador').length;
  const instability = getInstabilityPenalty(switchCount);

  async function handleInvite(bot) {
    try {
      // Fase 5.1, item 2 — antes, termos fixos (60 dias/50%) pra
      // qualquer convite direto, ignorando o gap de nível entre jogador e
      // candidato (um dos 3 caminhos de contratação hoje inconsistentes,
      // achado da Fase 5). Mesma função já usada no onboarding e nas
      // ofertas do PartnerHub (partnerOfferRules.js) — só falta este
      // caminho pra unificar os três.
      const terms = getSuggestedPartnerTerms(profile, bot);
      const { partnership, profile: updated } = await startPartnership(profile, bot, terms.durationDays, terms.prizeSplit);
      setActivePartnership(partnership);
      setProfile(updated);
      toast({ title: 'Parceria formada!', description: `${bot.name} é sua nova dupla por ${terms.durationDays} dias.` });
      await load();
    } catch {
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
      const result = await releasePartner(profile, 'Decisão do jogador');
      setProfile(result.profile || profile);
      setActivePartnership(null);
      toast({ title: 'Parceria encerrada', description: result.penalty > 0 ? `Multa de ${result.penalty} moedas aplicada.` : 'Você está sem dupla agora.' });
      await load();
    } catch {
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
    } catch {
      toast({ title: 'Erro', description: 'Falha na negociação.', variant: 'destructive' });
    }
  }

  async function handleRenewContract(terms) {
    try {
      const result = await renewPartnerContract(profile, terms);
      setProfile(result.profile || profile);
      setActivePartnership(result.partnership);
      if (result.decision?.outcome === 'refused') {
        toast({ title: 'Renovação recusada', description: 'Seu parceiro decidiu encerrar a dupla ao fim do contrato.', variant: 'destructive' });
      } else if (result.decision?.outcome === 'wait') {
        toast({ title: 'Decisão adiada', description: 'Seu parceiro quer conversar novamente mais perto do vencimento.' });
      } else if (result.decision?.outcome === 'conditional') {
        toast({ title: 'Renovação aceita com condições', description: `A dupla segue unida até ${result.partnership.contract_end_date}.` });
      } else {
        toast({ title: 'Contrato renovado!', description: `A dupla segue unida até ${result.partnership.contract_end_date}.` });
      }
      await load();
    } catch (e) {
      toast({ title: 'Erro na renovação', description: e?.message || 'Não foi possível renovar o contrato.', variant: 'destructive' });
    }
  }

  async function handleScheduleSeparation() {
    try {
      const result = await schedulePartnerSeparation(profile);
      setActivePartnership(result.partnership);
      toast({ title: 'Fim de ciclo combinado', description: 'A dupla seguirá ativa até o vencimento atual.' });
      await load();
    } catch (e) {
      toast({ title: 'Erro', description: e?.message || 'Não foi possível agendar o encerramento.', variant: 'destructive' });
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
    // Playthrough 5.17 (continuação), Parte D — a data da CARREIRA é o que
    // governa cooldown e retorno decrescente. Antes, a conversa gravava a
    // data real do sistema, inútil como regra de jogo.
    const updated = await addConversation(
      activePartnership.id, profile.sport_name || 'Você', text, tone, profile.career_date,
    );
    if (updated) setActivePartnership(updated);
    setShowConverse(false);
    if (updated?.conversation_blocked) {
      // Feedback visível do limite (Parte D): o jogador precisa saber por que
      // a conversa não teve efeito, em vez de achar que o sistema é mudo.
      toast({
        title: 'Vocês já conversaram hoje',
        description: 'Outra conversa agora não teria efeito. Tente novamente amanhã.',
      });
      await load();
      return;
    }
    const damped = Number(updated?.conversations?.slice(-1)[0]?.diminishing_factor ?? 1) < 1;
    const description = tone === 'positivo' || tone === 'apoio'
      ? `A confiança e a moral da dupla melhoraram.${damped ? ' O efeito foi menor por conversas recentes.' : ''}`
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
    } else if (action.type === 'view_partnership') {
      selectTab('contract', {
        focus: 'contract-future',
        partnership: action.payload?.partnershipId || activePartnership?.id,
      });
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

  const offerCount = proposals.filter((offer) => offer.status === 'pending' && offer.offer_type !== 'partner_poaching').length;
  // Fase 5.31 — estado do contrato, alerta único e ação principal: só
  // apresentação, a partir de getContractDecisionState e dos campos que o
  // lifecycle grava (src/lib/partnerScreen.js).
  const contractStatus = buildPartnerContractStatus({
    partnership: activePartnership,
    careerDate: profile.career_date,
    decisionState: activePartnership ? getContractDecisionState(activePartnership) : null,
    commitments,
    separationDate,
  });
  const partnerAlert = selectPartnerAlert({
    contract: contractStatus,
    partnerName: activePartnership?.partner_name,
    commitments,
    switchCount,
    instability,
    conflicts: activePartnership?.conflicts || [],
  });
  const primaryAction = selectPartnerPrimaryAction({ contract: contractStatus, pendingOffers: offerCount });

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
      <PageHeader
        dense
        icon={Handshake}
        eyebrow="Dupla e relações"
        title={activePartnership ? `Você e ${activePartnership.partner_name}` : 'Construa sua próxima dupla'}
        description={activePartnership ? null : 'Compare propostas por lado, estilo e compatibilidade.'}
        tone="brand"
        breadcrumb={['Carreira', 'Dupla e relações']}
        action={inboxCount > 0 ? <StatusBadge tone="info" icon={Inbox}>{inboxCount} não lida(s)</StatusBadge> : null}
      />

      {/* Tabs */}
      <Tabs
        tabs={TAB_DEFS.map((t) => ({ ...t, count: t.key === 'market' ? (inboxCount + offerCount) || undefined : undefined }))}
        activeTab={activeTab}
        onTabChange={selectTab}
        variant="buttons"
      />

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <PartnerOverview
            partnership={activePartnership}
            profile={profile}
            contract={contractStatus}
            alert={partnerAlert}
            primaryAction={primaryAction}
            onPrimary={(target) => selectTab(target.tab, target.filter ? { filter: target.filter } : {})}
            onSearch={() => selectTab('market', { filter: 'search' })}
            onEnd={handleEndPartnership}
            onNegotiate={() => setShowNegotiation(true)}
            onConverse={() => setShowConverse(true)}
          />
          {/* Parte N — o conselho fica ao lado da dupla que ele comenta, em vez
              de exigir uma aba própria. 5.31: sob demanda (recolhido). */}
          <CollapsibleSection icon={Lightbulb} title="Conselhos dos assessores" description="Orientativos — a decisão final é sua" badge={tips.length ? <StatusBadge tone="info">{tips.length}</StatusBadge> : null}>
            <AdvisorPanel tips={tips} />
          </CollapsibleSection>
        </div>
      )}

      {activeTab === 'market' && (
        <div className="space-y-3">
          <Tabs
            tabs={MARKET_FILTERS.map((f) => ({
              ...f,
              count: f.key === 'inbox' ? inboxCount || undefined
                : f.key === 'received' ? offerCount || undefined
                : undefined,
            }))}
            activeTab={marketFilter}
            onTabChange={(key) => selectTab('market', { filter: key })}
            variant="segmented"
          />
          {offersTabActive && (
            <PartnerOffersPanel profile={profile} offers={proposals} loading={offersLoading} error={offersError} busyOfferId={busyOfferId} focusOfferId={searchParams.get('offer')} onRetry={reloadOffers} onAccept={handleAcceptOffer} onReject={handleRejectOffer} onSearch={() => selectTab('market', { filter: 'search' })} currentPartnership={activePartnership} />
          )}
          {marketFilter === 'search' && (
            <PartnerSearch
              profile={profile}
              relationships={relationships}
              onInvite={handleInvite}
            />
          )}
          {marketFilter === 'inbox' && (
            <InboxPanel profile={profile} onAction={handleInboxAction} />
          )}
        </div>
      )}

      {activeTab === 'contract' && (
        <ContractPanel
          partnership={activePartnership}
          profile={profile}
          onRenew={handleRenewContract}
          onRelease={handleReleaseContract}
          onScheduleSeparation={handleScheduleSeparation}
          commitments={commitments}
          separationDate={separationDate}
          contractStatus={contractStatus}
          alert={partnerAlert}
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
      </PageContent>
    </Page>
  );
}

// 5.26-C, Bloco D — o catálogo não sabe quem já se aposentou.
async function getAvailablePartnersForSearch(profile) {
  return excludeRetiredPartnerTemplates(getAvailablePartners(profile), await listRetiredPartnerOriginIds());
}

// Fase 5.31 — CONTRATO. Antes: cabeçalho + 2 avisos + 3 métricas em caixa +
// 2 barras + aviso de renovação + compromissos + interesse + formulário +
// rescisão, tudo aberto (1.700px no celular). Agora: um resumo (situação +
// "N dias restantes · até DD/MM/AAAA" numa linha só), no máximo 1 alerta
// (com os compromissos dentro quando existem), a renovação como única ação
// primária e o encerramento recolhido. Regras e chamadas inalteradas.
function ContractPanel({ partnership, profile, onRenew, onRelease, onScheduleSeparation, commitments = [], separationDate = null, contractStatus = null, alert = null }) {
  const [durationDays, setDurationDays] = useState(60);
  const [prizeSplit, setPrizeSplit] = useState(partnership?.prize_split_pct ?? 50);
  const [confirmRelease, setConfirmRelease] = useState(false);

  useEffect(() => {
    setPrizeSplit(partnership?.prize_split_pct ?? 50);
  }, [partnership]);

  if (!partnership) {
    return <EmptyState icon={FileText} title="Sem contrato ativo" description="Escolha uma dupla para criar e administrar um contrato." />;
  }

  const careerDate = profile?.career_date || '—';
  const endDate = partnership.contract_end_date || partnership.scheduled_end_date || '—';
  const morale = partnership.partner_morale ?? 70;
  const chemistry = partnership.chemistry ?? profile?.partner_chemistry ?? 50;
  const status = partnership.contract_status || 'ativo';
  const decisionState = getContractDecisionState(partnership);
  const isRenewal = partnership.renewal_available || status === 'vencido';
  const renewalBlocked = decisionState === CONTRACT_DECISION_STATES.ENDING_AT_EXPIRY || decisionState === CONTRACT_DECISION_STATES.ENDING_AFTER_COMMITMENTS || decisionState === CONTRACT_DECISION_STATES.ENDED;
  const estimatedPenalty = endDate !== '—' && careerDate < endDate
    ? Math.min(Number(profile?.coins) || 0, Math.max(50, Math.round((Number(partnership.monthly_salary) || 100) * 0.5)))
    : 0;
  const summary = contractStatus || { label: status.replace(/_/g, ' '), tone: 'neutral', line: endDate };
  // O alerta único. Sem alerta de contrato, os compromissos viram o aviso: a
  // consequência real do encerramento precisa aparecer antes da decisão.
  const contractAlert = alert && ['separation-pending', 'renewal-needed', 'renewal-refused', 'ending', 'expiring'].includes(alert.id)
    ? alert
    : isRenewal
      ? { id: 'renewal-needed', tone: 'danger', title: 'Renovação necessária', text: 'O contrato venceu. Renove dentro da janela disponível para não perder a dupla.' }
      : commitments.length
        ? { id: 'commitments', tone: 'warning', title: 'Compromissos já assumidos', text: 'Encerrar o contrato não cancela torneio já inscrito.' }
        : null;
  // Fase 15 (Parte 6/7/8): interesse em renovar — só o nível e os fatores
  // textuais, nunca a fórmula.
  const interest = calculatePartnerRenewalInterest(partnership, profile, { betterOpportunity: partnership.partner_market_offer || null });
  const interestTone = interest.level === 'alto' ? 'success' : interest.level === 'baixo' ? 'danger' : 'warning';

  return (
    <div className="space-y-3 animate-fade-in" data-partner-contract>
      <Surface padding="compact">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Contrato com</p>
            <h3 className="truncate text-lg font-black">{partnership.partner_name}</h3>
          </div>
          <StatusBadge tone={summary.tone} className="shrink-0">{summary.label}</StatusBadge>
        </div>
        <p className="mt-1 text-sm font-bold" data-contract-line>{summary.line}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>Sua premiação <strong className="text-foreground">{partnership.prize_split_pct ?? 50}%</strong></span>
          <span>Entrosamento <strong className="text-foreground">{chemistry}</strong></span>
          <span>Moral do parceiro <strong className="text-foreground">{morale}</strong></span>
        </p>
      </Surface>

      {/* Playthrough 5.19, Parte F — COMPROMISSOS JÁ ASSUMIDOS, pela MESMA
          autoridade do motor (`findCommittedTournaments`), dentro do alerta. */}
      <PartnerAlert alert={contractAlert}>
        {commitments.length ? (
          <div className="mt-2 space-y-1">
            <ul className="space-y-0.5">
              {commitments.map((item) => (
                <li key={item.tournamentId} className="text-muted-foreground"><span className="font-bold text-foreground">{item.name}</span>{item.startDate ? ` · ${item.startDate}` : ''}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Se optar pelo encerramento, a parceria esportiva com {partnership.partner_name} será
              mantida até a conclusão {commitments.length === 1 ? 'desse compromisso' : 'desses compromissos'}
              {separationDate ? ` (até ${separationDate})` : ''}.
            </p>
          </div>
        ) : null}
      </PartnerAlert>

      <Surface padding="compact" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-black"><RefreshCw className="h-4 w-4 shrink-0 text-primary" /> Renovar e renegociar</h3>
          <StatusBadge tone={interestTone} className="shrink-0">Interesse {interest.level}</StatusBadge>
        </div>
        {interest.factors.length > 0 && <p className="text-[11px] text-muted-foreground">{interest.factors.slice(0, 2).join(' · ')}</p>}
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 space-y-1"><span className="text-[11px] text-muted-foreground">Duração</span><select value={durationDays} onChange={e=>setDurationDays(Number(e.target.value))} className="w-full glass rounded-xl p-2.5 text-sm"><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option><option value={120}>120 dias</option><option value={180}>180 dias</option></select></label>
          <label className="min-w-0 space-y-1"><span className="text-[11px] text-muted-foreground">Sua parte (%)</span><input type="number" min="35" max="70" value={prizeSplit} onChange={e=>setPrizeSplit(Number(e.target.value))} className="w-full glass rounded-xl p-2.5 text-sm" /></label>
        </div>
        <Button level="primary" size="touch" onClick={()=>onRenew({durationDays, prizeSplit})} disabled={renewalBlocked} className="w-full disabled:opacity-50 disabled:cursor-not-allowed">
          {renewalBlocked ? 'Contrato em encerramento' : 'Confirmar novo contrato'}
        </Button>
      </Surface>

      <CollapsibleSection icon={AlertTriangle} title="Encerrar parceria" description="Fim de ciclo combinado ou rescisão antecipada">
        <p className="text-xs text-muted-foreground">Encerrar antes do vencimento pode gerar multa de até 50% do valor do vínculo.</p>
        <Button level="secondary" onClick={onScheduleSeparation} className="w-full">Encerrar ao final do contrato</Button>
        {estimatedPenalty > 0 && <p className="text-xs font-bold text-amber-400">Multa estimada: {estimatedPenalty} moedas</p>}
        {!confirmRelease ? <Button level="ghost" onClick={()=>setConfirmRelease(true)} className="w-full border border-red-500/30 text-red-400">Solicitar rescisão</Button> : <div className="flex gap-2"><Button level="secondary" onClick={()=>setConfirmRelease(false)} className="flex-1">Cancelar</Button><Button level="danger" onClick={onRelease} className="flex-1">Confirmar rescisão</Button></div>}
      </CollapsibleSection>
    </div>
  );
}

function PartnerHistory({ history }) {
  if (!history || history.length === 0) {
    return (
      <EmptyState icon={History} title="Sem histórico" description="Suas parcerias anteriores aparecerão aqui." />
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
          <Surface key={p.id} padding="compact" className="flex items-center gap-3">
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
          </Surface>
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
    <ModalShell
      open
      onClose={onClose}
      title={`Conversar com ${partnerName}`}
      size="sm"
      footer={<Button level="primary" onClick={() => text.trim() && onSend(text, tone)} disabled={!text.trim()} className="w-full">Enviar</Button>}
    >
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
        className="w-full glass rounded-xl p-3 text-sm outline-none placeholder:text-muted-foreground resize-none"
      />
    </ModalShell>
  );
}
