import React, { Fragment, useEffect, useRef, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { Crown, Flame, Coins, Zap, Star, Calendar, Trophy, Award, Play, CheckCircle, Lock, Newspaper, BarChart3, TrendingUp, AlertCircle, Shield, ChevronDown, ChevronUp, Clock3 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ensureMyProfile, formatDate } from '@/lib/padel';
import { careerMonth, daysBetween, ensureFutureTournaments } from '@/lib/career';
import { simulatePastTournaments } from '@/lib/teamRanking';
import CareerStatusBar from '@/components/career/CareerStatusBar';
import PartnerSelection from '@/components/career/PartnerSelection';
import TournamentModal from '@/components/tournaments/TournamentModal';
import TournamentDetailsModal from '@/components/tournaments/TournamentDetailsModal';
import TournamentRegistrationModal from '@/components/calendar/TournamentRegistrationModal';
import TournamentStats from '@/components/tournaments/TournamentStats';
import CircuitEvolution from '@/components/tournaments/CircuitEvolution';
import TournamentNews from '@/components/tournaments/TournamentNews';
import TournamentBracket from '@/components/tournaments/TournamentBracket';
import { Page, PageContent, PageSkeleton, StatusBadge, EmptyState, Surface, Tabs, Button, ConfirmDialog, TooltipHint, Select } from '@/components/design-system';
import { enrichTournament, orderTournamentsForView } from '@/lib/tournaments';
import { getTeamRank } from '@/lib/teamRanking';
import { getPartnerBot } from '@/lib/career';
import { isRegistrationOpen } from '@/lib/calendarSystem';
import { selectNextOpenTournament } from '@/lib/nextEventAuthority.js';
import { evaluateTournamentChoice } from '@/gameplay/worldTour/TournamentSelectionAI.js';
import { buildCoachAnalysisRows, RANK_ONLY_PROJECTION_NOTE } from '@/lib/tournamentProjectionDisplay.js';
import { buildAthleteEntryContext, evaluateTournamentEntry, getEntryPathLabel } from '@/gameplay/worldTour/EntryManager.js';
import { validateTournamentIntegrity } from '@/lib/tournamentIntegrity.js';
import { cancelTournamentRegistration, isPlayerRegisteredForTournament, isTournamentParticipationConfirmed, listTournamentRegistrations, wasTournamentUnreachableAtCareerStart } from '@/lib/tournamentRegistration.js';
import { useCareer } from '@/careers/useCareer.js';
import { useActiveMatchCheckpoint } from '@/hooks/useActiveMatchCheckpoint.js';
import { resolveTournamentOpenMode, TOURNAMENT_DEEP_LINK_MODES } from '@/lib/tournamentDeepLink.js';
import { isTournamentCancelled, getTournamentCancellationLabel, getTournamentDrawState, TOURNAMENT_DRAW_STATES, hasViewableTournamentBracket } from '@/lib/tournamentBracketView.js';
import { getPlayerTournamentRegistrationState, canPlayerRegisterNow, buildRegistrationCardNotice } from '@/lib/tournamentRegistrationState.js';
import { resolveTournamentCardState, getTournamentCardPresentation, TOURNAMENT_CARD_STATE } from '@/lib/tournamentCardState.js';
import { getTournamentRegistrationWindow, daysBetweenGameDates } from '@/lib/tournamentRegistration.js';

// Fase 3 — escada de 9 tiers (era 6). Bronze/Circuit Finals/Legacy Finals
// adicionados com estilo próprio; sem eles, TIER_CONFIG[tier] caía no
// fallback `|| TIER_CONFIG.Silver` (linhas abaixo) — não quebrava a tela,
// mas rotulava/estilizava um torneio Bronze ou uma final de mérito como
// "Legacy Silver", incorretamente.
const TIER_CONFIG = {
  'Legacy Finals':{label:'Legacy Finals',badge:'bg-rose-500/15 text-rose-300 border-rose-500/40',card:'border-rose-500/25 hover:border-rose-500/50',glow:'shadow-[0_0_24px_rgba(244,63,94,0.14)]',icon:Trophy,diffLabel:'Convite · Top 16 duplas',diffColor:'text-red-400'},
  Crown:{label:'Legacy Crown',badge:'bg-amber-500/15 text-amber-300 border-amber-500/40',card:'border-amber-500/25 hover:border-amber-500/50',glow:'shadow-[0_0_24px_rgba(245,158,11,0.12)]',icon:Crown,diffLabel:'Lendário',diffColor:'text-red-400'},
  Elite:{label:'Legacy Elite',badge:'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',card:'border-fuchsia-500/20 hover:border-fuchsia-500/40',glow:'',icon:Flame,diffLabel:'Muito Difícil',diffColor:'text-red-400'},
  Masters:{label:'Legacy Masters',badge:'bg-purple-500/15 text-purple-300 border-purple-500/30',card:'border-purple-500/20 hover:border-purple-500/40',glow:'',icon:Trophy,diffLabel:'Difícil',diffColor:'text-orange-400'},
  'Circuit Finals':{label:'Circuit Finals',badge:'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',card:'border-indigo-500/25 hover:border-indigo-500/50',glow:'',icon:Star,diffLabel:'Convite · Top 8',diffColor:'text-orange-400'},
  Platinum:{label:'Legacy Platinum',badge:'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',card:'border-cyan-500/20 hover:border-cyan-500/40',glow:'',icon:Star,diffLabel:'Competitivo',diffColor:'text-yellow-400'},
  Gold:{label:'Legacy Gold',badge:'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',card:'border-yellow-500/20 hover:border-yellow-500/40',glow:'',icon:Award,diffLabel:'Acessível',diffColor:'text-emerald-400'},
  Silver:{label:'Legacy Silver',badge:'bg-slate-500/15 text-slate-300 border-slate-500/30',card:'border-slate-500/20 hover:border-slate-500/40',glow:'',icon:Shield,diffLabel:'Entrada Mundial',diffColor:'text-slate-300'},
  Bronze:{label:'Legacy Bronze',badge:'bg-orange-800/15 text-orange-300 border-orange-800/30',card:'border-orange-800/20 hover:border-orange-800/40',glow:'',icon:Shield,diffLabel:'Iniciante',diffColor:'text-slate-400'},
  // Fase 3, item 3C.2: evento de Exibição/Pré-Temporada — fora da escada
  // competitiva (sem pontos de ranking), estilo próprio pra não ser
  // confundido com um tier real na listagem.
  Exibição:{label:'Pré-Temporada',badge:'bg-teal-500/15 text-teal-300 border-teal-500/30',card:'border-teal-500/20 hover:border-teal-500/40',glow:'',icon:Zap,diffLabel:'Amistoso · sem ranking',diffColor:'text-teal-300'},
};

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Dois meses abertos: o mes corrente e o seguinte, que e o horizonte em que o
// jogador de fato decide inscricao (prazo fecha em D-4).
const MONTHS_OPEN_BY_DEFAULT = 2;

const FILTERS = [
  {id:'all',label:'Todos'}, {id:'Legacy Finals',label:'Legacy Finals'}, {id:'Crown',label:'Crown'}, {id:'Elite',label:'Elite'},
  {id:'Masters',label:'Masters'}, {id:'Circuit Finals',label:'Circuit Finals'}, {id:'Platinum',label:'Platinum'},
  {id:'Gold',label:'Gold'}, {id:'Silver',label:'Silver'}, {id:'Bronze',label:'Bronze'}, {id:'Exibição',label:'Pré-Temporada'},
];

function prepareTournamentList(items) {
  const enriched = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    // Grupo A — eventos cuja inscrição já tinha fechado antes de a carreira
    // começar nunca estiveram ao alcance do jogador; sem este filtro eles
    // apareciam em "Torneios Passados" como ENCERRADOS já no dia 1 (6 eventos
    // em 2026-01-01, medidos). Continuam existindo no mundo e nos totais do
    // Circuito — só saem do arquivo pessoal do jogador.
    .filter((item) => !wasTournamentUnreachableAtCareerStart(item))
    .map(enrichTournament);
  const errors = validateTournamentIntegrity(enriched);
  const identityErrors = errors.filter(error => error.type === 'missing-id' || error.type === 'duplicate-id');
  if (identityErrors.length > 0) {
    throw new Error(`Integridade dos torneios inválida: ${identityErrors.map(error => error.id || error.type).join(', ')}`);
  }
  if (import.meta.env.DEV && errors.length > 0) console.warn('[Tournaments] inconsistências não fatais', errors);
  return enriched;
}

export default function Tournaments() {
  const { activeCareer } = useCareer();
  const { checkpoint: activeMatchCheckpoint } = useActiveMatchCheckpoint(activeCareer?.career_id);
  const [searchParams, setSearchParams] = useSearchParams();
  const openedTournamentRef = useRef(null);
  const [tournaments, setTournaments] = useState([]);
  const [season, setSeason] = useState(null);
  const [profile, setProfile] = useState(null);
  const [playedTournaments, setPlayedTournaments] = useState(new Set());
  const [filter, setFilter] = useState('all');
  // Playthrough 5.20-B, Partes P/S — A TEMPORADA INTEIRA DE UMA VEZ.
  //
  // Medido em 360px: 151 torneios renderizados juntos, 333 cartoes no DOM e uma
  // pagina de 54.779px — 68 telas. Nos tres primeiros ecrãs apareciam 19
  // cartoes; todo o resto era peso que o jogador rolava sem querer.
  //
  // A pagina passa a se comportar como agenda: os dois primeiros meses abrem,
  // os seguintes ficam como cabecalho com a contagem e abrem ao toque. Nada e
  // removido — so deixa de ser renderizado antes de ser pedido.
  const [expandedMonths, setExpandedMonths] = useState(() => new Set());
  const [view, setView] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [showPartner, setShowPartner] = useState(false);
  const [activeTournament, setActiveTournament] = useState(null);
  const [detailsTournament, setDetailsTournament] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [matches, setMatches] = useState([]);
  const [bracketTournament, setBracketTournament] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [registeredTournaments, setRegisteredTournaments] = useState(new Set());
  const [registrationRecords, setRegistrationRecords] = useState(new Map());
  const [registrationTournament, setRegistrationTournament] = useState(null);
  const [teamRank, setTeamRank] = useState(0);
  const [activeRunEvents, setActiveRunEvents] = useState(new Map());

  // Inscrições e campanhas sorteadas do jogador. Playthrough 5.27-K: o mapa
  // de registros guarda a inscrição de QUALQUER status (a de um torneio já
  // disputado vira `completed` na liquidação e o card caía em "Não
  // participante"); `registeredTournaments` continua só com as confirmadas.
  async function refreshCampaignState(profileId) {
    const registrations = await listTournamentRegistrations(profileId);
    const confirmed = (registrations || []).filter(item => item.status === 'confirmed');
    setRegisteredTournaments(new Set(confirmed.map(item => item.tournament_id)));
    setRegistrationRecords(new Map((registrations || []).filter(item => item.status !== 'cancelled').map(item => [item.tournament_id, item])));
    const runEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profileId, status: 'scheduled', event_type: 'tournament' }).catch(() => []);
    setActiveRunEvents(new Map((runEvents || []).filter((event) => event.metadata?.tournament_run).map((event) => [event.related_id, event])));
  }

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);

        // Simulate champions for past tournaments the player didn't play
        // and ensure the calendar extends into the future
        if (p?.career_date) {
          await simulatePastTournaments(p.career_date);
          await ensureFutureTournaments(p.career_date);
        }

        // Fetch all tournaments — the calendar spans multiple seasons now.
        // Hotfix — 200 com ordenação DESCENDENTE ia truncando o passado à
        // medida que `ensureFutureTournaments` criava eventos futuros: depois
        // de ~9 meses de carreira o torneio mais antigo visível já era de
        // setembro (medido), e um torneio disputado/perdido antes disso sumia
        // de "Passados". 2000 cobre ~12 temporadas (162 eventos/ano).
        const list = await localGame.entities.Tournament.list('-start_date', 2000);
        setTournaments(prepareTournamentList(list));

        // Determine the current season based on career year
        const seasons = await localGame.entities.Season.list('-start_date', 50);
        const careerYear = p?.career_date ? new Date(p.career_date + 'T00:00:00').getFullYear() : 2026;
        const currentSeason = seasons?.find(s => s.season_number === careerYear)
          || seasons?.find(s => s.is_active)
          || seasons?.[0];
        setSeason(currentSeason);

        // Track played tournaments
        const matches = await localGame.entities.Match.list('-created_date', 100);
        const played = new Set(
          (matches || [])
            .filter(m => m.tournament_name && m.tournament_name !== 'Partida Oficial' && m.team_a?.[0] === p?.sport_name)
            .map(m => m.tournament_name)
        );
        setPlayedTournaments(played);
        setMatches(matches || []);

        // Track confirmed registrations from the canonical registration entity.
        if (p?.id) {
          await refreshCampaignState(p.id);

          // Compute team rank if player has a partner
          if (p.partner_id) {
            const partner = getPartnerBot(p);
            if (partner) {
              const { rank } = await getTeamRank(p, partner);
              setTeamRank(rank);
            }
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // Hotfix crítico (docs/TOURNAMENT_ROUND_STATE_HOTFIX.md, item 1/9): o
  // avanço de dia pelo cabeçalho global não recarregava o `profile` local
  // desta página — o careerDate usado por isTournamentPlayable() e por
  // TournamentModal (via prop) ficava desatualizado sempre que o jogador
  // avançava sem sair de /tournaments. Mesmo padrão de AppLayout.jsx
  // (useCareerHeaderData): usa o perfil já incluído no evento, sem round-trip.
  useEffect(() => {
    const refreshProfileOnly = (event) => {
      if (event?.detail?.profile) setProfile(event.detail.profile);
    };
    window.addEventListener('padel:profile-updated', refreshProfileOnly);
    window.addEventListener('padel:career-advanced', refreshProfileOnly);
    return () => {
      window.removeEventListener('padel:profile-updated', refreshProfileOnly);
      window.removeEventListener('padel:career-advanced', refreshProfileOnly);
    };
  }, []);

  // Playthrough 5.27-K (achado no smoke Android): o hotfix acima atualiza só o
  // perfil. Avançando dias SEM sair de /tournaments, a lista de torneios e as
  // campanhas sorteadas (activeRunEvents) ficavam da data em que a página
  // abriu: no dia do torneio, "Ir para o torneio" abria os detalhes antigos
  // ("Aguardando sorteio") em vez da campanha, como se o jogo travasse.
  // Recarrega esse estado sempre que a data da carreira muda.
  const lastLoadedDateRef = useRef(null);
  useEffect(() => {
    const date = profile?.career_date;
    if (!profile?.id || !date || loading) return undefined;
    if (lastLoadedDateRef.current === null) { lastLoadedDateRef.current = date; return undefined; }
    if (lastLoadedDateRef.current === date) return undefined;
    lastLoadedDateRef.current = date;
    let cancelled = false;
    (async () => {
      try {
        const list = await localGame.entities.Tournament.list('-start_date', 2000);
        if (cancelled) return;
        setTournaments(prepareTournamentList(list));
        await refreshCampaignState(profile.id);
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.career_date, loading]);

  useEffect(() => {
    const requestedId = searchParams.get('tournament');
    const requestedMode = searchParams.get('mode') || TOURNAMENT_DEEP_LINK_MODES.DETAILS;
    // Playthrough 4.6E, Parte G — a notificação de sorteio não tem sessão
    // ativa pra oferecer no D-3 (mode:'run' cairia sempre em DETAILS via
    // resolveTournamentOpenMode), então precisa de um sinal explícito e
    // independente do modo pra abrir a CHAVE direto, não só os detalhes.
    const requestedOpenBracket = searchParams.get('openBracket') === 'true';
    // Playthrough 4.9, Parte J — CTA "Inscrever" do planejamento semanal
    // (CareerHub.jsx) e das comunicações de lembrete abre o MODAL DE
    // INSCRIÇÃO direto, sem nenhuma lógica de registro paralela: reaproveita
    // o mesmo TournamentRegistrationModal/registerTournament() que o botão
    // "Inscrever" do próprio card já usa.
    const requestedOpenRegistration = searchParams.get('openRegistration') === 'true';
    const requestKey = requestedId ? `${requestedId}:${requestedMode}:${requestedOpenBracket ? 'bracket' : ''}:${requestedOpenRegistration ? 'register' : ''}` : null;
    if (!requestedId || loading || openedTournamentRef.current === requestKey) return;
    const requested = tournaments.find((tournament) => String(tournament.id) === requestedId);
    // Playthrough 5.9, BUG 3 — o deep link era marcado como "já tratado"
    // ANTES de confirmar que o torneio foi encontrado. Numa passada em que
    // `tournaments` ainda não continha o evento (lista recém-populada,
    // chegada direta pela notificação), o efeito retornava sem abrir nada e
    // a chave de controle já estava gravada: quando a lista finalmente
    // populava, o `openedTournamentRef.current === requestKey` barrava a
    // reexecução e a chave NUNCA abria — exatamente o sintoma do playtest
    // ("clicou na notificação de sorteio e a chave não apareceu; entrando
    // por Torneios manualmente, ela estava lá"). O consumo do deep link só
    // pode ser registrado depois de haver de fato o que abrir.
    if (!requested) return;
    openedTournamentRef.current = requestKey;

    // Playthrough 5.13, Partes H/J/L — bug real do playtest: a mensagem
    // "Sorteio definido" chegava e o modal abria em "Chave ainda não
    // sorteada". A autoridade NÃO estava errada: um teste
    // (test-draw-notification-bracket-atomicity-v513) mostrou que, no mesmo
    // instante em que a notificação existe, uma leitura NOVA do torneio já
    // reconstrói a chave. O que falhava era a UI: `tournaments` é uma lista
    // carregada antes do tick do D-3, e este efeito entregava ao modal esse
    // SNAPSHOT PRÉ-SORTEIO — sem `bracket_history`, o componente cai no
    // estado vazio. Por isso "mais tarde funcionava" (a lista recarregava)
    // e a semana seguinte parecia correta.
    //
    // A correção é reler o torneio na abertura por deep link, que é
    // justamente quando a lista pode estar atrás do estado real. O item da
    // lista continua como fallback se a releitura falhar.
    let cancelled = false;
    const openWithFreshTournament = async () => {
      let fresh = requested;
      try {
        const reread = await localGame.entities.Tournament.get(requestedId);
        if (reread?.id) fresh = reread;
      } catch { /* mantém o item da lista */ }
      if (cancelled) return;
      if (requestedOpenBracket) { setBracketTournament(fresh); return; }
      if (requestedOpenRegistration) {
        if (canRegisterForTournament(fresh)) setRegistrationTournament(fresh);
        else setDetailsTournament(fresh);
        return;
      }
      const mode = resolveTournamentOpenMode(requestedMode, activeRunEvents.has(fresh.id));
      if (mode === TOURNAMENT_DEEP_LINK_MODES.RUN) {
        setActiveTournament(requested);
      } else {
        setDetailsTournament(requested);
      }
    };
    openWithFreshTournament();
    return () => { cancelled = true; };
  }, [activeRunEvents, loading, searchParams, tournaments]);

  // M3 (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md, Parte 8): rodada de torneio
  // interrompida reabre o mesmo torneio automaticamente — o modal mostra a
  // confirmação "Continuar partida?" antes de restaurar, nunca silenciosamente.
  useEffect(() => {
    if (loading || activeTournament || activeMatchCheckpoint?.type !== 'tournament') return;
    const requested = tournaments.find((tournament) => String(tournament.id) === String(activeMatchCheckpoint.tournament_id));
    if (requested) setActiveTournament(requested);
  }, [activeMatchCheckpoint, activeTournament, loading, tournaments]);

  async function refreshProfile() {
    const user = await localGame.auth.me();
    const p = await ensureMyProfile(user);
    setProfile(p);
    const [matches, tournamentList, runEvents] = await Promise.all([
      localGame.entities.Match.list('-created_date', 100),
      localGame.entities.Tournament.list('-start_date', 2000),
      localGame.entities.CalendarEvent.filter({ profile_id: p.id, status: 'scheduled', event_type: 'tournament' }).catch(() => []),
    ]);
    setMatches(matches || []);
    setTournaments(prepareTournamentList(tournamentList));
    const played = new Set(
      (matches || [])
        .filter(m => m.tournament_name && m.tournament_name !== 'Partida Oficial' && m.team_a?.[0] === p?.sport_name)
        .map(m => m.tournament_name)
    );
    setPlayedTournaments(played);

    // Reload registered tournaments
    const registrations = await listTournamentRegistrations(p.id);
    const confirmed = (registrations || []).filter(item => item.status === 'confirmed');
    setRegisteredTournaments(new Set(confirmed.map(item => item.tournament_id)));
    setRegistrationRecords(new Map(confirmed.map(item => [item.tournament_id, item])));
    setActiveRunEvents(new Map((runEvents || []).filter((event) => event.metadata?.tournament_run).map((event) => [event.related_id, event])));
  }

  if (loading) {
    return <PageSkeleton variant="stats" rows={6} />;
  }

  if (!profile) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="glass rounded-2xl p-10 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Não foi possível carregar seu perfil. Tente recarregar a página.</p>
        </div>
      </div>
    );
  }

  const currentMonth = careerMonth(profile);
  const careerDate = profile?.career_date;

  function isTournamentPast(t) {
    if (activeRunEvents.has(t.id)) return false;
    if (t.start_date && careerDate) return t.start_date < careerDate;
    return (t.month || 0) < currentMonth;
  }

  // Playthrough 4.9, Parte A/D — bug real de produção: no dia de início de
  // um torneio em que o jogador NUNCA se inscreveu, esta função retornava
  // `true` só porque `t.start_date === careerDate` — nenhuma checagem de
  // inscrição. Isso liberava o card como "jogável" (e, combinado com
  // `isRegistered` false, o botão mostrava "Inscrever" no próprio dia do
  // evento, depois do prazo, para um torneio que já não podia ser jogado).
  // `activeRunEvents` já é a fonte por ID de "este jogador tem uma campanha
  // sorteada aqui" (CalendarEvent 'scheduled' com tournament_run — só existe
  // atrás de uma inscrição real, ensureTournamentDraw). O sorteio sempre
  // acontece em D-3, bem antes do início, então nunca há uma janela legítima
  // em que um torneio REGISTRADO chegue ao dia de início sem já estar em
  // activeRunEvents — a segunda condição nunca foi necessária pra um
  // jogador inscrito, só abria a porta pro bug.
  function isTournamentPlayable(t) {
    return activeRunEvents.has(t.id);
  }

  function canRegisterForTournament(t) {
    if (isTournamentPast(t) || registeredTournaments.has(t.id)) return false;
    return isRegistrationOpen(t, careerDate);
  }

  const hasEnergyForTournament = (profile?.energy || 0) >= 20;
  // Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.7): "próximo torneio" não
  // existia como valor isolado nesta página (só implícito na ordenação de
  // `byMonth`) — reaproveita o mesmo critério já usado em
  // CalendarPage.jsx (`upcomingTournaments`/`daysBetween`), não um cálculo
  // novo.
  // Hotfix 5.30-B: mesma autoridade do header e da Home
  // (nextEventAuthority.js); aqui só a etapa "inscrição aberta", porque
  // campanha e inscrição já têm fonte própria logo abaixo
  // (activeRunEvents/registeredTournaments).
  const nextTournament = selectNextOpenTournament(tournaments, careerDate);

  // M4.2 (docs/MOBILE_M4_2_GAME_APP_EXPERIENCE.md, Parte 10/11): "Tournament
  // Focus" — quando o jogador está de fato disputando um torneio
  // (activeRunEvents, a mesma fonte que já alimenta o banner "Em torneio"
  // dentro de cada TournamentCard) ou já confirmou inscrição no próximo
  // torneio elegível, essa é a informação mais importante da tela — deve
  // dominar visualmente, antes da lista/tabs, não ser só mais um card entre
  // outros. Nenhum dado novo: reaproveita activeRunEvents/nextTournament/
  // registeredTournaments já computados acima.
  const focusRunTournamentId = activeRunEvents.size > 0 ? [...activeRunEvents.keys()][0] : null;
  const focusRunTournament = focusRunTournamentId ? tournaments.find((t) => t.id === focusRunTournamentId) : null;
  const focusRegisteredTournament = !focusRunTournament && nextTournament && registeredTournaments.has(nextTournament.id) ? nextTournament : null;
  const focusTournament = focusRunTournament || focusRegisteredTournament;

  const { filtered, byMonth } = (() => {
    const ordered = orderTournamentsForView(tournaments, view);
    const inSelectedView = ordered.filter(tournament => {
      // Playthrough 5.13, Partes F/G — o torneio em disputa era REMOVIDO da
      // listagem por já aparecer no TournamentFocusMode. No playtest isso
      // virou o sintoma "me inscrevi e o torneio sumiu da lista": assim que
      // o sorteio do D-3 cria o `tournament_run`, o evento saía do calendário
      // do mês e passava a existir só no card de destaque.
      //
      // O destaque é ÊNFASE, não substituição: o evento precisa continuar na
      // posição dele no calendário, marcado como inscrito/em disputa (o card
      // já recebe esse tratamento via `activeRunEvents`, logo abaixo). Sem
      // isso o jogador perde a referência de QUANDO o torneio acontece e de
      // como ele se encaixa na semana.
      //
      // `focusRunTournament` segue existindo — só não remove mais a entidade
      // da lista.
      const isPast = activeRunEvents.has(tournament.id) ? false : tournament.start_date && careerDate
        ? tournament.start_date < careerDate
        : (tournament.month || 0) < currentMonth;
      return view === 'upcoming' ? !isPast : isPast;
    });
    const selected = filter === 'all' ? inSelectedView : inSelectedView.filter(tournament => tournament.tier === filter);
    const grouped = selected.reduce((groups, tournament) => {
      const key = tournament.start_date?.slice(0, 7) || `sem-data-${tournament.month || 0}`;
      (groups[key] ||= []).push(tournament);
      return groups;
    }, {});
    Object.keys(grouped).forEach((monthKey) => {
      grouped[monthKey] = orderTournamentsForView(grouped[monthKey], view);
    });
    return { filtered: selected, byMonth: grouped };
  })();

  async function handlePlay(tournament) {
    const activeRun = activeRunEvents.get(tournament.id);
    if (!activeRun && isTournamentPast(tournament)) return;
    if (!activeRun && playedTournaments.has(tournament.name)) return;
    // If not registered yet, open registration modal first
    const persistedRegistration = await isPlayerRegisteredForTournament(profile.id, tournament.id);
    // Hotfix 15.5.2: um save legado sem TournamentRegistration não pode
    // mandar o jogador de volta para a inscrição no meio de uma campanha já
    // em andamento — activeRun (mesmo CalendarEvent que já habilita o botão
    // acima) prova a participação quando o registro canônico está ausente.
    const confirmed = persistedRegistration || (activeRun && isTournamentParticipationConfirmed({ event: activeRun }));
    if (!confirmed) {
      if (!canRegisterForTournament(tournament)) return;
      setRegistrationTournament(tournament);
      return;
    }
    if (!isTournamentPlayable(tournament)) return;
    if (!profile?.partner_id) {
      setShowPartner(true);
      return;
    }
    setActiveTournament(tournament);
  }

  async function handleRegistered(updatedProfile) {
    if (updatedProfile) setProfile(updatedProfile);
    // Refresh registered set
    const registrations = await listTournamentRegistrations((updatedProfile || profile).id);
    const confirmed = (registrations || []).filter(item => item.status === 'confirmed');
    setRegisteredTournaments(new Set(confirmed.map(item => item.tournament_id)));
    setRegistrationRecords(new Map(confirmed.map(item => [item.tournament_id, item])));
  }

  function handleCancelRegistration(tournament) {
    const registration = registrationRecords.get(tournament.id);
    if (!registration) return;
    setCancelTarget(tournament);
  }

  async function confirmCancelRegistration() {
    const tournament = cancelTarget;
    if (!tournament) return;
    const registration = registrationRecords.get(tournament.id);
    setCancelTarget(null);
    if (!registration) return;
    const result = await cancelTournamentRegistration({ player: profile, registration, tournament, currentDate: careerDate });
    if (result.success) await handleRegistered(result.profile);
  }

  function clearTournamentDeepLink() {
    openedTournamentRef.current = null;
    if (!searchParams.has('tournament') && !searchParams.has('mode')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('tournament');
    next.delete('mode');
    setSearchParams(next, { replace: true });
  }

  return (
    <Page width="wide">
      <PageContent>
        {/* M4.1.2 (docs/MOBILE_M4_1_2_VISUAL_POLISH.md, Parte 7/19): os 3
            hudItems tinham value/label trocados (o nome do torneio ia no
            label, o contador de dias no value — lia "9d Los Angeles Cup")
            e 2 deles usavam um label genérico redundante com o próprio
            ícone ("Inscrito status", "Silver nível"). GameHud já renderiza
            icon → value → label corretamente (ambos whitespace-nowrap) —
            o bug era de conteúdo, não do componente. */}
        {/* Fase 5.29 — HUB DE COMPETIÇÃO. Antes eram quatro camadas antes da
            lista: herói com HUD (próximo evento) + "Abrir evento", barra de
            data/dupla, cartão "Você está disputando" e só então as abas — o
            mesmo torneio podia aparecer três vezes na primeira dobra. Agora
            é UM cartão de competição: o compromisso atual (campanha ou
            inscrição) ou, sem compromisso, o próximo evento aberto — com a
            única ação primária da área — e a linha da dupla no rodapé. A data
            sai daqui (o header já mostra). Nenhum dado novo: focusTournament,
            nextTournament, activeRunEvents e registeredTournaments são os
            mesmos de antes. */}
        {/* No celular a aba "Torneios" do grupo Competir já nomeia a página; o título só volta no desktop. */}
        <header className="hidden items-center justify-between gap-2 px-1 md:flex" data-tournaments-hub-title>
          <div className="flex min-w-0 items-center gap-2">
            <Trophy className="h-5 w-5 shrink-0 text-premium" />
            <h1 className="pl-title-display truncate text-xl font-black tracking-[-0.03em] sm:text-2xl">Torneios</h1>
          </div>
          <TooltipHint label="Sobre inscrições" content="Inscrições normalmente abrem 30 dias antes e encerram 1 dia antes. Datas sobrepostas geram conflito e exigem uma escolha estratégica da dupla." />
        </header>

        <CompetitionHeroCard
          focusTournament={focusTournament}
          nextTournament={nextTournament}
          activeRun={focusTournament ? activeRunEvents.get(focusTournament.id) || null : null}
          registered={nextTournament ? registeredTournaments.has(nextTournament.id) : false}
          careerDate={careerDate}
          onPlay={() => handlePlay(focusTournament)}
          onViewBracket={(t) => setBracketTournament(t)}
          onViewDetails={(t) => setDetailsTournament(t)}
          partnerRow={<CareerStatusBar compact profile={profile} onPartnerClick={() => setShowPartner(true)} />}
        />

      {/* Top tabs */}
      <Tabs
        tabs={[
          { key: 'calendar', label: 'Agenda', icon: Calendar },
          { key: 'stats', label: 'Estatísticas', icon: BarChart3 },
          { key: 'circuit', label: 'Circuito', icon: TrendingUp },
          { key: 'news', label: 'Notícias', icon: Newspaper },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="segmented"
      />

      {activeTab === 'calendar' && (
      <>
      {/* 5.29: Futuros/Passados e a categoria dividem UMA linha no celular
          (antes: duas faixas inteiras de controle antes da lista). */}
      <div className="flex min-w-0 items-center gap-2" data-tournament-list-controls>
      <Tabs
        tabs={[{ key: 'upcoming', label: 'Futuros' }, { key: 'past', label: 'Passados' }]}
        activeTab={view}
        onTabChange={setView}
        variant="segmented"
        className="min-w-0 flex-1 md:max-w-sm md:flex-none"
      />

      {/* Playthrough 5.20-B, Partes Q/R — FILTRO DE CATEGORIA NO MOBILE.
          Em faixa rolavel, 466px das 11 categorias ficavam fora da tela em
          360px. Deixa-las quebrar linha mostrou todas, mas ai os controles
          (4 abas + 2 estados + 11 categorias = 17) empurravam a LISTA DE
          TORNEIOS inteira para baixo da dobra — captura conferida. Onze opcoes
          mutuamente exclusivas sao um seletor, nao uma parede de pilulas: uma
          linha que mostra a categoria ativa e abre as 11 ao toque. No desktop,
          onde a largura sobra, a faixa de pilulas continua. */}
      <Select
        className="w-[42%] max-w-[11rem] shrink-0 md:hidden"
        value={filter}
        onValueChange={setFilter}
        options={FILTERS.map((f) => ({ value: f.id, label: f.label }))}
        aria-label="Filtrar torneios por categoria"
      />
      </div>
      <Tabs className="hidden md:flex" tabs={FILTERS.map(t => ({ key: t.id, label: t.label }))} activeTab={filter} onTabChange={setFilter} variant="buttons" />

      {/* Tournament list */}
      {filtered.length === 0 ? (
        <EmptyState icon={Trophy} title="Nenhum torneio encontrado" description={view === 'upcoming' ? 'Não há torneios futuros disponíveis para os filtros atuais.' : 'Não há torneios passados nos filtros atuais.'} />
      ) : (
        <div className="space-y-4">
          {Object.keys(byMonth).sort((a, b) => view === 'past' ? b.localeCompare(a) : a.localeCompare(b)).map((m, monthIndex) => {
            const [yearText, monthText] = m.split('-');
            const monthNumber = Number(monthText);
            const groupYear = Number(yearText);
            const careerYear = careerDate ? Number(careerDate.slice(0, 4)) : 0;
            const isCurrentGroup = groupYear === careerYear && monthNumber === currentMonth;
            const isOpen = monthIndex < MONTHS_OPEN_BY_DEFAULT || expandedMonths.has(m);
            const count = byMonth[m].length;
            return (
            <div key={m}>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> {MONTHS[monthNumber - 1] || 'Sem data'} {groupYear || ''}
                {isCurrentGroup && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[9px] font-bold uppercase">Atual</span>
                )}
              </h2>
              {!isOpen && (
                <button
                  type="button"
                  onClick={() => setExpandedMonths((prev) => new Set(prev).add(m))}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border/60 bg-card/45 px-3 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>{count} torneio{count > 1 ? 's' : ''}</span>
                  <span className="text-primary">ver</span>
                </button>
              )}
              <div className={isOpen ? 'grid sm:grid-cols-2 gap-3' : 'hidden'}>
                {isOpen && byMonth[m].map(t => (
                  <TournamentCard
                    key={t.id}
                    tournament={t}
                    isPlayable={isTournamentPlayable(t)}
                    isPast={isTournamentPast(t)}
                    isPlayed={isTournamentPast(t) && playedTournaments.has(t.name)}
                    isRegistered={registeredTournaments.has(t.id)}
                    canRegister={canRegisterForTournament(t)}
                    hasPartner={!!profile?.partner_id}
                    hasEnergy={hasEnergyForTournament}
                    onPlay={() => handlePlay(t)}
                    onCancel={() => handleCancelRegistration(t)}
                    onViewDetails={() => setDetailsTournament(t)}
                    onViewBracket={() => setBracketTournament(t)}
                    careerDate={profile?.career_date}
                    profile={profile}
                    teamRank={teamRank}
                    activeRun={activeRunEvents.get(t.id) || null}
                    registration={registrationRecords.get(t.id) || null}
                  />
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      </>
      )}

      {activeTab === 'stats' && (
        <TournamentStats profile={profile} tournaments={tournaments} matches={matches} />
      )}
      {activeTab === 'circuit' && (
        <CircuitEvolution tournaments={tournaments} />
      )}
      {activeTab === 'news' && (
        <TournamentNews tournaments={tournaments} profile={profile} />
      )}

      {bracketTournament && (
        <TournamentBracket tournament={bracketTournament} careerDate={profile?.career_date} onClose={() => setBracketTournament(null)} />
      )}

      {showPartner && (
        <PartnerSelection
          profile={profile}
          onClose={() => setShowPartner(false)}
          onPartnerSelected={(p) => { setProfile(p); setShowPartner(false); }}
        />
      )}

      {activeTournament && (
        <TournamentModal
          tournament={activeTournament}
          profile={profile}
          careerId={activeCareer?.career_id}
          onClose={() => { setActiveTournament(null); clearTournamentDeepLink(); }}
          onProfileUpdate={setProfile}
          onComplete={refreshProfile}
        />
      )}

      {detailsTournament && (
        <TournamentDetailsModal
          tournament={detailsTournament}
          profile={profile}
          teamRank={teamRank}
          registration={registrationRecords.get(detailsTournament.id) || null}
          activeRun={activeRunEvents.get(detailsTournament.id) || null}
          canRegister={canRegisterForTournament(detailsTournament)}
          onClose={() => { setDetailsTournament(null); clearTournamentDeepLink(); }}
          onRegister={() => {
            setDetailsTournament(null);
            clearTournamentDeepLink();
            setRegistrationTournament(detailsTournament);
          }}
          onContinue={() => {
            setDetailsTournament(null);
            clearTournamentDeepLink();
            setActiveTournament(detailsTournament);
          }}
          onViewBracket={() => {
            setDetailsTournament(null);
            clearTournamentDeepLink();
            setBracketTournament(detailsTournament);
          }}
        />
      )}

      {registrationTournament && (
        <TournamentRegistrationModal
          tournament={registrationTournament}
          profile={profile}
          teamRank={teamRank}
          onClose={() => setRegistrationTournament(null)}
          onRegistered={handleRegistered}
        />
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancelRegistration}
        tone="danger"
        title="Cancelar inscrição"
        description={cancelTarget ? `Cancelar a inscrição em ${cancelTarget.name}? A agenda será liberada.` : ''}
        confirmLabel="Cancelar inscrição"
        cancelLabel="Manter inscrição"
      />
      </PageContent>
    </Page>
  );
}

// Fase 5.29 — faixa de cor do tier (acento à esquerda do cartão), no lugar
// de borda + brilho em volta do cartão inteiro.
const TIER_ACCENT = {
  'Legacy Finals': 'bg-rose-500', Crown: 'bg-amber-400', Elite: 'bg-fuchsia-500', Masters: 'bg-purple-500',
  'Circuit Finals': 'bg-indigo-500', Platinum: 'bg-cyan-400', Gold: 'bg-yellow-400', Silver: 'bg-slate-400',
  Bronze: 'bg-orange-700', Exibição: 'bg-teal-400',
};

// M4.2 (docs/MOBILE_M4_2_GAME_APP_EXPERIENCE.md, Parte 11) + 5.29: o antigo
// "Tournament Focus" vira o cartão de competição do hub. Mesmas regras de
// estado (activeMatch/canPlayNow/bracketReady); quando não há compromisso,
// mostra o próximo evento aberto (o antigo HUD do herói) no mesmo lugar, em
// vez de dois blocos diferentes para a mesma pergunta "o que vem agora?".
function CompetitionHeroCard({ focusTournament, nextTournament, activeRun, registered, careerDate, onPlay, onViewBracket, onViewDetails, partnerRow }) {
  const tournament = focusTournament || nextTournament;
  if (!tournament) {
    return (
      <Surface padding="compact" className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Agenda livre</p>
        <p className="text-sm text-muted-foreground">Nenhum torneio com inscrição aberta agora. Novas etapas abrem 30 dias antes.</p>
        <div className="border-t border-border/40 pt-2">{partnerRow}</div>
      </Surface>
    );
  }
  const config = TIER_CONFIG[tournament.tier] || TIER_CONFIG.Silver;
  const Icon = config.icon;
  const run = focusTournament ? activeRun?.metadata?.tournament_run : null;
  const activeMatch = run?.matches?.[run?.currentRound ?? -1] || null;
  const opponentNames = Array.isArray(activeMatch?.opponent) ? activeMatch.opponent.map((item) => item.name).filter(Boolean).join(' & ') : '';
  const canPlayNow = Boolean(activeMatch) && activeMatch.date === careerDate && activeMatch.preparationCompleted;
  const days = careerDate && tournament.start_date ? daysBetween(careerDate, tournament.start_date) : null;
  const when = days == null ? formatDate(tournament.start_date) : days === 0 ? 'Hoje' : days > 0 ? `em ${days}d · ${formatDate(tournament.start_date)}` : formatDate(tournament.start_date);

  let eyebrow; let statusLine;
  if (activeMatch) {
    eyebrow = 'Você está disputando';
    statusLine = [activeMatch.round, formatDate(activeMatch.date), opponentNames ? `vs ${opponentNames}` : null].filter(Boolean).join(' · ');
  } else if (focusTournament) {
    eyebrow = 'Inscrito para este torneio';
    statusLine = `${activeRun ? 'Aguardando início' : 'Inscrição confirmada'} · ${when}`;
  } else {
    eyebrow = 'Próximo evento';
    statusLine = `${registered ? 'Inscrito' : 'Inscrições abertas'} · ${when}`;
  }
  // Playthrough 5.16, Parte M — "Chave" só quando a chave existe.
  const bracketReady = hasViewableTournamentBracket(tournament, careerDate);
  const primary = focusTournament
    ? <Button level="primary" size="touch" onClick={onPlay}><Play className="h-4 w-4" /> {canPlayNow ? 'Jogar partida' : activeMatch ? 'Preparar' : 'Ver evento'}</Button>
    : <Button level="primary" size="touch" onClick={() => onViewDetails(tournament)}>Abrir evento</Button>;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm" data-competition-hero>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${TIER_ACCENT[tournament.tier] || 'bg-primary'}`} />
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12"><Icon className="h-5 w-5 text-primary" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wider text-primary">{eyebrow}</p><span className="md:hidden"><TooltipHint label="Sobre inscrições" content="Inscrições normalmente abrem 30 dias antes e encerram 1 dia antes. Datas sobrepostas geram conflito e exigem uma escolha estratégica da dupla." /></span></div>
          <h2 className="mt-0.5 truncate text-lg font-black leading-tight">{tournament.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground"><span className="font-bold text-foreground/80">{config.label}</span> · {statusLine}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {primary}
        {bracketReady && <Button level="ghost" size="sm" onClick={() => onViewBracket(tournament)}>Chave</Button>}
        {focusTournament && <Button level="ghost" size="sm" onClick={() => onViewDetails(tournament)}>Detalhes</Button>}
      </div>
      <div className="mt-3 border-t border-border/40 pt-2">{partnerRow}</div>
    </section>
  );
}

function TournamentCard({ tournament, isPlayable, isPast, isPlayed, isRegistered, hasPartner, hasEnergy, onPlay, onCancel, onViewDetails, onViewBracket, careerDate, profile, teamRank, activeRun, registration }) {
  // Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.7): a análise do treinador
  // (5 linhas de estatísticas) era sempre renderizada por card — maior
  // ganho de altura isolado encontrado na auditoria. Fica atrás de um
  // toggle local, recolhida por padrão; nada do cálculo muda.
  const [showAnalysis, setShowAnalysis] = useState(false);
  const config = TIER_CONFIG[tournament.tier] || TIER_CONFIG.Silver;
  const Icon = config.icon;
  const coach = !isPast ? evaluateTournamentChoice(tournament, {
    rank: teamRank,
    teamRank,
    energy: profile?.energy ?? 100,
    age: profile?.age ?? 25,
    nationality: profile?.nationality,
  }, {}) : null;
  const entry = !isPast ? evaluateTournamentEntry(tournament, buildAthleteEntryContext(profile, teamRank, tournament)) : null;
  const activeMatch = activeRun?.metadata?.tournament_run?.matches?.[activeRun?.metadata?.tournament_run?.currentRound || 0] || null;
  const displayDate = activeMatch?.date || tournament.start_date;
  // Playthrough 4.5C, item 2 — cancelado (Cidade do Cabo: chegou ao início
  // sem campo mínimo) é um estado TERMINAL próprio, checado antes de
  // isPast/isPlayed: sem isso, o card mostrava "Encerrado" genérico —
  // indistinguível de um torneio realmente concluído.
  const cancelled = isTournamentCancelled(tournament);
  // Playthrough 4.6C, item 7/8 — `isPast` (só compara start_date com a data
  // da carreira) não sabe se o settlement realmente concluiu. Isso fazia um
  // torneio AI-only cuja resolução ainda não rodou (chave existe, campeão
  // ainda não) aparecer como "Encerrado" — rótulo que implica lifecycle
  // concluído — sem nenhum bloco de campeão, indistinguível visualmente de
  // um torneio genuinamente cancelado ou nunca sorteado.
  // getTournamentDrawState (tournamentBracketView.js) é a fonte única: só
  // COMPLETED tem campeão garantido; IN_PROGRESS cobre tanto "ainda
  // rolando" quanto "data passou, aguardando resolução" — nunca mostrado
  // como "Encerrado" nos dois casos.
  const drawState = getTournamentDrawState(tournament, careerDate);
  const pendingResolution = isPast && !cancelled && drawState !== TOURNAMENT_DRAW_STATES.COMPLETED;

  // Playthrough 4.9, Parte D — fonte canônica única (getPlayerTournamentRegistrationState)
  // pra decidir exatamente o que o card mostra sobre a janela de inscrição,
  // nunca reinferido por data/status aqui.
  const registrationState = getPlayerTournamentRegistrationState({
    tournament, registration, careerDate,
    tournamentRun: activeRun?.metadata?.tournament_run || null,
    drawn: drawState === TOURNAMENT_DRAW_STATES.DRAWN || drawState === TOURNAMENT_DRAW_STATES.IN_PROGRESS || drawState === TOURNAMENT_DRAW_STATES.COMPLETED,
  });
  const registrationWindow = getTournamentRegistrationWindow(tournament);
  const daysToDeadline = registrationWindow.closesAt ? daysBetweenGameDates(careerDate, registrationWindow.closesAt) : null;
  // Playthrough 4.9, Parte D — texto/tom do aviso vêm de uma função pura e
  // testável (buildRegistrationCardNotice, tournamentRegistrationState.js);
  // aqui só resta mapear `code` -> ícone.
  const drawHappened = drawState === TOURNAMENT_DRAW_STATES.DRAWN || drawState === TOURNAMENT_DRAW_STATES.IN_PROGRESS || drawState === TOURNAMENT_DRAW_STATES.COMPLETED;
  const rawNotice = buildRegistrationCardNotice(registrationState, { daysToDeadline, isPast, drawHappened });
  const NOTICE_ICONS = { CONFIRMED: CheckCircle, LAST_DAY: AlertCircle, CLOSING_SOON: AlertCircle, NOT_PARTICIPANT: Lock, REGISTRATION_CLOSED: Lock };
  const registrationNotice = rawNotice ? { ...rawNotice, icon: NOTICE_ICONS[rawNotice.code] || AlertCircle } : null;

  // Playthrough 5.20-C, item 1 — UM estado principal, derivado das autoridades
  // acima (nunca recalculado). O card deixa de empilhar selos concorrentes.
  const cardState = resolveTournamentCardState({
    registrationState,
    cancelled,
    playableToday: Boolean(isRegistered && isPlayable) || Boolean(activeMatch && activeMatch.date === careerDate),
    pendingResolution,
    isPast,
  });
  const statePresentation = getTournamentCardPresentation(cardState);
  const STATE_ICONS = {
    [TOURNAMENT_CARD_STATE.OPEN]: CheckCircle,
    [TOURNAMENT_CARD_STATE.REGISTERED]: CheckCircle,
    [TOURNAMENT_CARD_STATE.AWAITING_DRAW]: Clock3,
    [TOURNAMENT_CARD_STATE.DRAWN]: Shield,
    [TOURNAMENT_CARD_STATE.PLAY_TODAY]: Play,
    [TOURNAMENT_CARD_STATE.ELIMINATED]: Lock,
    [TOURNAMENT_CARD_STATE.COMPLETED]: CheckCircle,
    [TOURNAMENT_CARD_STATE.CANCELLED]: AlertCircle,
    [TOURNAMENT_CARD_STATE.CLOSED]: Lock,
    [TOURNAMENT_CARD_STATE.UNAVAILABLE]: Lock,
  };
  const StateIcon = STATE_ICONS[cardState] || Lock;

  // Fase 5.29 — CARTÃO DE AGENDA. Antes: borda+brilho do tier no cartão
  // inteiro, "Ver detalhes"/"Ver chave" como botões no meio da linha de data
  // (quebravam a linha no celular), avisos em caixas com borda e a ação em
  // pílula colorida própria. Agora: faixa de cor do tier à esquerda, uma
  // linha de metadados, um aviso em texto com ícone (sem caixa), e um rodapé
  // único com recompensas à esquerda e as ações à direita no padrão da 5.28
  // (ação do card = secundária; o primário da tela vive no cartão de
  // competição). Mesmos estados, mesmas condições, mesmos handlers.
  const days = careerDate && displayDate ? daysBetween(careerDate, displayDate) : null;
  const noticeTone = registrationNotice?.tone === 'confirmed' ? 'text-emerald-300' : registrationNotice?.tone === 'warning' ? 'text-amber-300' : 'text-muted-foreground';
  const showAction = (isPlayable || canPlayerRegisterNow(registrationState)) && !isPlayed;
  const actionLabel = !hasPartner ? <><Lock className="h-3.5 w-3.5" /> Parceiro</>
    : !hasEnergy && activeMatch?.date === careerDate ? <><AlertCircle className="h-3.5 w-3.5" /> Sem energia</>
      : activeMatch ? <><Play className="h-3.5 w-3.5" /> {activeMatch.date === careerDate && activeMatch.preparationCompleted ? 'Jogar' : 'Preparar'}</>
        : isRegistered && isPlayable ? <><Play className="h-3.5 w-3.5" /> Jogar</>
          : isRegistered ? <><CheckCircle className="h-3.5 w-3.5" /> Inscrito</>
            : <><CheckCircle className="h-3.5 w-3.5" /> Inscrever</>;
  const actionTone = !hasPartner ? 'text-amber-300' : isPlayable && !hasEnergy ? 'text-red-300' : 'text-primary';

  return (
    <article className={`relative overflow-hidden rounded-2xl border border-border/50 bg-card/55 p-3.5 pl-4 transition-colors hover:border-border sm:p-4 sm:pl-5 ${isPlayed || isPast ? 'opacity-70' : ''}`} data-tournament-card>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${TIER_ACCENT[tournament.tier] || 'bg-primary/60'}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black leading-tight">{tournament.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Icon className="h-3 w-3 shrink-0" />{config.label}</p>
        </div>
        {/* Playthrough 5.20-C — ESTADO PRINCIPAL UNICO. */}
        <StatusBadge tone={statePresentation.tone} icon={StateIcon} className="shrink-0">
          {statePresentation.label}
        </StatusBadge>
      </div>

      {displayDate && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span className="font-semibold text-foreground">{formatDate(displayDate)}</span>
          {days != null && <span className={days === 0 ? 'font-bold text-primary' : days > 0 ? 'text-cyan-400' : ''}>{days === 0 ? '· Hoje!' : days > 0 ? `· em ${days}d` : `· há ${Math.abs(days)}d`}</span>}
          <span>·</span><span className={`font-semibold ${config.diffColor}`}>{config.diffLabel}</span>
          <span>·</span><span>{tournament.max_participants || 16} vagas</span>
          {tournament.concurrent_events > 1 && <><span>·</span><span className="font-semibold text-amber-300">{tournament.concurrent_events} eventos na semana</span></>}
        </p>
      )}
      {activeMatch && <p className="mt-2 text-xs"><span className="text-[10px] font-black uppercase tracking-wider text-primary">Em torneio · </span><span className="font-bold">{activeMatch.round} · {activeMatch.preparationCompleted ? 'plano definido' : 'preparação pendente'}</span></p>}

      {/* Uma única linha de situação, em ordem de prioridade (cancelado →
          sem resultado → campeão → aviso de inscrição). */}
      {cancelled ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>Sem chave oficial.</strong> {getTournamentCancellationLabel(tournament)}</span></p>
      ) : pendingResolution ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong className="text-foreground">Ainda sem campeão.</strong> A data do torneio passou, mas o resultado oficial ainda não foi resolvido.</span></p>
      ) : isPast && tournament.champion ? (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs"><Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" /><span className="text-amber-400/80">Campeão</span><strong className="truncate text-amber-300">{tournament.champion}</strong></p>
      ) : registrationNotice && (
        <p className={`mt-2 flex items-start gap-1.5 text-xs ${noticeTone}`}>
          <registrationNotice.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><strong>{registrationNotice.label}</strong>{registrationNotice.message && <span className="text-muted-foreground"> · {registrationNotice.message}</span>}</span>
        </p>
      )}

      {coach && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowAnalysis((value) => !value)}
            aria-expanded={showAnalysis}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            Análise do treinador
            <span className={entry?.eligible ? 'text-emerald-400' : 'text-red-400'}>· {getEntryPathLabel(entry?.path)}</span>
            {showAnalysis ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showAnalysis && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-secondary/30 p-2.5 text-[10px]">
              {buildCoachAnalysisRows(coach).map((row) => (
                <Fragment key={row.key}>
                  <span className="text-muted-foreground">{row.label}</span>
                  <strong className={`text-right ${row.tone === 'fatigue' ? 'text-orange-400' : ''}`}>{row.value}</strong>
                </Fragment>
              ))}
              <p className="col-span-2 mt-1 text-[10px] leading-snug text-muted-foreground">{RANK_ONLY_PROJECTION_NOTE}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/40 pt-2.5">
        <div className="flex items-center gap-3">
          <Reward icon={Coins} value={tournament.prize_coins} color="text-yellow-400" />
          <Reward icon={Zap} value={tournament.xp_reward} color="text-primary" />
          <Reward icon={Star} value={tournament.rank_points} color="text-cyan-400" />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <Button type="button" level="ghost" size="sm" onClick={onViewDetails}>Ver detalhes</Button>
          {/* Playthrough 5.16, Partes K/M — "Ver chave" só depois do sorteio. */}
          {(drawHappened || (isPast && tournament.champion)) && <Button type="button" level="ghost" size="sm" onClick={onViewBracket}>Ver chave</Button>}
          {/* Playthrough 4.9, Parte B (invariante 5) — a ação só existe com
              registrationState===REGISTRATION_OPEN (ou partida jogável). */}
          {showAction && <Button type="button" level="secondary" size="sm" onClick={onPlay} className={actionTone}>{actionLabel}</Button>}
          {isRegistered && !isPlayable && !isPast && <Button type="button" level="ghost" size="sm" onClick={onCancel} className="text-red-300 hover:text-red-200">Cancelar inscrição</Button>}
        </div>
      </div>
    </article>
  );
}

function Reward({ icon: Icon, value, color }) {
  return (
    <div className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className="text-xs font-bold tabular-nums">{value || 0}</span>
    </div>
  );
}
