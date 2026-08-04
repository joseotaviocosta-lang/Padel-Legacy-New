import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { NAVIGATION_AREAS } from '@/navigation/navigationConfig.js';
import { PageContainer, PageHeader } from '@/components/padel/ui';

export default function NavigationHub({ areaId: requestedAreaId }) {
  const { areaId: parameterAreaId } = useParams();
  const areaId = requestedAreaId || parameterAreaId;
  const area = NAVIGATION_AREAS.find(item => item.id === areaId);
  if (!area || area.id === 'career') return <Navigate to="/game" replace/>;
  const Icon = area.icon;
  return <PageContainer>
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground"><Link to="/game">Início</Link><ChevronRight className="h-3 w-3"/><span aria-current="page">{area.label}</span></nav>
    <PageHeader icon={Icon} title={area.label} subtitle={area.description} eyebrow="Central da carreira"/>
    <section aria-labelledby="area-actions-title"><div className="mb-3"><h2 id="area-actions-title" className="text-lg font-black">O que você quer fazer?</h2><p className="text-sm text-muted-foreground">Abra uma função desta área. Nenhuma escolha é obrigatória.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{area.items.map((item, index) => { const ItemIcon = item.icon; return <Link key={item.to} to={item.to} className={`group glass rounded-2xl p-4 transition-all focus-visible:ring-2 focus-visible:ring-primary ${index === 0 ? 'border-primary/40 bg-primary/5 sm:col-span-2 xl:col-span-1' : 'hover:border-primary/30'}`}><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary"><ItemIcon className="h-5 w-5 text-primary"/></span><div className="flex-1"><h3 className="font-bold">{item.label}</h3><p className="text-xs text-muted-foreground">Abrir {item.label.toLowerCase()}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"/></div></Link>; })}</div></section>
  </PageContainer>;
}
