# Fase 6 — Carreira: Atleta, Dupla, Comissão Técnica, Equipamentos e Estatísticas

Redesign de apresentação das 5 telas ligadas à identidade e evolução do
atleta. Sem alteração de atributos, progressão, XP, lado dominante, estilos,
regras de dupla, salários, contratos, efeitos da comissão, equipamentos,
economia, saves, Match Engine, ranking ou tutorial — apenas apresentação,
organização, hierarquia e UX, seguindo o Design System 2.0 já consolidado
nas Fases 2–5 (ver `docs/DESIGN_SYSTEM_V2.md` e `docs/CORE_GAMEPLAY_UI.md`).

## 6.1 Atleta — `src/pages/PlayerProfile.jsx`

- Migrado de `LoadingScreen` (padel/ui) para `PageSkeleton`.
- Identidade premium expandida: o `Surface variant="elevated"` do topo (avatar,
  nível, estilo, bio, barra de XP) ganhou uma segunda linha de fatos rápidos —
  origem, lado + mão dominante, pontos de ranking e condição física — usando
  apenas dados já presentes no `PlayerProfile` (`preferred_side`, `handedness`,
  `rank_points`/`ranking_points`, `form`). Nenhum fetch novo foi adicionado
  (ranking mundial completo — `getWorldRank()` — já é calculado uma vez no
  `AppLayout`/header global; reexecutá-lo aqui duplicaria uma consulta de até
  1500 registros, por isso o resumo usa os pontos já carregados no profile).
- Link "Personalizar aparência" para `/character` (CharacterEditor já
  existente) — nenhum editor novo foi criado, conforme seção 8.
- Atributos reorganizados em 3 grupos de leitura rápida (Técnicos, Mentais,
  Físicos) usando os 10 atributos reais do projeto — nenhum atributo novo.
- "Evolução recente" (seção 7) foi deliberadamente omitida: não existe
  histórico de atributos armazenado e a regra do prompt proíbe inventar
  cálculo caro para simular isso.
- Botão de editar perfil e cabeçalho migrados para `Button`/`PageHeader`.

## 6.2 Dupla — `src/pages/PartnerHub.jsx` + `src/components/partner/*`

- `PartnerHub.jsx`: `LoadingScreen`/`EmptyStateCard` → `PageSkeleton`/`EmptyState`;
  abas (Propostas, Buscar, Minha dupla, Caixa de Entrada, Assessores,
  Contrato, Histórico) migradas para o `Tabs` oficial (com badge de
  não-lidas no `count` da aba Caixa de Entrada); `ConverseModal` deixou de
  ser um modal cru (`fixed inset-0`) e passou a usar `ModalShell`;
  `ContractPanel`/`PartnerHistory` migrados para `Surface`/`Button`/`ProgressBar`.
- `PartnerOverview.jsx` (o "card principal da dupla", seção 10): convertido
  para `Surface`, e ganhou um indicador explícito de compatibilidade de
  lados (seção 11) — "✓ Lados complementares" ou "⚠ Parceiro atua fora do
  lado ideal" — usando o `compatibility_breakdown.position` que o sistema de
  parceria já calcula (nenhuma penalidade nova, nenhum recalculo).
- `PartnerNegotiationModal.jsx` e `InboxPanel.jsx`: botão de rodapé e
  `LoadingScreen` migrados para `Button`/`PageSkeleton`.
- `PartnerSearch.jsx`, `AdvisorPanel.jsx`, `PartnerOffersPanel.jsx`: já
  continham boa cobertura de lado/compatibilidade (usados como base para o
  indicador acima) e foram deixados com toque leve — não usam mais nenhuma
  biblioteca-sombra, então o risco de retocar sua marcação interna não
  compensava o ganho nesta fase.

## 6.3 Comissão Técnica — `src/pages/Staff.jsx`, `src/pages/Coaches.jsx`, `src/components/economy/StaffPanel.jsx`, `src/components/coaches/*`

- `Staff.jsx` e `Coaches.jsx` já usavam o design-system nas fases anteriores;
  restava só o `LoadingScreen` de `Staff.jsx`, migrado para `PageSkeleton`.
- `StaffPanel.jsx` (maior peça desta área): `GlassCard`/`EmptyStateCard`
  (padel/ui) → `Surface`/`EmptyState`; as 5 sub-abas (Minha comissão, Mercado
  mensal, Instalações, Sinergias, Relatórios) migradas para `Tabs`; todos os
  botões de contratar/renovar/demitir/melhorar migrados para `Button`.
  Demissão de profissional passou a exigir um segundo clique de confirmação
  (padrão já usado em `ContractPanel` da Dupla) em vez de agir
  instantaneamente — sem usar `window.confirm`, conforme a regra da seção 17.
- `CoachCard.jsx`/`CoachDetail.jsx`: botões crus → `Button`. O técnico
  principal já era destacado visualmente em `Coaches.jsx` (bloco "Técnico
  atual" com `Surface tone="brand"`) e o comparativo de competências entre
  técnico atual/candidato (`CoachComparison`) já existia — mantidos como
  referência de "profissional mais importante" (seção 15).

## 6.4 Equipamentos — `src/pages/Inventory.jsx`, `src/pages/Shop.jsx`, `src/components/shop/*`

- `Inventory.jsx`: `LoadingScreen` → `PageSkeleton`; novo bloco "Equipado
  agora" no topo, organizado pelos 4 slots principais (Raquete, Tênis, Roupa,
  Acessório — seção 19/20), mostrando o item equipado (ou "Vazio") e seus
  bônus por slot, antes da lista completa por categoria. Botões
  Equipar/Desequipar/Vender migrados para `Button`.
- `Shop.jsx`: `LoadingScreen` → `PageSkeleton`; alternância Loja/Equipados
  migrada para `Tabs` (separação clara entre Loja, Inventário e Equipados —
  seção 23); botão "Carregar mais" migrado para `Button`.
- `ItemDetailModal.jsx`: novo bloco de comparação "Atual vs Novo" (seção 21)
  quando o jogador já tem um item equipado na mesma categoria — mostra o
  delta de cada bônus de atributo, reaproveitando os bônus já calculados
  (`attribute_bonus`), sem nenhum cálculo novo além do que a loja já fazia.
  Botão de compra migrado para `Button`.
- `EquippedView.jsx`: banner informativo e empty state migrados para
  `Surface`/`EmptyState`.
- Mobile (seção 24): a comparação foi mantida dentro do `ModalShell`
  existente (já usado por `CoachDetail`, `PartnerOffersPanel` e
  `InboxPanel` para o mesmo tipo de comparação/decisão) em vez de um
  `BottomSheet` dedicado — decisão deliberada de consistência: todas as
  telas de Carreira já convergem para o mesmo padrão de modal de decisão, e
  o `ModalShell` já ocupa quase a tela cheia em telas pequenas.
- `RarityBadge`/`RARITY_STYLES` (padel/GameShared) foram mantidos como estão
  — já implementam a raridade real do projeto (comum/incomum/raro/épico/
  lendário/mítico/exclusivo) com cores próprias por nível; recriar isso com
  `StatusBadge` genérico perderia fidelidade sem ganho real (mesma decisão
  que a Fase 5 tomou para `getAttributeIcon`).

## 6.5 Estatísticas — `src/pages/CareerStats.jsx`

- Migração completa para fora do padel/ui: `PageContainer` → `Page`/
  `PageContent`; todos os `GlassCard` → `Surface`; `EmptyStateCard` →
  `EmptyState`; `LoadingScreen` → `PageSkeleton`.
- Alternância "Carreira completa" / "Temporada atual" migrada para `Tabs`.
- Gráficos (Radar de atributos, Pizza de vitórias/derrotas via Recharts,
  já usado antes) mantidos sem alteração — já eram a leitura visual certa
  para essas duas métricas (seção 30) e nenhuma biblioteca nova foi
  adicionada.
- Resumo do topo (Partidas, Aproveitamento, Sequência, Overall, Títulos,
  Finais, Melhor sequência, Derrotas) já cobria a seção 26 e foi preservado.
- Histórico por temporada (seção 28) permanece como alternância
  Carreira/Temporada atual — o projeto não mantém um registro de temporadas
  passadas navegável nesta página, e a regra do prompt proíbe recalcular
  temporadas inteiras no render só para simular um seletor.

## Comportamento mobile

Nenhuma tela ganhou um layout mobile separado: todos os componentes do
Design System 2.0 usados (`Tabs`, `Surface`, `Button`, `EmptyState`,
`PageSkeleton`, `ModalShell`) já são responsivos por padrão desde a Fase 2.
Grids novos (resumo de identidade do Atleta, slots de Equipamentos) usam
`grid-cols-2` no mobile e expandem em `sm:`/`lg:`, seguindo o mesmo padrão
das StatCard grids das fases anteriores.

## Componentes migrados/aplicados nesta fase

`Page`, `PageContent`, `PageHeader`, `PageSkeleton`, `Surface`,
`SurfaceHeader`, `EmptyState`, `Tabs`, `Button`, `ModalShell`, `StatusBadge`,
`ProgressBar`, `StatCard` — todos já existiam desde a Fase 2; esta fase foi,
para a maior parte, a primeira aplicação real em Dupla, Comissão Técnica e
Estatísticas.

## Performance

- Nenhum fetch novo, nenhum `setInterval` novo (verificado por
  `scripts/test-career-ui-v2.mjs`, bloco "Transversal").
- A única tentação de fetch novo (popularidade do atleta, via `FanBase`) foi
  descartada deliberadamente para não duplicar consulta — ver seção 6.1.
- `ItemDetailModal`'s comparação reaproveita dados já carregados em
  `Shop.jsx` (`items`, `equippedItems`), sem nova consulta.

## Bundles (chunk final, `npm run build`)

| Página | Tamanho | Gzip |
|---|---|---|
| PlayerProfile | 12.94 kB | 4.57 kB |
| PartnerHub | 58.25 kB | 16.07 kB |
| Staff | 29.91 kB | 8.99 kB |
| Coaches | 29.13 kB | 8.29 kB |
| Inventory | 8.11 kB | 3.18 kB |
| Shop | 62.82 kB | 18.92 kB |
| CareerStats | 14.01 kB | 4.93 kB |

Não foi feito um build "antes" isolado desta fase (evitar `git stash` de
~40 arquivos não commitados das Fases 1–5 só para medir bytes). Como proxy
seguro, o diff desta fase soma **364 inserções / 282 remoções em 14
arquivos** (`git diff --stat`) — trocas majoritariamente 1:1 de marcação
crua por componentes do design-system, sem novas dependências.

## Testes executados

- `npm run test:career-ui-v2` (novo) — 70/70 ✓
- `npm run test:ui-redesign` — 180/180 ✓ (subiu de 167, nova seção 14)
- `npm run test:ui-performance` — 16/16 ✓
- `npm run test:player-builds`, `test:partnerships-v29`, `test:coaches-v28`,
  `test:staff-architecture`, `test:career-systems` — todos passam, exceto
  uma falha pré-existente e não relacionada em `test:coaches-v28`
  ("impacto real em partidas", que audita `SimulationModal.jsx` — arquivo
  não tocado em nenhuma fase deste redesign).
- `npm run lint` — limpo.
- `npm run build` — limpo.
- `npm run typecheck` — 2181 diagnósticos (+69 sobre a baseline de 2112 da
  Fase 5), confirmado por amostragem como o mesmo padrão pré-existente
  (props `children`/`padding` sem tipagem em `Button`/`Surface`, e uma
  função utilitária não tocada em `StaffPanel.jsx`) — nenhuma classe de erro
  nova.

## Regressões encontradas

Nenhuma.

## Dívidas técnicas restantes

- `PartnerSearch.jsx`, `AdvisorPanel.jsx`, `PartnerOffersPanel.jsx`,
  `StaffLivePanel.jsx` (este último já usa o design-system) ainda misturam
  `glass rounded-2xl` cru com componentes oficiais — funcionais e já sem
  bibliotecas-sombra, mas não 100% migrados para `Surface`.
- `RarityBadge`/`getAttributeIcon` (padel/GameShared, padel/Shared)
  permanecem como utilitários reaproveitados, não substituídos — decisão
  deliberada, não pendência.
- Filtros de mercado (`StaffPanel` mercado mensal, `Shop.jsx` filtros
  avançados) continuam com `<select>` nativo — não existe um componente de
  select do design-system ainda.
