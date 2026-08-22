import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import WeeklyPlanner from '@/components/training/WeeklyPlanner.jsx';
import { Surface, SurfaceHeader } from '@/components/design-system';
import { APP_ROUTES } from '@/navigation/routes.js';

export default function TrainingAgendaView({ profile, onProfileUpdate }) {
  return (
    <div className="space-y-3" data-training-center-view="agenda">
      <Surface padding="compact">
        <SurfaceHeader
          compact
          icon={CalendarDays}
          title="Agenda de preparação"
          description="Planeje apenas treinos, descanso e preparação; compromissos completos continuam no Calendário."
          action={<Link to={APP_ROUTES.CALENDAR} className="flex min-h-11 items-center justify-center rounded-xl bg-secondary px-3 text-xs font-bold">Ver calendário completo</Link>}
          className=""
          stackActionOnMobile
        />
      </Surface>
      <WeeklyPlanner profile={profile} onPlanSaved={(updated) => onProfileUpdate(updated, 'training-center:weekly-plan')} />
    </div>
  );
}
