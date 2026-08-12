import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { LEGACY_AREA_TO_GROUP, NAV_GROUPS } from '@/navigation/navigationConfig.js';
import { Page, PageContent, PageHeader, Surface } from '@/components/design-system';

// Renderiza a página de hub das 4 rotas legadas (/development, /team-hub,
// /competitions, /management — ver App.jsx). `areaId` é o identificador
// histórico da rota, traduzido para o grupo correspondente da nova
// arquitetura de navegação via LEGACY_AREA_TO_GROUP (docs/NAVIGATION_ARCHITECTURE.md).
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
          icon={Icon}
          title={group.label}
          description={group.description}
          eyebrow="Central da carreira"
          tone="brand"
          breadcrumb={['Início', group.label]}
        />
        <section aria-labelledby="area-actions-title">
          <div className="mb-3">
            <h2 id="area-actions-title" className="text-lg font-black">O que você quer fazer?</h2>
            <p className="text-sm text-muted-foreground">Abra uma função desta área. Nenhuma escolha é obrigatória.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item, index) => {
              const ItemIcon = item.icon;
              return (
                <Link key={item.to} to={item.to} className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl">
                  <Surface
                    variant="interactive"
                    className={index === 0 ? 'border-primary/40 bg-primary/5 sm:col-span-2 xl:col-span-1' : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary"><ItemIcon className="h-5 w-5 text-primary" /></span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold">{item.label}</h3>
                        <p className="text-xs text-muted-foreground">Abrir {item.label.toLowerCase()}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </div>
                  </Surface>
                </Link>
              );
            })}
          </div>
        </section>
      </PageContent>
    </Page>
  );
}
