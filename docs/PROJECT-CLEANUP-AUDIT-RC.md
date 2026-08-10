# Auditoria de limpeza e simplificação — RC

Data da auditoria: 2026-08-10

## Método e fronteira

A auditoria cruzou rotas, menu, imports estáticos e dinâmicos literais, scripts, testes, armazenamento, providers, efeitos globais, dependências npm e crates Tauri. Itens foram removidos somente quando pertenciam à feature oficialmente abandonada ou quando tinham zero consumidores e não eram entry points.

O playback da partida atual permanece separado do replay antigo: `LiveMatch`, `MatchEngine`, narração, velocidades, avanço de ponto/game/set/partida e táticas continuam ativos.

## Resultado executivo

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Módulos transformados pelo Vite | 3.943 | 3.928 (-15; -0,38%) |
| Chunks JS/CSS | 139 | 135 (-4; -2,88%) |
| Bundle inicial | 1.249,79 kB | 1.218,22 kB (-31,57 kB; -2,53%) |
| Bundle inicial gzip | 373,53 kB | 362,48 kB (-11,05 kB; -2,96%) |
| Todos os assets JS/CSS | 3.165,58 kB | 3.134,66 kB (-30,92 kB; -0,98%) |
| Todos os assets gzip | 953,58 kB | 940,15 kB (-13,43 kB; -1,41%) |
| Dependências npm diretas | 66 | 48 |
| Arquivos versionados removidos | 0 | 77 |
| Módulos de `src` removidos | 0 | 62 |

## Rotas

| Rota | Componente/destino | Menu | Utilização | Status |
| --- | --- | --- | --- | --- |
| `/` | `RootEntry` | Não | Entrada e escolha de carreira | ACTIVE |
| `/careers` | `CareerManager` | Indireto | Gestão de saves | ACTIVE |
| `/career-hub` | `CareerManager` | Não | Alias antigo de carreiras | REVIEW |
| `/login` | `Login` | Não | Compatibilidade de autenticação local | ACTIVE |
| `/register` | `Register` | Não | Compatibilidade de autenticação local | ACTIVE |
| `/forgot-password` | `ForgotPassword` | Não | Compatibilidade de autenticação local | ACTIVE |
| `/reset-password` | `ResetPassword` | Não | Compatibilidade de autenticação local | ACTIVE |
| `/game` | `CareerHub` | Sim | Home da carreira | ACTIVE |
| `/development` | `NavigationHub` | Sim | Hub de desenvolvimento | ACTIVE |
| `/team-hub` | `NavigationHub` | Sim | Hub de dupla/equipe | ACTIVE |
| `/competitions` | `NavigationHub` | Sim | Hub competitivo | ACTIVE |
| `/world` | `WorldHub` | Sim | Hub do mundo | ACTIVE |
| `/management` | `NavigationHub` | Sim | Hub de gestão | ACTIVE |
| `/game/training` | `Training` | Sim | Treinos | ACTIVE |
| `/game/missions` | `Missions` | Sim | Missões e tutorial | ACTIVE |
| `/game/shop` | `Shop` | Sim | Loja | ACTIVE |
| `/game/inventory` | `Inventory` | Sim | Equipamentos | ACTIVE |
| `/game/legacy` | `Legacy` | Sim | Legado da carreira | ACTIVE |
| `/game/stats` | `CareerStats` | Sim | Estatísticas | ACTIVE |
| `/game/calendar` | `CalendarPage` | Sim | Calendário | ACTIVE |
| `/game/season` | `Season` | Sim | Temporada | ACTIVE |
| `/game/monthly-reports` | `MonthlyReports` | Indireto | Relatório mensal | ACTIVE |
| `/game/economy` | `Economy` | Sim | Economia | ACTIVE |
| `/profile` | `PlayerProfile` | Sim | Perfil do atleta | ACTIVE |
| `/matches` | `Matches` | Sim | Partidas narradas atuais | ACTIVE |
| `/world-tour/live` | redirect `/tournaments` | Não | Compatibilidade de URL removida | REDIRECT |
| `/live-circuit` | redirect `/tournaments` | Não | Compatibilidade de URL removida | REDIRECT |
| `/tournaments` | `Tournaments` | Sim | Torneios | ACTIVE |
| `/journal` | `Journal` | Sim | Notícias | ACTIVE |
| `/ranking` | `Ranking` | Sim | Ranking | ACTIVE |
| `/clubs` | `Clubs` | Sim | Clubes | ACTIVE |
| `/clubs/:clubId` | `ClubDetail` | Indireto | Detalhe de clube | ACTIVE |
| `/athletes` | `Athletes` | Sim | Atletas do circuito | ACTIVE |
| `/character` | `CharacterEditor` | Sim | Aparência | ACTIVE |
| `/admin` | `Admin` | Sim | Gestão da carreira | ACTIVE |
| `/database` | `DatabaseManager` | Sim | Banco de dados do jogo | ACTIVE |
| `/history` | `History` | Sim | História do padel | ACTIVE |
| `/hall-of-fame` | `HallOfFame` | Sim | Hall da fama | ACTIVE |
| `/relationships` | `Relationships` | Sim | Relacionamentos | ACTIVE |
| `/coaches` | `Coaches` | Sim | Treinador principal | ACTIVE |
| `/staff` | `Staff` | Sim | Comissão técnica | ACTIVE |
| `/training-center` | `TrainingCenter` | Sim | Centro de treinamento | ACTIVE |
| `/press` | `Press` | Sim | Imprensa | ACTIVE |
| `/social` | redirect `/community` | Não | Alias da fusão social/comunidade | REDIRECT |
| `/fans` | `Fans` | Sim | Fãs e torcidas | ACTIVE |
| `/achievements` | `Achievements` | Sim | Conquistas | ACTIVE |
| `/world-events` | `WorldEvents` | Sim | Eventos mundiais | ACTIVE |
| `/world-market` | `WorldMarket` | Sim | Mercado mundial | ACTIVE |
| `/weather` | `Weather` | Sim | Clima | ACTIVE |
| `/encyclopedia` | `Encyclopedia` | Sim | Enciclopédia | ACTIVE |
| `/partners` | `PartnerHub` | Sim | Dupla e propostas | ACTIVE |
| `/community` | `Community` + `Social` embutido | Sim | Comunidade e rede social fundidas | ACTIVE |
| `/communications` | `Communications` | Sim | Central de comunicações | ACTIVE |
| `*` | `PageNotFound` | Não | Fallback | ACTIVE |

## Menu

- ESSENCIAL: Início, Treinos, Torneios, Calendário, Partidas, Ranking, Perfil, Dupla, Treinador, Comissão e Comunicações.
- ÚTIL: Loja, Equipamentos, Missões, Estatísticas, Temporada, Economia, Imprensa, Atletas, Clubes, Notícias e Mercado mundial.
- SECUNDÁRIA: Aparência, Conquistas, Legado, Fãs, Comunidade, Clima, Enciclopédia, História, Hall da fama, Administração e Banco de dados. Mantidas porque possuem telas e ações reais.
- OBSOLETA: `Competições → Circuito ao vivo`. Removida.

## ACTIVE

- Partida atual narrada: `LiveMatch`, `MatchEngine`, `pointEvents`, `narration`, táticas e controles de velocidade.
- Torneios, chave, resultados, ranking, calendário, imprensa, energia, carreira e persistência central.
- `Social.jsx` continua ativo como seção embutida de `Community.jsx`; somente seu loader redundante para a rota redirecionada foi removido.
- Providers globais com consumidores: `AuthProvider`, `QueryClientProvider` e `CareerProvider`.
- Runtime services: bootstrap de save, resumo de avanço de dia e ponte de missões.
- Dependências Rust/Tauri: todas mantidas; `tauri`, `tauri-plugin-store`, `tauri-plugin-fs`, `serde` e `serde_json` possuem uso real.

## REMOVE

- `WorldSpectator`, rota funcional e item de menu Circuito ao vivo.
- Replay de partida antiga, biblioteca, migração, player, timeline, storage e exportação.
- Renderizador de quadra 2D, cena, sprites, preview, broadcast, áudio e highlights.
- Reservas para assistir e seguidores exclusivos do espectador em torneios, chaves e atletas.
- Seis scripts/testes históricos de replay e oito documentos da feature abandonada.
- Páginas órfãs `Landing.jsx` e `SeasonDashboard.jsx`, ambas sem rota, import ou carregamento dinâmico.
- Branch morta de missão `has-replay` e etapa de tutorial `visit_live_circuit`.
- Import de `LiveCoachTest` no entry point de produção; o teste continua acessível no registro DEV e pelo script dedicado.

## REVIEW

A análise de alcançabilidade a partir de `src/main.jsx` encontrou 85 módulos fora do grafo inicial: 40 primitives UI, 13 testes, 9 entry points de compatibilidade e 23 outros. Eles não foram apagados automaticamente porque podem ser consumidos por scripts, barrels, Base44 ou fluxos de desenvolvimento.

Candidatos prioritários para uma segunda rodada:

- compatibilidade offline/Base44: `src/api/base44Client.js`, `src/local/localBase44Client.js`, `src/local/localDatabase.js`;
- flag permanente: `src/gameplay/config/featureFlags.js` e wrapper `src/gameplay/featureFlags.js`;
- componentes antigos da Home: `FeedPanel`, `RankingCards`, `UpcomingPanel`;
- `OnboardingAttributes`, `components/padel/Skeletons`, `design/tokens.js`;
- catálogos possivelmente duplicados em `src/lib/catalog/*` e `equipmentFullCatalog.js`;
- wrappers/exports de compatibilidade em `src/gameplay/*` e pequenos entry points de `src/game-core`;
- alias `/career-hub`, mantido por compatibilidade;
- polling de segurança da `CommunicationBell` a cada 60 segundos. É funcional e possui cleanup, mas pode futuramente virar 100% orientado a eventos;
- preferências visuais do layout em `localStorage`. Não fazem parte do save da carreira, mas merecem alinhamento documental com a regra offline.

## DEV ONLY

- `src/dev/registerDevTests.js`, carregado apenas dentro de `import.meta.env.DEV`.
- Testes residentes em `src/**/*Test.js` e CLIs como `MatchBalanceCli.js`.
- Ferramentas BETA continuam no produto por serem parte do ciclo de beta; o polling de analytics só existe enquanto o painel está aberto.

## Storage, providers e efeitos

- Nenhum `ReplayProvider`, `SpectatorProvider` ou `LegacyWorldProvider` existia ou permanece montado.
- Foram removidos três efeitos de leitura do `SpectatorStore` nas telas de torneios/chave/atletas e todas as novas gravações em `replays/...` e `preferences/replay-broadcast.json`.
- Arquivos antigos de replay no disco do usuário não são apagados por esta versão. Isso evita uma migração destrutiva; uma limpeza de dados pode ser oferecida futuramente.
- O save principal não recebe mais estado visual, reservas ou timeline de replay. Estatísticas, resultado, recap e narração necessária da partida continuam preservados.
- Listeners ativos auditados possuem cleanup. Não havia polling próprio do replay/espectador para remover.

## Dependências npm removidas

`@hello-pangea/dnd`, `@hookform/resolvers`, `@radix-ui/react-toast`, `@stripe/react-stripe-js`, `@stripe/stripe-js`, `@tauri-apps/api` como dependência direta, `@tauri-apps/plugin-store` como dependência JS direta, `canvas-confetti`, `html2canvas`, `jspdf`, `lodash`, `moment`, `react-hot-toast`, `react-leaflet`, `react-markdown`, `react-quill`, `three` e `zod`.

`@tauri-apps/api` permanece instalado de forma transitiva por `@tauri-apps/plugin-fs`. O crate Rust `tauri-plugin-store` permanece ativo e não depende do pacote JavaScript removido.

## Validação

O teste `scripts/test-project-cleanup-rc.mjs` verifica menu, redirects, ausência dos runtimes antigos, scripts removidos, imports locais, loaders das rotas ativas e preservação do playback narrado. O build pós-limpeza passou com 3.928 módulos e 135 chunks.

Resultados finais:

- PASS: `test:project-cleanup`, `validate:architecture`, `test:career-systems`, `test:match-integrity`, `test:match-playback`, `test:tournament-flow-rc`, `test:calendar-advance`, `test:missions`, `test:live-coach`, `test:onboarding-v2`, `lint`, `build` e `analyze`.
- `typecheck`: ainda falha com 1.974 diagnósticos globais preexistentes de tipagem JavaScript/TypeScript. A referência anterior desta mesma árvore tinha 2.029 diagnósticos; a limpeza não adicionou imports ausentes ou módulos órfãos ao runtime.
- `git diff --check`: aprovado; apenas avisos de conversão futura LF/CRLF pelo Git no Windows.
- Warnings não bloqueantes do build: chunk inicial acima de 500 kB, import estático e dinâmico de `MedicalCenterManager` no mesmo grafo e base `browserslist` desatualizada.

Validação manual recomendada antes da beta:

- confirmar visualmente que “Circuito ao vivo” desapareceu do menu em desktop e mobile;
- abrir `/world-tour/live` e `/live-circuit` em uma build empacotada e confirmar o redirect para Torneios;
- carregar um save antigo que tenha visitado a etapa removida do tutorial e confirmar a reconciliação para a versão 7;
- executar uma partida completa no pacote Tauri, alterando narração, velocidade e tática;
- confirmar que eventuais arquivos históricos em `replays/` permanecem inertes e não são recriados.
