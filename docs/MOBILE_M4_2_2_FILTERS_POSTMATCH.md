# M4.2.2 — Mobile Filters + Post-Match Flow Hotfix

Hotfix pós-validação física da M4.2.1: filtros/tabs comprimidos em vários
ecrãs mobile (Loja e Economia em especial) e um CTA de fim de partida
treino ("Jogar Novamente") que prometia algo que o jogo não entregava
(limite diário já esgotado).

## Parte A — Auditoria: causa raiz é compartilhada, não isolada

Três implementações independentes do mesmo bug, todas sem `shrink-0` nos
itens da faixa de filtro (flexbox comprime em vez de rolar):

- `src/components/design-system/Tabs.jsx` (`variant="segmented"`) —
  `flex-1` incondicional em cada trigger, forçando divisão igual da
  largura independente do tamanho do label. Afeta 9 páginas (Admin,
  CalendarPage, CharacterEditor, HallOfFame, History, Missions, Ranking,
  Tournaments, Training).
- `src/components/padel/ui.jsx`'s `FilterPills` — pré-existente,
  compartilhado por 6 páginas legadas (Fans, HallOfFame, History,
  Relationships, Weather, WorldEvents) + `WorldFeed.jsx`.
- Loja (`Shop.jsx`), Economia (`Economy.jsx`) e Comunicações
  (`Communications.jsx`) — cada uma reimplementava a própria faixa de
  pílulas manualmente, com o mesmo bug duplicado 3 vezes.

## Parte B/C/D/E — Padrão único de filtro/tab mobile

Correção consolidada em vez de página por página:

- `Tabs.jsx`: `flex-1` só a partir de `sm:` (`sm:flex-1`) — mobile usa o
  dimensionamento por conteúdo já existente na classe base
  (`min-w-max shrink-0`); desktop/tablet mantém o preenchimento igual.
- Novo componente canónico `src/components/design-system/FilterPills.jsx`
  — faixa horizontal (`flex-nowrap overflow-x-auto`), cada item com
  `shrink-0 whitespace-nowrap`, `py-2` (alvo de toque 40-44px, Parte E),
  scroll touch nativo (`WebkitOverflowScrolling`), sem scrollbar visível.
  `padel/ui.jsx`'s `FilterPills` recebeu a mesma correção de raiz
  (`shrink-0`) e foi mantida para os 6 consumidores legados.
- Loja/Economia/Comunicações migradas para o `FilterPills` do
  design-system (ver nota de arquitetura abaixo). HUD da Economia
  (Saldo/Patrocínios/Equipe-mês/Investimentos) não foi tocado — só a
  faixa de tabs.

### Nota de arquitetura — `padel/ui.jsx` é proibido para Loja

`Shop.jsx` está na lista de páginas que os testes pré-existentes
`test:career-ui-v2` e `test:ui-redesign` proíbem explicitamente de
importar de `@/components/padel/ui` (migração anterior "Design System
2.0"/"Carreira"). Por isso o `FilterPills` canónico foi criado em
`design-system/`, não reaproveitado de `padel/ui.jsx` — Loja, Economia e
Comunicações importam de `@/components/design-system`.

## Parte F/G/H/I — CTA de fim de partida treino

`getPostMatchPrimaryAction(profile)` (`src/components/matches/SimulationModal.jsx`,
função pura exportada) decide o CTA a partir do estado real
pós-finalização — nunca uma segunda fonte de verdade:

```js
export function getPostMatchPrimaryAction(profile) {
  if (canPlayMatchToday(profile).allowed) {
    return { key: 'play-again', label: 'Jogar Novamente' };
  }
  return { key: 'back-to-career', label: 'Voltar para a carreira' };
}
```

`canPlayMatchToday` (`src/lib/padel.js`) já é a fonte única do limite
diário (`DAILY_MATCH_LIMIT = 1`, inalterado). O `profile` do
`SimulationModal` já era corretamente atualizado via `setProfile(updated)`
logo após `finalizePracticeMatch` — não havia stale state a corrigir na
raiz (auditado, não havia bug de timing). O botão "Voltar para a
carreira" fecha o modal (`onClose`) e navega para a Home (`navigate('/')`).
`TournamentModal.jsx` é um ficheiro/fluxo totalmente separado e não foi
tocado — o próprio CTA de torneio permanece intacto.

## Parte J/K/L — Testes

`test:mobile-filters-postmatch-m4-2-2` (novo, 24 gates, híbrido
estrutural + comportamental via pipeline real) cobre os 17 casos exigidos
mais regressões/bónus: Loja e Economia usam o mesmo `FilterPills`, nunca
de `padel/ui.jsx`; `shrink-0`/`whitespace-nowrap`/`overflow-x-auto`
presentes; alvo de toque preservado; CTA nunca é "Jogar Novamente" com o
limite consumido; navegação/fecho corretos; sem duplicação de XP/moedas/
histórico; `TournamentModal.jsx` intocado; dia seguinte libera
normalmente.

Regressão (todas exit 0): `lint`, `test:training-v2`,
`test:mobile-training-game-experience-m4-2-1`,
`test:training-economy-m4-2-1`, `test:match-integrity`,
`test:mobile-m3-live-match`, `test:match-launch-pipeline`,
`test:career-systems`, `test:mobile-compact-ux-m4`,
`test:mobile-game-app-experience-m4-2`,
`test:mobile-visual-hotfix-m4-1-3`, `test:career-ui-v2`,
`test:ui-redesign`, `test:global-market`, `test:sports-economy`,
`test:coach-market-curation`, `build`.

`test:premium-market-v33` falha por uma checagem de versão hardcoded
(`pkg.version !== '0.9.0-beta.8'`) contra a versão real atual
(`0.9.0-rc.1.9`) — pré-existente, sem relação com esta fase, não
corrigido (fora de escopo).

## Parte M — Typecheck

Baseline pós-M4.2.1: 2036. `FilterPills.jsx` (novo) inicialmente causava
+3 erros nos 3 novos pontos de chamada (Loja/Economia/Comunicações) pelo
mesmo padrão sistémico já presente em todo o design-system (prop
opcional sem valor default é inferida como obrigatória sob `checkJs`,
afetando `StatCard`/`StatusBadge`/etc. em centenas de outros pontos).
Corrigido no próprio componente novo (`className = ''`), sem tocar
componentes pré-existentes — resultado final: **2036, delta líquido
zero**.

## Não alterado

Gameplay, RNG, economia, progressão, limite de 1 partida treino/dia,
fluxo/CTA de torneio, formato de save, persistência M3.7, Match/Rally
Engine, Live Coach, checkpoint/resume, bracket de torneio, tutorial,
mercado de treinadores/salários, sidebar, branding, ciclo de vida
Android, fundação responsiva, estrutura do Design System.
