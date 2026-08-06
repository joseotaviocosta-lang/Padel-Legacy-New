import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { LoadingScreen } from '@/components/padel/ui';
import { Page, PageContent, PageHeader, StatCard, StatusBadge } from '@/components/design-system';
import { Users, BriefcaseBusiness, Wallet, Sparkles, UserRoundCog } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ensureMyProfile } from '@/lib/padel';
import { hireStaff, fireStaff, renewStaffContract } from '@/lib/economy';
import StaffPanel from '@/components/economy/StaffPanel';
import { syncStaffEffects } from '@/game-core/staffLifecycle';
import { upgradeStaffFacility } from '@/lib/staffFacilities';
import StaffLivePanel from '@/components/staff/StaffLivePanel';
import { buildStaffMeeting, ensureWeeklyStaffMeeting } from '@/lib/livingStaff.js';

export default function Staff() {
  const [profile, setProfile] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [meeting, setMeeting] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const user = await localGame.auth.me();
      const currentProfile = await ensureMyProfile(user);
      setProfile(currentProfile);
      if (currentProfile) {
        const records = await localGame.entities.PlayerStaffHire.filter({ profile_id: currentProfile.id });
        setStaff(records || []);
        const liveMeeting = buildStaffMeeting(currentProfile, records || []);
        setMeeting(liveMeeting);
        ensureWeeklyStaffMeeting(currentProfile, records || []).catch((error) => console.warn('[Staff] reunião semanal indisponível', error));
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

  if (loading) return <LoadingScreen />;
  if (!profile) return <div className="p-6 text-center text-muted-foreground">Crie seu perfil primeiro.</div>;

  const activeStaff = staff.filter((member) => member.status !== 'encerrado' && member.contract_status !== 'expired');
  const monthlyPayroll = activeStaff.reduce((sum, member) => sum + (Number(member.monthly_salary ?? member.salary) || 0), 0);
  const maxSlots = Number(profile.staff_slots ?? profile.max_staff_slots ?? 2);
  const synergy = Number(profile.staff_synergy ?? profile.team_synergy ?? 0);

  return (
    <Page size="wide" className="animate-fade-in">
      <PageContent>
      <PageHeader
        eyebrow="Equipe técnica"
        icon={Users}
        title="Comissão técnica"
        description="Especialistas de apoio que trabalham sob liderança do treinador principal. O treinador não consome vaga da comissão."
        tone="brand"
        stats={<><StatusBadge tone="success">Treinador separado</StatusBadge><StatusBadge tone="info">{activeStaff.length}/{maxSlots} vagas</StatusBadge></>}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Profissionais" value={`${activeStaff.length}/${maxSlots}`} detail="vagas de apoio" icon={BriefcaseBusiness} tone="brand" />
        <StatCard label="Folha mensal" value={monthlyPayroll.toLocaleString('pt-BR')} detail="sem contar o treinador" icon={Wallet} tone="premium" />
        <StatCard label="Sinergia" value={`${synergy}%`} detail="integração da equipe" icon={Sparkles} tone={synergy >= 70 ? 'success' : 'info'} />
        <StatCard label="Liderança" value={profile.coach_name || 'Treinador'} detail="comando técnico" icon={UserRoundCog} tone="info" />
      </div>
      <StaffLivePanel meeting={meeting} />
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
      </PageContent>
    </Page>
  );
}
