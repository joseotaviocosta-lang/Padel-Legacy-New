import React, { lazy } from 'react';
import { Award, Calendar } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Partes J/K — "Calendário" (631 linhas) saiu do sidebar, mas
// NÃO pode ficar acessível apenas por URL: a Parte AL exige que o conteúdo
// continue alcançável. A Parte J dá as duas opções (subaba de Torneios ou
// modal); subaba mantém o calendário na mesma página de competição, que é onde
// o jogador decide inscrição.
const Tournaments = lazy(() => import('@/pages/Tournaments'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));

export default function CompeteHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'tournaments', label: 'Torneios', icon: Award, component: Tournaments },
        { key: 'calendar', label: 'Calendário', icon: Calendar, component: CalendarPage },
      ]}
    />
  );
}
