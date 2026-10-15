import React, { lazy } from 'react';
import { Trophy, BarChart3 } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Parte L — "Temporada" é a página mais fina do menu inteiro
// (78 linhas) e seu conteúdo é progresso/resultados da temporada. A Parte L
// aponta Ranking, Estatísticas ou Home como destinos; Ranking é o mais próximo,
// porque é onde o progresso competitivo já é lido.
const Ranking = lazy(() => import('@/pages/Ranking'));
const Season = lazy(() => import('@/pages/Season'));

export default function RankingHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'ranking', label: 'Ranking', icon: Trophy, component: Ranking },
        { key: 'season', label: 'Temporada', icon: BarChart3, component: Season },
      ]}
    />
  );
}
