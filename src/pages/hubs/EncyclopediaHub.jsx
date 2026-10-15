import React, { lazy } from 'react';
import { BookOpen, History } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Parte S — "História do padel" (147 linhas) é conteúdo de
// enciclopédia, não área própria do menu. A Parte S manda mover para lá.
const Encyclopedia = lazy(() => import('@/pages/Encyclopedia'));
const HistoryPage = lazy(() => import('@/pages/History'));

export default function EncyclopediaHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'encyclopedia', label: 'Enciclopédia', icon: BookOpen, component: Encyclopedia },
        { key: 'history', label: 'História do padel', icon: History, component: HistoryPage },
      ]}
    />
  );
}
