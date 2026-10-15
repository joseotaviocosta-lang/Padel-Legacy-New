import React, { lazy } from 'react';
import { Newspaper, Globe, Mic, MessageCircle } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Partes N/O — "Mundo" tinha 7 entradas. Quatro delas são
// conteúdo editorial do mesmo tipo: Notícias (184 linhas), Eventos mundiais
// (199), Imprensa (594) e Comunidade (174). A Parte O proíbe quatro páginas
// para conteúdo parecido e pede filtros em vez de sidebar — as abas aqui SÃO
// esses filtros, com a vantagem de cada uma manter sua página real intacta.
const Journal = lazy(() => import('@/pages/Journal'));
const WorldEvents = lazy(() => import('@/pages/WorldEvents'));
const Press = lazy(() => import('@/pages/Press'));
const Community = lazy(() => import('@/pages/Community'));

export default function CircuitCentralHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'news', label: 'Notícias', icon: Newspaper, component: Journal },
        { key: 'circuit', label: 'Circuito', icon: Globe, component: WorldEvents },
        { key: 'press', label: 'Imprensa', icon: Mic, component: Press },
        { key: 'community', label: 'Comunidade', icon: MessageCircle, component: Community },
      ]}
    />
  );
}
