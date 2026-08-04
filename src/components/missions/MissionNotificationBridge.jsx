import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, ensureTutorialMissionCatalog, incrementMissionProgress } from '@/lib/padel';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useCareer } from '@/careers/useCareer.js';
import { missionRuntime, validateMissionReward } from '@/missions/missionSystem.js';
import { getCurrentTutorialStep } from '@/onboarding/tutorialState.js';

const ROUTE_OBJECTIVES = {
  '/game': 'visit_career',
  '/profile': 'review_profile',
  '/game/missions': 'visit_missions',
  '/character': 'visit_character',
  '/achievements': 'visit_achievements',
  '/game/stats': 'visit_career_stats',
  '/game/legacy': 'visit_legacy',
  '/development': 'visit_development',
  '/game/training': 'review_training_groups',
  '/training-center': 'visit_training_center',
  '/coaches': 'visit_coaches',
  '/game/inventory': 'visit_inventory',
  '/game/shop': 'visit_shop',
  '/team-hub': 'visit_team_hub',
  '/partners': 'review_partner_offer',
  '/relationships': 'visit_relationships',
  '/press': 'visit_press',
  '/fans': 'visit_fans',
  '/competitions': 'visit_competitions',
  '/tournaments': 'visit_tournaments',
  '/game/calendar': 'visit_calendar',
  '/matches': 'visit_matches',
  '/ranking': 'visit_ranking',
  '/game/season': 'visit_season',
  '/world-tour/live': 'visit_live_circuit',
  '/world': 'visit_world_hub',
  '/journal': 'visit_journal',
  '/world-events': 'visit_world_events',
  '/world-market': 'visit_world_market',
  '/weather': 'visit_weather',
  '/athletes': 'visit_athletes',
  '/clubs': 'visit_clubs',
  '/community': 'visit_community',
  '/social': 'visit_social',
  '/encyclopedia': 'visit_encyclopedia',
  '/history': 'visit_history',
  '/hall-of-fame': 'visit_hall_of_fame',
  '/management': 'visit_management',
  '/game/economy': 'visit_economy',
  '/admin': 'visit_admin',
  '/database': 'visit_database',
};

const shownNotifications = new Set();
const routeEvents = new Set();

function normalizedRoute(pathname) {
  if (pathname?.startsWith('/clubs/')) return '/clubs';
  return pathname;
}

export default function MissionNotificationBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { loading, activeCareer } = useCareer();
  const profileRef = useRef(null);

  useEffect(() => {
    const handler = event => {
      const { mission, reward, tutorial } = event.detail || {};
      if (!mission) return;
      const key = event.detail?.notificationKey || `${profileRef.current?.id || 'profile'}:${mission.id}:${event.detail?.cycleId || 'career'}`;
      if (shownNotifications.has(key)) return;
      shownNotifications.add(key);
      const parts = [];
      if (Number(reward?.xp) > 0) parts.push(`+${reward.xp} XP`);
      if (Number(reward?.coins) > 0) parts.push(`+${reward.coins} moedas`);
      if (reward?.medal) parts.push(`Medalha: ${reward.medal}`);
      const description = validateMissionReward(mission).hasReward && parts.length
        ? `${parts.join(' · ')}. Recompensa recebida.`
        : 'Etapa concluída.';
      toast({
        title: tutorial ? `Tutorial: ${mission.title}` : `Missão concluída: ${mission.title}`,
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
        if (!profileRef.current || (activeCareer?.career_id && profileRef.current?.career_id !== activeCareer.career_id)) {
          const user = await localGame.auth.me();
          profileRef.current = await ensureMyProfile(user);
        }
        const route = normalizedRoute(location.pathname);
        const objective = ROUTE_OBJECTIVES[route];
        const profile = profileRef.current;
        if (cancelled || !objective || !profile?.id) return;

        const eventKey = `${profile.id}:${route}:${location.key}`;
        if (routeEvents.has(eventKey)) return;
        routeEvents.add(eventKey);

        const currentStep = getCurrentTutorialStep(profile.tutorial_onboarding);
        const requiresExplicitConfirmation = currentStep?.objectiveType === objective
          && currentStep?.completionType === 'confirm_understanding';

        await incrementMissionProgress(profile.id, objective, 1, profile.career_date, {
          triggerEventId: `route:${eventKey}`,
          excludeMissionTypes: requiresExplicitConfirmation ? ['tutorial'] : [],
        });
      } catch (error) {
        console.error('tutorial tracker', error);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCareer?.career_id, location.key, location.pathname, loading, navigationType]);

  return null;
}
