import React, { Suspense, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, PageSkeleton } from '@/components/design-system';

/**
 * Playthrough 5.20, Partes E/F/G/H/AI — HUB CONSOLIDADO.
 *
 * A auditoria da Parte A mediu 38 itens no menu, 11 só em "Carreira". Várias
 * dessas páginas são pequenas (Relacionamentos 141 linhas, Fãs 157, Centro de
 * treinamento 139) e existem apenas para um bloco de informação — exatamente o
 * que o princípio de design desta fase manda evitar.
 *
 * Este componente agrupa páginas JÁ EXISTENTES em abas, sem reescrever
 * nenhuma delas: cada aba renderiza o componente de página original, carregado
 * sob demanda. Consequências:
 *
 *   - nenhuma funcionalidade é perdida (Parte AL) — é a mesma página;
 *   - a aba vive na URL (`?tab=`), então todo link antigo pode redirecionar
 *     para o lugar exato (Parte AH) e deep links de notificação continuam
 *     chegando no contexto certo (Parte AG);
 *   - usa o `Tabs` do design system, que já é acessível (Radix) e já resolve
 *     rolagem horizontal no mobile — nada de um quarto padrão de abas
 *     (Parte AI).
 *
 * O painel ativo é o único montado: consolidar não pode custar render extra
 * (Parte AQ).
 */
export default function ConsolidatedHub({ tabs, defaultTab = null, paramName = 'tab' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const available = useMemo(() => (tabs || []).filter(Boolean), [tabs]);
  const fallback = defaultTab || available[0]?.key || '';
  const requested = searchParams.get(paramName);
  const normalizedRequested = requested && ['interviews', 'journalists', 'feed'].includes(requested) ? 'press' : requested;
  const activeKey = available.some((tab) => tab.key === normalizedRequested) ? normalizedRequested : fallback;

  const handleChange = useCallback((key) => {
    const next = new URLSearchParams(searchParams);
    next.set(paramName, key);
    // `replace` evita empilhar uma entrada de histórico por toque de aba —
    // no mobile isso transformava o botão "voltar" num percurso pelas abas.
    setSearchParams(next, { replace: true });
  }, [paramName, searchParams, setSearchParams]);

  const active = available.find((tab) => tab.key === activeKey) || available[0];
  const Panel = active?.component || null;

  if (!available.length) return null;

  return (
    <>
      {available.length > 1 ? (
        // Hotfix 5.31-B: a barra de abas do hub ficava FORA do <Page> (o
        // respiro lateral só existe dentro do painel), então no celular ia de
        // borda a borda e "Treinador" encostava na tela. Mesmo respiro e
        // largura máxima do Page (--space-page-x / max-w-[92rem]).
        <div className="mx-auto w-full min-w-0 max-w-[92rem]" style={{ paddingLeft: 'var(--space-page-x)', paddingRight: 'var(--space-page-x)', paddingTop: 'var(--space-page-y)' }} data-hub-tabs>
          <Tabs
            tabs={available.map(({ key, label, icon, count }) => ({ key, label, icon, count }))}
            activeTab={activeKey}
            onTabChange={handleChange}
          />
        </div>
      ) : null}
      <Suspense fallback={<PageSkeleton />}>
        {Panel ? <Panel /> : null}
      </Suspense>
    </>
  );
}
