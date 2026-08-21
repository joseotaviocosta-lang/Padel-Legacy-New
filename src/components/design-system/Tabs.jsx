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
    <TabsRoot value={activeTab} onValueChange={onTabChange} className={cn('pl-game-tabs min-w-0', className)}>
      {/* M4.1.3 (docs/MOBILE_M4_1_3_VISUAL_HOTFIX.md, Parte 6): QA físico
          mostrou a última aba cortada na borda (ex.: "Tático..." em
          Treinos). overflow-x-auto/min-w-max/scrollbar-none já existiam,
          mas nada tornava `flex-nowrap` explícito nem dava folga depois da
          última aba — sem isso, ela fica encostada no canto arredondado do
          container e lê como "cortada" mesmo quando tecnicamente
          scrollável. pr- extra (em vez de aumentar p-1/gap-1 do resto)
          só afeta a ponta da lista. */}
      <TabsList
        className={cn(
          'h-auto w-full min-w-0 flex-nowrap justify-start gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/55 p-1 pr-3 scrollbar-none',
          variant === 'buttons' && 'gap-2 border-none bg-transparent p-0 pr-3',
        )}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className={cn(
                // pl-tab-trigger (Fase M1): eleva a área de toque mínima
                // para 44px sob mobile — ver src/index.css.
                'pl-tab-trigger min-w-max shrink-0 whitespace-nowrap gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-muted-foreground shadow-none transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
                // M4.2.2 (docs/MOBILE_M4_2_2_FILTERS_POSTMATCH.md, Parte A/B):
                // achado real — `flex-1` incondicional forçava TODA aba a
                // dividir a largura igualmente, o mesmo anti-padrão de
                // "grid-cols-N" que o briefing pede pra evitar (labels como
                // "Investimentos"/"Oportunidades" ficavam espremidas pra
                // caber no mesmo espaço de "Fluxo"). `min-w-max shrink-0`
                // (base, acima) já garante largura por conteúdo + rolagem —
                // `flex-1` só volta a partir de `sm:` (telas com espaço de
                // sobra), preservando o preenchimento uniforme no desktop
                // sem comprimir nada no mobile.
                variant === 'segmented' && 'sm:flex-1',
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
