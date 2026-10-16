import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { CollapsibleSection, Page, PageContent, PageHeader, PageSkeleton, StatusBadge } from '@/components/design-system';
import { Users, BriefcaseBusiness, Wallet, Sparkles, UserRoundCog } from 'lucide-react';
import { buildStableMessageId } from '@/lib/careerCommunications.js';
import StaffReportHighlight from '@/components/staff/StaffReportHighlight';
import TournamentRegistrationModal from '@/components/calendar/TournamentRegistrationModal';
import { APP_ROUTES } from '@/navigation/routes.js';
import { useToast } from '@/components/ui/use-toast';
import { ensureMyProfile } from '@/lib/padel';
import { hireStaff, fireStaff, renewStaffContract, getStaffSlots } from '@/lib/economy';
import StaffPanel from '@/components/economy/StaffPanel';
import { syncStaffEffects } from '@/game-core/staffLifecycle';
import { upgradeStaffFacility } from '@/lib/staffFacilities';
import StaffLivePanel from '@/components/staff/StaffLivePanel';
import { buildStaffMeeting } from '@/lib/livingStaff.js';

export default function Staff() {
  const [profile, setProfile] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [meeting, setMeeting] = useState(null);
  const { toast } = useToast();

  // Playthrough 5.13 (continuação), Partes D/E/F — a notificação da comissão
  // agora traz `?report=<context_key>` (e `?staff=<id>` quando é sobre um
  // profissional específico). A página resolve esse identificador e abre o
  // relatório correspondente já destacado, em vez de só mostrar o topo.
  const [searchParams] = useSearchParams();
  const requestedReport = searchParams.get('report');
  const requestedStaffId = searchParams.get('staff');
  const [highlightedReport, setHighlightedReport] = useState(null);
  const reportAnchorRef = useRef(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let cancelled = false;
    setHighlightedReport(null);
    // Parte F — sem identificador (save antigo, ou entrada manual pelo menu)
    // a página segue exatamente como antes.
    if (!requestedReport || !profile?.id) return undefined;
    (async () => {
      // A chave de contexto é estável e deriva o id da mensagem, então a
      // busca é direta; o filtro por `context_key` cobre mensagens gravadas
      // por outro caminho.
      let found = await localGame.entities.CareerMessage
        .get(buildStableMessageId(profile.id, requestedReport)).catch(() => null);
      if (!found) {
        const all = await localGame.entities.CareerMessage
          .filter({ profile_id: profile.id }).catch(() => []);
        found = (all || []).find((message) => message?.metadata?.context_key === requestedReport) || null;
      }
      if (!cancelled) setHighlightedReport(found);
    })();
    return () => { cancelled = true; };
  }, [requestedReport, profile?.id]);

  useEffect(() => {
    if (!highlightedReport || !reportAnchorRef.current) return;
    reportAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [highlightedReport]);

  // Playthrough 5.14 (continuação), Partes H/I/J/K — o CTA do relatório.
  // O botão da reunião competitiva age SEMPRE por caminhos já existentes:
  // o modal canônico de inscrição, ou o deep link de torneio/chave que a
  // página de Torneios já sabe interpretar (incluindo a releitura fresca do
  // bracket corrigida na 5.13).
  const [registrationTournament, setRegistrationTournament] = useState(null);
  const navigate = useNavigate();

  async function refreshHighlightedReport() {
    if (!requestedReport || !profile?.id) return;
    const fresh = await localGame.entities.CareerMessage
      .get(buildStableMessageId(profile.id, requestedReport)).catch(() => null);
    if (fresh) setHighlightedReport(fresh);
  }

  async function handleReportAction(action) {
    if (!action?.tournamentId) return;
    if (action.id === 'register') {
      const tournament = await localGame.entities.Tournament.get(action.tournamentId).catch(() => null);
      if (tournament) setRegistrationTournament(tournament);
      return;
    }
    if (action.id === 'view_bracket') {
      navigate(`${APP_ROUTES.TOURNAMENTS}?tournament=${action.tournamentId}&openBracket=true`);
      return;
    }
    navigate(`${APP_ROUTES.TOURNAMENTS}?tournament=${action.tournamentId}`);
  }

  async function load() {
    try {
      const user = await localGame.auth.me();
      const currentProfile = await ensureMyProfile(user);
      setProfile(currentProfile);
      if (currentProfile) {
        const records = await localGame.entities.PlayerStaffHire.filter({ profile_id: currentProfile.id });
        setStaff(records || []);
        // Onboarding 2.0 + Central de Notificações (docs/ONBOARDING_V3_COMMUNICATIONS.md,
        // item 32): a notificação "semanal da comissão" saiu daqui — mount de
        // página nunca deveria gerar comunicação (cada visita era uma nova
        // chance de duplicar). Ela já é gerada pelo ciclo de vida do
        // calendário (`processStaffDay`, avanço de dia), mesclada com o
        // relatório semanal. `buildStaffMeeting` continua só para o painel
        // ao vivo desta página.
        const liveMeeting = buildStaffMeeting(currentProfile, records || []);
        setMeeting(liveMeeting);
      }
    } catch (error) {
      console.error('[Staff] Falha ao carregar comissão técnica:', error);
    } finally {
      setLoading(false);
    }
  }

  async function refresh(profileId) {
    const records = await localGame.entities.PlayerStaffHire.filter({ profile_id: profileId });
    setStaff(records || []);
  }

  async function handle(action, operation, successMessage) {
    setBusy(action);
    try {
      const updatedProfile = await operation();
      if (updatedProfile) setProfile(updatedProfile);
      if (profile?.id) await refresh(profile.id);
      toast({ title: successMessage });
    } catch (error) {
      toast({ title: 'Erro', description: error.message || 'Não foi possível concluir a ação.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <PageSkeleton variant="stats" rows={4} />;
  if (!profile) return <div className="p-6 text-center text-muted-foreground">Crie seu perfil primeiro.</div>;

  const activeStaff = staff.filter((member) => member.status !== 'encerrado' && member.contract_status !== 'expired');
  const monthlyPayroll = activeStaff.reduce((sum, member) => sum + (Number(member.monthly_salary ?? member.salary) || 0), 0);
  const maxSlots = getStaffSlots(profile.career_level || 1);
  const synergy = Number(profile.staff_synergy ?? profile.team_synergy ?? 0);

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
      <PageHeader
        dense
        eyebrow="Equipe técnica"
        icon={Users}
        title="Comissão técnica"
        description="Especialistas de apoio sob liderança do treinador principal (que não ocupa vaga)."
        tone="brand"
        hudLabel="Comissão atual"
        hudItems={[
          { label: 'vagas', value: `${activeStaff.length}/${maxSlots}`, icon: BriefcaseBusiness },
          { label: 'folha', value: monthlyPayroll.toLocaleString('pt-BR'), icon: Wallet, tone: 'premium' },
          { label: 'sinergia', value: `${synergy}%`, icon: Sparkles, tone: synergy >= 70 ? 'success' : 'info' },
          { label: 'liderança', value: profile.coach_name || 'Treinador', icon: UserRoundCog, tone: 'info' },
        ]}
      />
      <div ref={reportAnchorRef}>
        <StaffReportHighlight
          report={highlightedReport}
          highlightedMemberName={
            highlightedReport?.metadata?.staff_member_name
            || activeStaff.find((member) => member.id === requestedStaffId || member.staff_id === requestedStaffId)?.staff_name
            || null
          }
          onAction={handleReportAction}
        />
      </div>

      {/* Playthrough 5.14 (continuação), Parte I — a inscrição a partir do
          relatório usa o MESMO modal canônico do CareerHub/Torneios. A
          página não cria TournamentRegistration por conta própria. */}
      {registrationTournament && (
        <TournamentRegistrationModal
          tournament={registrationTournament}
          profile={profile}
          teamRank={0}
          onClose={() => setRegistrationTournament(null)}
          onRegistered={async (updated) => {
            if (updated) setProfile(updated);
            setRegistrationTournament(null);
            // Parte J — o relatório reflete o novo estado sem criar mensagem
            // nova: a própria reunião semanal é atualizada pelo tick.
            await refreshHighlightedReport();
          }}
        />
      )}
      <StaffPanel
        profile={profile}
        staff={staff}
        onHire={(candidate) => handle('hire', async () => {
          await hireStaff(profile, candidate);
          return syncStaffEffects(profile);
        }, `${candidate.name} contratado!`)}
        onFire={(member) => handle('fire', async () => {
          const updated = await fireStaff(member, profile);
          return syncStaffEffects(updated);
        }, `${member.staff_name} demitido`)}
        onRenew={(member, months) => handle(`renew-${member.id}`, async () => {
          await renewStaffContract(member, profile, months);
          return syncStaffEffects(profile);
        }, `Contrato de ${member.staff_name} renovado!`)}
        onUpgradeFacility={(facility) => handle(`facility-${facility.id}`, async () => {
          const updated = await upgradeStaffFacility(profile, facility.id);
          return syncStaffEffects(updated);
        }, `${facility.name} melhorada!`)}
        busy={busy}
      />
      {/* Fase 5.31 — a reunião semanal (moral, sinergia, plano, clima) dominava
          a primeira dobra e empurrava a equipe para ~1.500px. Continua
          inteira, sob demanda, depois da comissão. */}
      {meeting && (
        <CollapsibleSection icon={Users} title="Reunião da comissão" description={`Plano da semana: ${meeting.plan?.label || '—'}`} badge={<StatusBadge tone={meeting.moral >= 70 ? 'success' : meeting.moral >= 45 ? 'warning' : 'danger'}>Moral {meeting.moral}%</StatusBadge>}>
          <StaffLivePanel meeting={meeting} />
        </CollapsibleSection>
      )}
      </PageContent>
    </Page>
  );
}
