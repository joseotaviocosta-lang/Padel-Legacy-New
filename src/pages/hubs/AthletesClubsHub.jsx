import React, { lazy } from 'react';
import { UserCog, Building2, Globe2 } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Parte P — "Atletas" (190 linhas) e "Clubes" (135) são
// diretórios do mesmo circuito, com busca própria cada. Viram abas de uma só
// entrada; a busca de cada página continua funcionando como está.
//
// Playthrough 5.22-E, Partes AB/AC/AD — "Países" entra como terceira aba
// (diretório/estatística real). Os badges "países"/"clubes" do cabeçalho do
// Ranking apontam para cá (?tab=countries / ?tab=clubs).
const Athletes = lazy(() => import('@/pages/Athletes'));
const Clubs = lazy(() => import('@/pages/Clubs'));
const Countries = lazy(() => import('@/pages/Countries'));

export default function AthletesClubsHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'athletes', label: 'Atletas', icon: UserCog, component: Athletes },
        { key: 'clubs', label: 'Clubes', icon: Building2, component: Clubs },
        { key: 'countries', label: 'Países', icon: Globe2, component: Countries },
      ]}
    />
  );
}
