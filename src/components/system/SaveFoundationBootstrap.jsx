import { useEffect } from 'react';
import { ensureWorldSeed2025, verifySaveFoundation } from '@/lib/saveFoundation';
import { useCareer } from '@/careers/useCareer.js';
import { localGame } from '@/api/localGameClient.js';
import { BOTS_BY_DIFFICULTY } from '@/lib/bots';
import { repairLegacyPlayerPartnerAthlete } from '@/lib/partnerAthlete.js';
import { ensurePlayerTeamRanking } from '@/lib/teamRanking.js';
import { ensureCareerSystemsInitialized } from '@/game-core/careerSystemsInitialization.js';

// Playthrough 5.12, Parte F — carreiras criadas antes desta fase têm
// parceria e contrato, mas o parceiro nunca virou AthleteProfile. O reparo
// é idempotente e roda uma vez por carreira ativa, junto do reparo de
// fundação que já existia aqui. Numa carreira já materializada é um no-op.
async function repairPartnerForActiveCareer() {
  const profiles = await localGame.entities.PlayerProfile.list(null, 5).catch(() => []);
  const profile = profiles?.[0];
  if (!profile?.id) return null;
  const resolveTemplate = (templateId) => {
    for (const bots of Object.values(BOTS_BY_DIFFICULTY)) {
      const found = bots?.find((bot) => bot?.id === templateId);
      if (found) return found;
    }
    return null;
  };
  await repairLegacyPlayerPartnerAthlete(profile, resolveTemplate);
  return profile;
}

export default function SaveFoundationBootstrap() {
  const { activeCareer, loading } = useCareer();

  useEffect(() => {
    if (loading || !activeCareer?.career_id) return undefined;

    let cancelled = false;
    const run = async () => {
      try {
        const status = await verifySaveFoundation();
        if (!cancelled && !status.ok) await ensureWorldSeed2025();
        const profile = await repairPartnerForActiveCareer();
        // Playthrough 5.22-G — garante a linha canônica da dupla ATIVA no
        // load (materializa se ausente, recalcula A+B se 0/desatualizada).
        // Idempotente; roda sempre, mesmo quando a fundação já está ok.
        if (!cancelled && profile) await ensurePlayerTeamRanking(profile);
        // LOCAL-8F — catálogos e lote inicial de propostas nascem aqui, na
        // ativação da carreira, e não na 1ª visita a cada tela.
        if (!cancelled) await ensureCareerSystemsInitialized({ careerId: activeCareer.career_id });
      } catch (error) {
        console.error('[Save Foundation] inicialização segura falhou; nenhum save foi apagado.', error);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [activeCareer?.career_id, loading]);

  return null;
}
