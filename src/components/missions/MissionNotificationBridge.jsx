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
      // Tutorial 4.1 (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md,
      // Parte E): a primeira partida oficial é um marco, não o fim do
      // tutorial — reaproveita este mesmo toast genérico (nenhum banner
      // novo, Parte M) só trocando a cópia e o CTA para a próxima etapa
      // (comissão técnica), em vez do texto padrão "Tutorial: {título}".
      if (tutorial && mission.id === 'tutorial-first-match') {
        toast({
          title: 'Primeira partida oficial concluída',
          description: 'Você aprendeu o ciclo básico: preparar, inscrever-se e competir.',
          action: <ToastAction onClick={() => navigate('/staff')}>Continuar conhecendo a carreira</ToastAction>,
        });
        return;
      }
      toast({
        title: tutorial ? `Tutorial: ${mission.title}` : `Missão concluída: ${mission.title}`,
        description,
        action: tutorial ? <ToastAction onClick={() => navigate('/game/missions')}>Ver próximo passo</ToastAction> : undefined,
      });
    };
    window.addEventListener('padel:mission-completed', handler);
    return () => window.removeEventListener('padel:mission-completed', handler);
  }, [navigate]);

  // Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 13):
  // conquistas notificam quando desbloqueadas (achievementEngine.js dispara
  // este evento só em unlocks ao vivo reais — nunca em reconciliação de
  // save antigo, nunca por rotina/visita de rota).
  //
  // Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte 52-54): (1) só conquistas de
  // "grande marco" chegam ao sino (Central de Notificações) — as demais
  // ficam só no toast local, o sino não vira feed trivial de cada conquista
  // pequena; (2) múltiplos unlocks no mesmo evento (ex.: reconciliação
  // pontual, ou uma partida que bate 2 marcos de uma vez) viram UMA
  // notificação agrupada, nunca N.
  useEffect(() => {
    const isGrandMilestone = (achievement) => (
      (achievement.trigger_type === 'reach_rank' && achievement.threshold <= 500)
      || (achievement.trigger_type === 'win_tournament' && achievement.threshold === 1)
      || ['lendário', 'mitico', 'exclusivo'].includes(achievement.rarity)
    );
    const handler = (event) => {
      const achievements = (event.detail?.achievements || []).filter((achievement) => {
        const key = `achievement:${profileRef.current?.id || 'profile'}:${achievement.id}`;
        if (shownNotifications.has(key)) return false;
        shownNotifications.add(key);
        return true;
      });
      if (!achievements.length) return;

      if (achievements.length === 1) {
        const [achievement] = achievements;
        const parts = [];
        if (Number(achievement.xp_reward) > 0) parts.push(`+${achievement.xp_reward} XP`);
        if (Number(achievement.coins_reward) > 0) parts.push(`+${achievement.coins_reward} moedas`);
        if (achievement.medal_reward) parts.push(`Medalha: ${achievement.medal_reward}`);
        toast({
          title: `Conquista desbloqueada: ${achievement.name}`,
          description: parts.length ? parts.join(' · ') : achievement.description,
          action: <ToastAction onClick={() => navigate('/game/missions?tab=achievements')}>Ver conquistas</ToastAction>,
        });
      } else {
        toast({
          title: `${achievements.length} conquistas desbloqueadas`,
          description: achievements.slice(0, 3).map((a) => a.name).join(' · ') + (achievements.length > 3 ? '…' : ''),
          action: <ToastAction onClick={() => navigate('/game/missions?tab=achievements')}>Ver conquistas</ToastAction>,
        });
      }

      const milestones = achievements.filter(isGrandMilestone);
      if (milestones.length && profileRef.current?.id) {
        const body = milestones.length === 1
          ? `Você desbloqueou "${milestones[0].name}" — ${milestones[0].description}`
          : `Você desbloqueou ${milestones.length} grandes marcos: ${milestones.map((a) => a.name).join(', ')}.`;
        localGame.entities.CareerMessage.create({
          profile_id: profileRef.current.id,
          sender_name: 'Sua Carreira',
          subject: milestones.length === 1 ? `Conquista: ${milestones[0].name}` : `${milestones.length} conquistas importantes`,
          body,
          status: 'nao_lida',
          message_type: 'achievement_milestone',
          created_date: new Date().toISOString(),
        }).catch(() => {});
      }
    };
    window.addEventListener('padel:achievement-unlocked', handler);
    return () => window.removeEventListener('padel:achievement-unlocked', handler);
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
        // Hotfix "Starter Coach Flow" (docs/STARTER_COACH_FLOW.md, Parte B/G):
        // coaches-known virou kind DECISION (completionType domain_event) —
        // sem este segundo caso, o exclude abaixo deixaria de valer para ele
        // e uma simples visita a /coaches voltaria a completar a etapa
        // (mesmo objectiveType 'visit_coaches' usado pelo ROUTE_OBJECTIVES
        // genérico), reabrindo exatamente o bug que essa etapa existe para
        // corrigir. Só afeta etapas cujo objectiveType colide com uma rota
        // rastreada aqui — hoje, só coaches-known.
        const requiresExplicitConfirmation = currentStep?.objectiveType === objective
          && (currentStep?.completionType === 'confirm_understanding' || currentStep?.kind === 'DECISION');

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
