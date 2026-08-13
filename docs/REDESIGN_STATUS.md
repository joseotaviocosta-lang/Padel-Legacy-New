# Inventário Pós-Redesign — status por página/rota

Gerado ao final da Fase 8, antes da build de auditoria visual instalada.
Metodologia: cada página foi checada objetivamente por import
(`from '@/components/design-system'` vs `from '@/components/padel/ui'`),
cruzado com o conhecimento direto de quais páginas cada fase (2 a 8)
efetivamente tocou. Onde não há confirmação direta desta sessão, o status
é `~` ou `⚠` por honestidade — "importa os dois sistemas" não prova por si
só que o resultado visual está correto ou errado, só que merece uma
checagem visual antes do checkpoint.

Legenda: `✓` redesenhada · `~` parcialmente migrada · `○` ainda legacy ·
`⚠` precisa QA visual (não verificada pessoalmente nesta sessão)

## Início

| Rota | Página | Status | Nota |
|---|---|---|---|
| `/game` | CareerHub.jsx | ✓ | Fase 4 (docs/HOME_REDESIGN.md); ajuste incidental nesta fase (ConfirmDialog no aviso de lesão) |

## Carreira

| Rota | Página | Status | Nota |
|---|---|---|---|
| `/development`, `/team-hub` | NavigationHub.jsx | ✓ | Já 100% Design System; confirmado ainda em uso real (não órfão) |
| `/profile` | PlayerProfile.jsx | ✓ | Só Design System |
| `/character` | CharacterEditor.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/game/missions` | Missions.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/game/training` | Training.jsx | ✓ | Só Design System |
| `/training-center` | TrainingCenter.jsx | ✓ | Só Design System |
| `/game/inventory` | Inventory.jsx | ✓ | Só Design System |
| `/game/shop` | Shop.jsx | ✓ | Só Design System |
| `/partners` | PartnerHub.jsx | ✓ | Só Design System |
| `/coaches` | Coaches.jsx | ✓ | Só Design System |
| `/staff` | Staff.jsx | ✓ | Só Design System |
| `/relationships` | Relationships.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/fans` | Fans.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase; possui leitura direta de `error.message` (seção 30) a revisar |

## Competir

| Rota | Página | Status | Nota |
|---|---|---|---|
| `/tournaments` | Tournaments.jsx | ✓ | Só Design System; `window.confirm` de cancelamento migrado nesta fase |
| `/game/calendar` | CalendarPage.jsx | ✓ | Só Design System; `window.confirm` de pular lesão migrado nesta fase |
| `/matches` | Matches.jsx | ✓ | Só Design System |
| `/ranking` | Ranking.jsx | ✓ | Só Design System |
| `/game/season` | Season.jsx | ✓ | Migrada nesta fase (Fase 8) — antes usava `PageContainer`/`GlassCard`/`EmptyStateCard` legados |

## Mundo

| Rota | Página | Status | Nota |
|---|---|---|---|
| `/journal` | Journal.jsx | ✓ | Fase 7 — destaque principal e paginação no feed |
| `/world` | WorldHub.jsx | ✓ | Fase 7 — bug de leitura de categorias corrigido, aba Hoje reagrupada |
| `/world-events` | WorldEvents.jsx | ✓ | Fase 7 — migrado para PageHeader/PageSkeleton oficiais |
| `/press` | Press.jsx | ✓ | Fase 7 — banner de entrevista, impacto completo no histórico |
| `/community` | Community.jsx | ✓ | Fase 7 — paginação, PlayerAvatar |
| `/social` (→ `/community`) | Social.jsx | ✓ | Fase 7 — embutido em Community, redirecionamento preservado |
| `/athletes` | Athletes.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/clubs`, `/clubs/:id` | Clubs.jsx, ClubDetail.jsx | ⚠ | Mistura DS + padel/ui — não verificadas nesta fase |
| `/weather` | Weather.jsx | ✓ | Migrada nesta fase (Fase 8) — invólucro (header/loading/empty) no Design System; abas internas mantêm `GlassCard`/`FilterPills` |
| `/encyclopedia` | Encyclopedia.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |

## Gestão

| Rota | Página | Status | Nota |
|---|---|---|---|
| `/game/economy` | Economy.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/world-market` | WorldMarket.jsx | ✓ | Fase 7 (PlayerAvatar/CountryFlag) + Fase 8 (Select oficial no filtro de treinador) |
| `/admin` | Admin.jsx | ✓ | Migrada nesta fase (Fase 8) — técnica por natureza (seção 25), mantém `TabBar` |
| `/database` | DatabaseManager.jsx | ✓ | Migrada nesta fase (Fase 8) — `CardGrid`/`StatCard` para contagens de entidades |
| `/competitions` | NavigationHub.jsx | ✓ | Mesmo componente de `/development` |
| `/management` | NavigationHub.jsx | ✓ | Mesmo componente de `/development` |

## Mais

| Rota | Página | Status | Nota |
|---|---|---|---|
| `/game/stats` | CareerStats.jsx | ✓ | Só Design System |
| `/game/legacy` | Legacy.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/achievements` | Achievements.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/communications` | Communications.jsx | ✓ | Só Design System |
| `/history` | History.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/hall-of-fame` | HallOfFame.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/encyclopedia` | Encyclopedia.jsx | ⚠ | (listada também em Mundo, aparece nos dois grupos de navegação) |
| `/settings` | Settings.jsx | ✓ | **Nova nesta fase (Fase 8)** — só Design System |
| `/game/monthly-reports` | MonthlyReports.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |
| `/game/annual-reports` | AnnualReports.jsx | ⚠ | Mistura DS + padel/ui — não verificada nesta fase |

## Saves / Auth (fora do shell de navegação)

| Rota | Página | Status | Nota |
|---|---|---|---|
| `/careers`, `/career-hub` | CareerManager.jsx | ✓ | Migrada nesta fase (Fase 8) — `ModalShell`/`ConfirmDialog`/`Select`/`BrandMark`; seção hero permanece com identidade visual própria (landing de entrada), por escolha, não por pendência |
| `/login` | Login.jsx | ✓ | Via `AuthLayout.jsx` compartilhado (`BrandMark` adicionado nesta fase) |
| `/register` | Register.jsx | ✓ | Via `AuthLayout.jsx` compartilhado |
| `/forgot-password` | ForgotPassword.jsx | ✓ | Via `AuthLayout.jsx` compartilhado |
| `/reset-password` | ResetPassword.jsx | ✓ | Via `AuthLayout.jsx` compartilhado |
| (pública, pré-login) | Landing.jsx | ~ | `BrandMark` aplicado nesta fase; estrutura da página (hero/seções) continua bespoke — não estava na lista de prioridade da Fase 8 |

## Órfã (não roteada)

| Arquivo | Status | Nota |
|---|---|---|
| `SeasonDashboard.jsx` | — | Não está em nenhuma rota de `App.jsx`. `window.confirm` corrigido por higiene, mas não foi conectado a nada. Candidato a remoção em uma fase de limpeza (seção 27 do brief — documentar, não apagar). |

## Resumo

- **✓ redesenhada**: 33 rotas
- **~ parcialmente migrada**: 1 (Landing.jsx)
- **⚠ precisa QA visual** (não tocadas nesta sessão, mistura DS+legado): 14 páginas — Achievements, AnnualReports, Athletes, CharacterEditor, ClubDetail/Clubs, Economy, Encyclopedia, Fans, HallOfFame, History, Legacy, Missions, MonthlyReports, Relationships
- **Órfã**: SeasonDashboard.jsx

As 14 páginas `⚠` não foram tocadas nesta fase nem na Fase 7 — a mistura de
imports pode ser um padrão intencional (como em Journal/WorldHub, que
combinam `Page` oficial com `TabBar`/`GlassCard` de propósito) ou pode ser
migração incompleta de verdade. Recomendação: usar esta lista como ponto de
partida da auditoria visual instalada (próximo passo, fora desta fase).
