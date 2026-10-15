import React, { lazy } from 'react';
import { Building2, Package, ShoppingBag } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Parte F — "Centro de treinamento" (139 linhas),
// "Equipamentos" (306) e "Loja" (551) eram três entradas. A Parte F pede que o
// jogador veja o equipado, compare, compre e troque SEM trocar de página.
const TrainingCenter = lazy(() => import('@/pages/TrainingCenter'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const Shop = lazy(() => import('@/pages/Shop'));

export default function TrainingEquipmentHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'training', label: 'Treinos', icon: Building2, component: TrainingCenter },
        { key: 'inventory', label: 'Inventário', icon: Package, component: Inventory },
        { key: 'shop', label: 'Loja', icon: ShoppingBag, component: Shop },
      ]}
    />
  );
}
