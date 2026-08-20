import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { LEGACY_AREA_TO_GROUP, NAV_GROUPS } from '@/navigation/navigationConfig.js';
import { CompactListItem, Page, PageContent, PageHeader } from '@/components/design-system';

// Renderiza a página de hub das 4 rotas legadas (/development, /team-hub,
// /competitions, /management — ver App.jsx). `areaId` é o identificador
// histórico da rota, traduzido para o grupo correspondente da nova
// arquitetura de navegação via LEGACY_AREA_TO_GROUP (docs/NAVIGATION_ARCHITECTURE.md).
//
// M4.2 (docs/MOBILE_M4_2_GAME_APP_EXPERIENCE.md, Parte 19/20): este é o
// "Career Hub"/"Competir Hub"/"Gestão Hub" pedido pelo briefing — os três
// (mais o alias de equipe) já compartilhavam este componente, só que como
// um grid de cards grandes (ArrowRight + Surface, 1 card por item), a
// "outra tela cheia de cards" que o briefing pede pra evitar. Convertido
// para linhas compactas (CompactListItem, mesmo primitive de inbox/lista
// usado em Comunicações/Concluídas) — mesmos itens, mesmas rotas, mesmo
// ícone por item, só a densidade visual mudou. Nenhuma rota nova, nenhum
// dado novo buscado.
export default function NavigationHub({ areaId: requestedAreaId }) {
  const { areaId: parameterAreaId } = useParams();
  const legacyAreaId = requestedAreaId || parameterAreaId;
  const groupId = LEGACY_AREA_TO_GROUP[legacyAreaId] || legacyAreaId;
  const group = NAV_GROUPS.find((item) => item.id === groupId);
  if (!group || group.id === 'home') return <Navigate to="/game" replace />;
  const Icon = group.icon;
  return (
    <Page size="default">
      <PageContent>
        <PageHeader
          dense
          icon={Icon}
          title={group.label}
          description={group.description}
          eyebrow="Central da carreira"
          tone="brand"
          breadcrumb={['Início', group.label]}
        />
        <div className="overflow-hidden rounded-2xl border border-border/60 divide-y divide-border/40">
          {group.items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <CompactListItem
                key={item.to}
                to={item.to}
                leading={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary"><ItemIcon className="h-4.5 w-4.5 text-primary" /></span>}
                title={item.label}
              />
            );
          })}
        </div>
      </PageContent>
    </Page>
  );
}
