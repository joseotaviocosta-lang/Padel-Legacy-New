import React, { lazy } from 'react';
import { User, Palette } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Parte E — "Atleta" (229 linhas) e "Aparência" (202) eram
// duas entradas de menu. Aparência é CONFIGURAÇÃO do atleta, não uma área
// principal da carreira; vira aba. Nenhuma das duas páginas foi reescrita.
const PlayerProfile = lazy(() => import('@/pages/PlayerProfile'));
const CharacterEditor = lazy(() => import('@/pages/CharacterEditor'));

export default function MyAthleteHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'profile', label: 'Perfil', icon: User, component: PlayerProfile },
        { key: 'appearance', label: 'Aparência', icon: Palette, component: CharacterEditor },
      ]}
    />
  );
}
