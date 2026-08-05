import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { LoadingScreen, PageHeader } from '@/components/padel/ui';
import { Users } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ensureMyProfile } from '@/lib/padel';
import { hireStaff, fireStaff, renewStaffContract } from '@/lib/economy';
import StaffPanel from '@/components/economy/StaffPanel';
import { syncStaffEffects } from '@/game-core/staffLifecycle';
import { upgradeStaffFacility } from '@/lib/staffFacilities';

export default function Staff() {
  const [profile, setProfile] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
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

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader
        icon={Users}
        title="Comissão técnica"
        subtitle="O treinador principal lidera a equipe, enquanto os especialistas ocupam vagas próprias de apoio."
        accent="primary"
      />
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
    </div>
  );
}
