import React, { lazy } from 'react';
import { Heart, Users } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Parte H — "Relacionamentos" (141 linhas) e "Fãs e torcidas"
// (157) são as duas páginas mais finas de Carreira. A Parte H pede auditar se
// "Fãs" justifica aba própria: 157 linhas justificam uma ABA, não uma entrada
// de menu.
const Relationships = lazy(() => import('@/pages/Relationships'));
const Fans = lazy(() => import('@/pages/Fans'));

export default function RelationsHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'people', label: 'Pessoas', icon: Heart, component: Relationships },
        { key: 'fans', label: 'Fãs', icon: Users, component: Fans },
      ]}
    />
  );
}
