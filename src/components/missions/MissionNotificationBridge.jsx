import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, ensureTutorialMissionCatalog, incrementMissionProgress } from '@/lib/padel';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useCareer } from '@/careers/useCareer.js';
import { missionRuntime, validateMissionReward } from '@/missions/missionSystem.js';

const ROUTE_OBJECTIVES = {
  '/development': 'visit_development', '/character': 'visit_character', '/training-center': 'visit_training_center',
  '/team-hub': 'visit_team_hub', '/partners': 'review_partner_offer', '/relationships': 'visit_relationships',
  '/competitions': 'visit_competitions', '/tournaments': 'visit_tournaments', '/game/calendar': 'visit_calendar', '/ranking': 'visit_ranking', '/journal': 'visit_journal',
  '/press': 'visit_press', '/world-market': 'visit_world_market', '/athletes': 'visit_athletes', '/world-events': 'visit_world_events',
  '/game/economy': 'visit_economy', '/game/shop': 'visit_shop', '/game/inventory': 'visit_inventory', '/achievements': 'visit_achievements', '/history': 'visit_history', '/game/legacy': 'visit_legacy',
};
const shownNotifications = new Set();

export default function MissionNotificationBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { loading } = useCareer();
  const profileRef = useRef(null);

  useEffect(() => {
    const handler = event => {
      const { mission, reward, tutorial } = event.detail || {};
      if (!mission) return;
      const key = event.detail?.notificationKey || `${profileRef.current?.id || 'profile'}:${mission.id}:${event.detail?.cycleId || 'career'}`;
      if (shownNotifications.has(key)) return;
      shownNotifications.add(key);
      const parts = [];
      if (Number(reward?.xp) > 0) parts.push(`+${reward.xp} XP`); if (Number(reward?.coins) > 0) parts.push(`+${reward.coins} moedas`); if (reward?.medal) parts.push(`Medalha: ${reward.medal}`);
      const description = validateMissionReward(mission).hasReward ? `${parts.join(' · ')}. Recompensa recebida.` : 'Etapa concluída.';
      toast({
        title: tutorial ? `Tutorial concluído: ${mission.title}` : `Missão concluída: ${mission.title}`,
        description,
        action: tutorial ? <ToastAction onClick={() => navigate('/game/missions')}>Ver próximo passo</ToastAction> : undefined,
      });
    };
    window.addEventListener('padel:mission-completed', handler);
    return () => window.removeEventListener('padel:mission-completed', handler);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (loading || navigationType !== 'PUSH' || !missionRuntime.canProcessEvents()) return;
        await ensureTutorialMissionCatalog();
        if (!profileRef.current) {
          const user = await localGame.auth.me();
          profileRef.current = await ensureMyProfile(user);
        }
        const objective = ROUTE_OBJECTIVES[location.pathname];
        if (!cancelled && objective && profileRef.current?.id) await incrementMissionProgress(profileRef.current.id, objective, 1, profileRef.current.career_date);
      } catch (error) { console.error('tutorial tracker', error); }
    })();
    return () => { cancelled = true; };
  }, [location.pathname, loading, navigationType]);

  return null;
}
