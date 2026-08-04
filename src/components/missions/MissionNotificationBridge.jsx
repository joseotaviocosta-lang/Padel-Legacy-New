import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, ensureTutorialMissionCatalog, incrementMissionProgress } from '@/lib/padel';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';

const ROUTE_OBJECTIVES = {
  '/game': 'visit_career', '/character': 'visit_character', '/training-center': 'visit_training_center',
  '/partners': 'visit_partners', '/game/shop': 'visit_shop', '/game/calendar': 'visit_calendar',
  '/tournaments': 'visit_tournaments', '/ranking': 'visit_ranking', '/journal': 'visit_journal',
  '/press': 'visit_press', '/game/economy': 'visit_economy',
};

export default function MissionNotificationBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const shownNotificationsRef = useRef(new Set());

  useEffect(() => {
    const handler = event => {
      const { mission, reward, tutorial } = event.detail || {};
      if (!mission) return;
      const key = `${profileRef.current?.id || 'profile'}:${mission.id}:${event.detail?.completedAt || 'completed'}`;
      if (shownNotificationsRef.current.has(key)) return;
      shownNotificationsRef.current.add(key);
      const description = `+${reward?.xp || 0} XP · +${reward?.coins || 0} moedas${reward?.medal ? ` · Medalha: ${reward.medal}` : ''}`;
      toast({
        title: tutorial ? `Tutorial concluído: ${mission.title}` : `Missão concluída: ${mission.title}`,
        description: `${description}. A recompensa foi recebida automaticamente.`,
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
  }, [location.pathname]);

  return null;
}
