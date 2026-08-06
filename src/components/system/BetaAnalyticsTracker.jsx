import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useCareer } from '@/careers/useCareer.js';
import { finishBetaAnalyticsSession, startBetaAnalytics, trackBetaEvent, trackBetaScreen } from '@/lib/betaAnalytics.js';

const FORWARDED_EVENTS = {
  'padel:day-advanced': 'CALENDAR_ADVANCED',
  'padel:mission-completed': 'MISSION_COMPLETED',
  'padel:communications-created': 'COMMUNICATION_CREATED',
  'padel:communications-updated': 'COMMUNICATION_OPENED',
  'padel:profile-updated': 'PROFILE_UPDATED',
};

export default function BetaAnalyticsTracker() {
  const location = useLocation();
  const { activeCareer } = useCareer();

  useEffect(() => {
    startBetaAnalytics({ careerId: activeCareer?.career_id, pathname: location.pathname });
    trackBetaScreen(location.pathname, { careerId: activeCareer?.career_id });
  }, [activeCareer?.career_id, location.pathname]);

  useEffect(() => {
    const handlers = Object.entries(FORWARDED_EVENTS).map(([eventName, analyticsType]) => {
      const handler = event => trackBetaEvent(analyticsType, event?.detail || {}, { careerId: activeCareer?.career_id, pathname: location.pathname });
      window.addEventListener(eventName, handler);
      return [eventName, handler];
    });
    const onVisibility = () => trackBetaEvent(document.hidden ? 'APP_BACKGROUND' : 'APP_FOREGROUND', {}, { careerId: activeCareer?.career_id, pathname: location.pathname });
    const onUnload = () => finishBetaAnalyticsSession();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      handlers.forEach(([eventName, handler]) => window.removeEventListener(eventName, handler));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [activeCareer?.career_id, location.pathname]);

  return null;
}
