# Mobile M4 — Compact Mobile UX

M4 é uma fase exclusivamente de UX/UI mobile: reorganiza páginas existentes
em torno de "ação principal primeiro, resumo primeiro, detalhe sob
demanda", sem alterar gameplay, RNG, economia, progressão, save,
persistência M3.7 ou regras de calendário/torneio/treino. Nenhum sistema
novo foi criado — só uma camada de densidade reutilizável (design system) e
a reorganização visual das páginas já existentes.

## M4.1 — Novos primitives compartilhados

Todos em `src/components/design-system/`, exportados via `index.js`:

- **`PageHeader` (estendido)** — nova prop `dense` (default `false`, não
  quebra nenhum uso existente). Sob `max-width:767px`: descrição e
  breadcrumb somem (`hidden md:block`/`md:flex`), título fica menor, a
  fileira de `stats` vira scroll horizontal de uma linha em vez de quebrar
  em várias. Mesmo componente, mesma marcação — só CSS condicional, sem
  duplicar DOM.
- **`CompactStats`** — linha única de indicadores (`label: value`),
  substitui grades de 3-6 `StatCard`s grandes. Extrai um padrão que
  Coaches.jsx já tinha inventado manualmente numa fase anterior
  (Starter Coach Flow) — agora compartilhado por 9 páginas.
- **`CompactListItem`** — linha densa (~56-64px) para listas: ícone/avatar +
  título + uma linha de detalhe + conteúdo à direita. Extraído das 4 linhas
  quase idênticas escritas à mão em Ranking.jsx. Renderiza `<Link>` (com
  `to`), `<button>` (com `onClick`) ou `<div>` simples (sem nenhum dos
  dois) — nunca vira um "botão" que não faz nada.
- **`CollapsibleSection`** — seção recolhível (`Surface` + cabeçalho com
  chevron), extraída do padrão já usado em CareerHub.jsx
  (`CareerToolsSection`, que passou a reaproveitar o primitive em vez de
  manter a própria implementação).
- **`CompactActionCard`** — casca para cards de ação: fechado mostra
  ícone/título/resumo curto/botão principal; detalhes completos (incluindo
  o que antes era sempre visível) ficam atrás de um "expandir" opcional.
- **`SummaryRow`** — linha de texto "label valor · label valor", para
  resumir dentro de uma seção já recolhida.
- **Tokens novos em `src/index.css`** (só os que faltavam — altura de
  header/bottom-nav/toque mínimo já tinham token e foram reaproveitados):
  `--mobile-card-padding`, `--mobile-section-gap`, `--mobile-compact-row-height`.
  `.pl-content-enter` ganhou um espaçamento vertical menor só sob
  `max-width:767px` (desktop com `lg:space-y-5` intocado).

## Páginas modificadas

| Página | Problema anterior | Ação principal | Componentes alterados |
|---|---|---|---|
| **Treinos** (`Training.jsx`) — *gate obrigatório* | Hero grande → 4 StatCards → avisos → tabs → **Moral/Recuperação sempre expandidos** → categoria → atividades (cards sempre com seletor de intensidade visível) | Treinar (card de atividade) | `PageHeader dense`, `CompactStats`, `CollapsibleSection` ×2 (Estado do atleta / Recuperação, movidos para depois das atividades, recolhidos por padrão), `TrainingActivityCard` reescrito sobre `CompactActionCard` (intensidade vira segmented control dentro do expandir) |
| **Partidas** (`Matches.jsx`) — *gate obrigatório* | Hero → 4 StatCards → histórico | Jogar agora (já no header) | `PageHeader dense`, `CompactStats`, padding do histórico reduzido |
| **Home** (`CareerHub.jsx`) | Já reorganizada numa fase anterior (Fase 4) em 7 regiões; só densidade fina | O que fazer agora (painel já existente) | `PageHeader dense` no `IdentityHeader`, `CareerToolsSection` migrado para `CollapsibleSection` compartilhado |
| **Missões** (`Missions.jsx`) | Lista plana — missões concluídas ocupavam o mesmo espaço que as ativas | Etapa atual do tutorial / próxima missão | `PageHeader dense`, `CompactStats`, "Concluídas" agrupadas em `CollapsibleSection` recolhida, linhas viram `CompactListItem` |
| **Torneios** (`Tournaments.jsx`) — *gate obrigatório* | Hero → 6 StatCards de contagem por tier → banner estático → tabs → cards sempre com painel de análise do técnico expandido | Próximo torneio (novo, no topo) | `PageHeader dense` (banner de regras virou `TooltipHint`), `CompactStats`, banner "Próximo torneio" novo (reaproveita o mesmo critério de `CalendarPage.jsx`), painel de análise do técnico por card vira toggle recolhido |
| **Calendário** (`CalendarPage.jsx`) | Já bem denso (grid da semana já minimalista; "Faixa operacional" já ajustada numa fase anterior contra truncamento) | Avançar dia / ver compromisso | `PageHeader dense` só |
| **Ranking** (`Ranking.jsx`) | 4 linhas de row quase idênticas escritas à mão (circuito/duplas/clubes/países) | Ver posição/comparar | `PageHeader dense`, `CompactStats`, todas as linhas migradas para `CompactListItem` |
| **Atletas** (`Athletes.jsx`) | Única página fora de `Page`/`PageContent`; cards com até 12 campos sempre visíveis; usava wrappers `@deprecated` | Comparar atletas rapidamente | Migrado para `Page`/`PageContent`/`PageHeader dense`/`Tabs`; `AthleteCard` reduzido a nome/país/idade/OVR/fase (resto já estava a um toque em `AthleteDetail`) |
| **Dupla** (`PartnerHub.jsx` + `PartnerOffersPanel.jsx`) | Card de proposta mais alto de toda a auditoria (~430-480px, sempre expandido) | Analisar proposta | `PageHeader dense`, `CompactStats`; formação sugerida/pontos fortes/termos viram toggle recolhido por proposta; intro explicativa virou `TooltipHint` |
| **Técnicos** (`Coaches.jsx` + `CoachCard.jsx`) | Já tinha uma faixa compacta própria (fase anterior) | Contratar/ver detalhes | Faixa própria migrada para `CompactStats` compartilhado; `CoachCard` com benefícios reduzidos de 3→2 linhas e tiles de salário/afinidade compactados; **correção incidental**: página passou a reagir a `padel:profile-updated`/avanço de dia externo (mesma causa raiz da M3.7.2, documentada como pendente até agora) |
| **Comissão** (`Staff.jsx` + `StaffPanel.jsx`) | 4 StatCards + card de profissional com grade de 3 blocos | Gerenciar comissão | `PageHeader dense`, `CompactStats`; card de profissional com `SummaryRow`; parágrafo explicativo do hero virou `TooltipHint` |
| **Comunicações** (`Communications.jsx`) | Linha de mensagem já perto do ideal, preview de 2 linhas | Abrir mensagem | `PageHeader dense`, `CompactStats`, preview reduzido para 1 linha |
| **Imprensa** (`Press.jsx` + `ArticleCard.jsx`) | Card de artigo com preview de 2 linhas | Ler/responder | `PageHeader dense`, `CompactStats`, preview reduzido para 1 linha |
| **Evolução** (`AttributeEvolution.jsx`, aba "Evolução" de Treinos) | Única tela do app sem nenhum componente do design system (`glass` cru); lista de 10 atributos totalmente plana | Ver evolução por categoria | Migrada para `Surface`/`SurfaceHeader`; atributos agrupados por `ATTRIBUTE_GROUPS` (movido de `PlayerProfile.jsx` para `src/lib/padel.js`, fonte única) dentro de `CollapsibleSection` por categoria |

## Fora de escopo (auditadas, sem alteração)

As ~35 páginas restantes de `src/pages/*.jsx` foram localizadas e
brevemente auditadas, mas não estão na lista explícita do brief (M4.2-14) e
não foram modificadas nesta fase: `Login`, `Register`, `ForgotPassword`,
`ResetPassword`, `Landing` (pré-autenticação, fora do shell mobile),
`Admin`, `DatabaseManager`, `CareerManager`, `Settings`, `NavigationHub`
(páginas de administração/meta, não gameplay diário), `Journal`,
`Achievements`, `History`, `CharacterEditor`, `ClubDetail`, `Encyclopedia`,
`Fans`, `HallOfFame`, `Legacy`, `MonthlyReports`, `AnnualReports`, `Clubs`,
`Economy`, `Relationships`, `TrainingCenter`, `PlayerProfile` (só a
extração de `ATTRIBUTE_GROUPS`, sem redesign), `Inventory`, `Shop`,
`CareerStats`, `Community`, `Season`, `SeasonDashboard`, `Social`,
`Weather`, `WorldEvents`, `WorldHub`, `WorldMarket`. Ficam registradas aqui
como candidatas a uma fase M4 futura, não como pendência desta.

## M4.15 — Conteúdo movido para disclosure progressivo

| Antes | Depois |
|---|---|
| Banner estático de regras de inscrição em Torneios, sempre visível | `TooltipHint` ao lado do título |
| Parágrafo "Escolha sua dupla" sempre visível em Parcerias | `TooltipHint` ao lado do título |
| Parágrafo do hero da Comissão técnica sempre visível | `TooltipHint` ao lado do título |
| Legenda técnica sobre cache do mercado de técnicos ("O mercado é calculado apenas quando...") | Removida — era detalhe interno de implementação, não informação útil ao jogador (não é perda de informação de jogo) |
| Moral/Confiança/Forma/Entrosamento sempre expandidos antes dos treinos | `CollapsibleSection` "Estado do atleta" com resumo de uma linha sempre visível |
| Painel de análise do técnico sempre expandido em cada card de torneio | Toggle local por card, recolhido por padrão |
| Formação sugerida/pontos fortes/termos sempre expandidos em cada proposta de parceria | Toggle local por proposta, recolhido por padrão |

Nenhuma informação de jogo foi apagada — tudo continua acessível a um
toque/expandir, ou nos modais de detalhe já existentes
(`AthleteDetail`, `CoachDetail`, `TournamentDetailsModal`).

## M4.16/17 — Shell (bottom nav / header / floating rail)

Não alterado estruturalmente. A auditoria confirmou que a reserva de
espaço para a bottom-nav e a área segura já é centralizada em
`AppLayout.jsx` (`<main>`'s `pb-[calc(var(--pl-bottom-nav-h)+...)]`), não
por página — nenhuma mudança foi necessária ali. Verificado (teste
automatizado, ver abaixo) que nenhuma página nova introduziu seu próprio
elemento `fixed` no canto inferior direito, que colidiria com o
`GuideButton` (zona de colisão confirmada pela auditoria: ~82-130px acima
da borda inferior, ~0-60px da borda direita).

## M4.18-22 — Scroll / Landscape / Acessibilidade / Performance

- Nenhum scroll aninhado, `overflow-x` acidental ou `min-height` gigante
  foi introduzido (verificado por teste).
- Não existia tratamento de landscape antes da M4 (zero media queries de
  `orientation` no projeto) — M4 não adicionou um redesign de landscape
  completo (fora do escopo do brief), só evitou introduzir qualquer
  elemento de altura fixa que quebraria nesse cenário.
- Nenhum novo listener de resize, observer ou animação JS foi introduzido
  — todos os primitives novos são CSS/Tailwind estático, consistente com a
  doutrina de performance da M3.5.
- Alvos de toque continuam garantidos pelo mecanismo já existente
  (`--pl-touch-min`, `.pl-btn-tap`/`.pl-icon-tap`, catch-all dentro de
  `.design-system-page-host`) — nenhum botão novo usa tamanho fixo abaixo
  disso.

## Testes

`scripts/test-mobile-compact-ux-m4.mjs` (`npm run test:mobile-compact-ux-m4`)
— 83 gates automatizados: primitives existem com a API esperada; Treinos e
Partidas passam nos gates obrigatórios (ordem real do código prova que
atividades/ação principal vêm antes de moral/recuperação/histórico);
nenhuma página perdeu o listener de atualização reativa da M3.7.2 durante a
reestruturação (Coaches.jsx especificamente ganhou o listener, correção
incidental documentada); todas as páginas listadas usam os primitives
compartilhados de verdade (não uma segunda implementação); nenhum
`min-h-64/72/80/96` foi reintroduzido; o shell (`AppLayout.jsx`) continua
com a mesma reserva de espaço/área segura; nenhuma página nova usa `fixed`
no canto inferior direito.

**Checklist físico — não automatizável, requer aparelho real** (ver seção
de teste do brief): contagem real de scroll até a ação principal em
360/390/430px; comportamento em landscape; toque real nos novos
cards/`CollapsibleSection`/segmented control; colisão visual real entre os
novos componentes e o `GuideButton`/`FloatingUtilityRail` em telas curtas.

## Regressão

`lint` limpo; `typecheck` no baseline (2259 erros pré-existentes, mesmo
total de antes da M4 — 2 erros novos nos primitives novos, mesma classe de
erro já presente em toda a base, compensados por erros removidos ao
enxugar `AthleteCard`/`CoachCard`); `build` e `app:build` (MSI/NSIS) OK;
todas as 14 suítes mobile M1-M3.7.2; onboarding/tutorial/missões (9
suítes); `test:training-v2`; `test:calendar-advance`;
`test:tournament-registration`/`test:tournament-resume-recovery`/
`test:tournament-match-lifecycle`; `test:ranking-consistency`;
`test:coaches-v28`/`test:coach-market-curation`/`test:starter-coach-flow`/
`test:coach-selection-clarity`; `test:partner-offers`/
`test:partnerships-v29`; `test:match-launch-pipeline`/`test:match-integrity`;
`test:visual-checkpoint-hotfix1` (uma regressão real encontrada e corrigida
— ver abaixo); `test:career-beta-readiness`; `test:live-coach`/
`test:live-coach-practice`/`test:live-coach-tournament`; e os 14 pilares de
`test:beta-candidate` — todos PASS.

**Uma regressão real foi encontrada e corrigida durante o próprio
regression run**: ao compactar `TrainingActivityCard.jsx`, o resumo do
card passou a mostrar só o ganho previsto (`+1.08`), sem o valor atual do
atributo — reintroduzindo exatamente o bug que
`scripts/test-visual-checkpoint-hotfix1.mjs` existe para proteger (um
hotfix anterior já tinha corrigido esse mesmo problema uma vez). Corrigido
mostrando `{valor atual} +{ganho}` no resumo, ainda em uma linha compacta,
sem alterar nenhuma fórmula de treino.

## Android

APK release gerado e assinado com o mesmo processo já estabelecido
(`npm run android:build` + `zipalign` + `apksigner` com o keystore de
debug padrão do Android SDK) — caminho, tamanho e SHA-256 no relatório
final desta fase.
