import React, { lazy } from 'react';
import { GraduationCap, Users } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Parte G — "Treinador principal" (420 linhas) e "Comissão
// técnica" (220) tratam do mesmo assunto: quem trabalha para o atleta. A
// comissão não precisa de entrada separada do treinador.
const Coaches = lazy(() => import('@/pages/Coaches'));
const Staff = lazy(() => import('@/pages/Staff'));

export default function TeamHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'coach', label: 'Treinador', icon: GraduationCap, component: Coaches },
        { key: 'staff', label: 'Comissão', icon: Users, component: Staff },
      ]}
    />
  );
}
