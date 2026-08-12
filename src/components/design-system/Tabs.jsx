import React from 'react';
import { Tabs as TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * Abas oficiais do Design System 2.0. Formaliza o padrão "pílula segmentada"
 * (antes duplicado como `TabBar`/`FilterPills` em padel/ui.jsx) sobre o
 * primitive acessível @radix-ui/react-tabs, com rolagem horizontal só
 * quando necessário (auditoria UI/UX, seção 12).
 *
 * Uso simples (troca controlada, painel renderizado à parte):
 *   <Tabs tabs={[{key,label,icon,count}]} activeTab={tab} onTabChange={setTab} />
 *
 * Uso composto (conteúdo dentro do próprio Tabs): use os exports nomeados
 * TabsRoot/TabsList/TabsTrigger/TabsContent diretamente.
 */
export function Tabs({ tabs, activeTab, onTabChange, variant = 'segmented', className }) {
  return (
    <TabsRoot value={activeTab} onValueChange={onTabChange} className={cn('min-w-0', className)}>
      <TabsList
        className={cn(
          'h-auto w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/55 p-1 scrollbar-none',
          variant === 'buttons' && 'gap-2 border-none bg-transparent p-0',
        )}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className={cn(
                'min-w-max shrink-0 gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-muted-foreground shadow-none transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
                variant === 'segmented' && 'flex-1',
                variant === 'buttons' && 'bg-secondary/50 data-[state=active]:bg-primary/15 data-[state=active]:text-primary',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && <span className="text-[10px] opacity-60">({tab.count})</span>}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </TabsRoot>
  );
}

export { TabsRoot, TabsList, TabsTrigger, TabsContent };
