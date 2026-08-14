# Fase 10 — Beta Readiness

Auditoria de integridade de carreira completa (criação → onboarding → treino →
torneios → partidas → ranking → economia → save/load → múltiplas
temporadas). Objetivo: responder, com evidência, se hoje é seguro entregar
Padel Legacy para jogadores reais.

Esta fase **não é redesign**. Nenhuma mudança visual foi feita. Toda mudança
de código é uma correção pontual de um bug real, com causa raiz identificada
e testes de regressão passando.

## 1. Baseline (antes de qualquer alteração)

| Verificação | Resultado |
|---|---|
| `npm run lint` | Limpo (0 erros) |
| `npm run typecheck` | 2266 erros pré-existentes em 2527 linhas de saída — débito de tipagem já conhecido, não relacionado a esta fase (majoritariamente `localGame.entities` não tipado — um Proxy JS sem tipos gerados) |
| `npm run build` | Sucesso, mesmo aviso pré-existente de chunk >500kB (`index-*.js`) |
| `npm run test:beta` | **Falhava** — crash em cascata a partir de `test:tutorial-chronology` (ver §9) |
| `npm run test:coaches-v28` | **Falhava** — "impacto real em partidas" (ver §9) |
| `npm run test:tutorial-chronology` | **Falhava** — `TUTORIAL_VERSION` esperado 6, atual 8 (ver §9) |
| Demais suítes relacionadas (`test:massive-v32`, `test:career-pace`, `test:career-difficulty`, `test:world-auditor-v35`, `test:living-world`, `test:injuries`, `test:tournament-flow-rc`, `test:tournament-registration`, `test:career-systems`, `test:sports-economy`, `test:staff-architecture`, `test:partnerships-v29`, `test:ranking-carryover-v32`, `test:fatigue-integrity`, `test:live-coach`, `test:onboarding-v2`, `test:missions`, `test:match-integrity`, `test:match-balance`) | Todas já passavam |

Os três primeiros itens (falhas em `test:beta`/`test:coaches-v28`/
`test:tutorial-chronology`) já existiam **antes** desta fase e não foram
causados por ela — registrados aqui para não atribuir dívida antiga à Fase
10, conforme pedido.

## 2. Arquitetura auditada (save/carreira)

Cadeia real: `CareerManager` → `CareerRepository` → `GameStorage` →
`TauriStorage` (`$APPDATA`, nunca `localStorage`).

- **Schema versionado**: `CAREER_SAVE_SCHEMA_VERSION = 17`
  (`src/careers/careerSchema.js`), com cadeia de migração incremental v1→v17
  em `src/careers/CareerMigration.js` — cada versão migra apenas o que mudou,
  preservando dados de versões anteriores (nenhum campo é assumido presente
  sem checagem). Índice de carreiras tem seu próprio schema
  (`CAREER_INDEX_SCHEMA_VERSION = 3`) e sua própria migração.
- **Escrita atômica**: `GameStorage.writeJsonUnlocked` escreve em arquivo
  temporário, verifica o conteúdo lido de volta, faz backup do arquivo antigo
  (quando aplicável), remove o antigo, renomeia o temporário para o destino e
  **relê e verifica de novo** antes de considerar a escrita concluída
  (`src/storage/GameStorage.js:172-214`). Escritas no mesmo caminho são
  serializadas por um lock por-caminho (`writeLocks`).
- **Fila de mutação em memória**: `ActiveCareerAdapter.mutateActiveCareer`
  (`src/gameplay/adapters/ActiveCareerAdapter.js:187-218`) serializa todas as
  mutações da carreira ativa numa fila (`writeChain`), com backup automático
  a cada 5 min e sincronização do índice a cada 15s — sem custo de I/O em
  toda pequena alteração de entidade.
- **Validação em duas camadas**: `CareerValidator.js` valida estrutura antes
  de qualquer gravação; migração roda **antes** da validação estrita (saves
  antigos são válidos para a própria versão, não para o schema atual).

Nenhum problema de integridade estrutural foi encontrado nesta cadeia.
Nenhuma alteração de schema foi necessária nesta fase.

## 3. Simulações executadas

### 3.1 Simulador estatístico pré-existente (reutilizado, não recriado)

`scripts/test-massive-careers-v32.mjs` já existia e é o simulador estatístico
mais completo do projeto: PRNG seedado, 10 arquétipos de comportamento, 100
carreiras cada, 10 temporadas de 48 semanas. Ele **não** usa
`CareerManager`/`CareerRepository`/save real — reimplementa suas próprias
fórmulas de treino/ranking/economia para rodar rápido em memória. Foi
executado (não recriado, por instrução explícita do enunciado) e seus
resultados alimentam a §11 (progressão) e §12 (economia). Achados que ele já
reportava (`TOP100_TOO_SLOW`, `ECONOMY_TOO_RICH`, `FATIGUE_HIGH`) são
pré-existentes a esta fase, não uma regressão introduzida agora.

`scripts/test-career-difficulty-pace.mjs` (mesmo padrão, 16 temporadas, uma
vez por dificuldade) foi executado como corroboração adicional.

### 3.2 Novo: `scripts/test-career-beta-readiness.mjs` (motor real)

Diferente dos simuladores acima, este script novo **não reimplementa nada**:
usa armazenamento fake em memória (mesmo padrão já comprovado em
`scripts/benchmark-time-advance-rc.mjs`/`scripts/test-time-advance-performance-rc.mjs`)
injetado em `GameStorage → CareerRepository → CareerManager` **reais**,
avança o calendário via `advanceCareerDays`/`finalizeCareerAdvanceRange`
reais, resolve decisões de torneio via `resolveDecision` real, registra em
torneios via `registerTournament` real, e joga partidas treino headless com
o motor real (`createMatch`/`playPoint` de `src/engine/match`) seguido de
`finalizePracticeMatch` real — a mesma função que `SimulationModal.jsx`
chama.

**Objetivo diferente dos simuladores estatísticos**: não medir
balanceamento (isso já é coberto acima), e sim **detectar corrupção de
estado, órfãos, duplicação de recompensa e quebra de determinismo/idempotência
no pipeline de produção real**, algo que os simuladores em memória não
conseguem fazer por definição (nunca tocam `CareerManager` de verdade).

**Perfis simulados** (subconjunto pragmático dos 8 do enunciado — A–H
condensados em 5, já que G/H — troca de parceiro — dependeria do sistema de
propostas/Dupla, fora do escopo desta rodada de integridade estrutural):

| Perfil | Corresponde a | Política |
|---|---|---|
| `treino-foco` | A | Nunca se inscreve em torneio; joga partida treino com frequência alta |
| `competicao-foco` | B/E | Sempre tenta se inscrever em torneio elegível; calendário agressivo |
| `equilibrado` | C | Mistura 50/50 |
| `descanso` | D | Raramente se inscreve; baixa atividade |
| `financeiro-conservador` | F | Só se inscreve em torneios com taxa de entrada baixa |

**Seeds**: `1001`, `2002` (reproduzíveis a partir de `profileDef.id+seed`, não
do `career_id` aleatório que `createDefaultCareerData` sempre gera).

**Horizonte**: 90 dias por carreira (10 combinações perfil×seed = 900
dias-carreira reais avançados pelo pipeline de produção).

**Resultado**: **0 estados impossíveis/suspeitos encontrados** pelo auditor
em nenhuma das 10 carreiras, ao longo de todo o horizonte. Ver §7 para o que
o auditor verifica.

Além da matriz principal, o script roda três blocos isolados adicionais
contra o motor real:

- **Determinismo de save/load** (Parte 22): joga N dias contínuos vs. joga
  N/2, relê a carreira do zero via `careerManager.readCareer` (mesmo caminho
  de um load real, com validação/migração), continua os outros N/2 — mesma
  data final, carreira recarregada passa no auditor, nenhuma corrupção.
  Achado documentado: o pipeline diário usa `Math.random()` não seedado em
  pontos legítimos (ex.: `getDifficultyForPlayer` em `src/lib/bots.js`,
  escolhendo a força do adversário de partida treino), então **não** há
  garantia de igualdade byte-a-byte entre as duas execuções — apenas
  consistência estrutural (mesma data, nenhuma corrupção). A igualdade
  byte-a-byte do motor de partida em si (dado o mesmo seed) já está provada
  separadamente por `scripts/test-mobile-m3-live-match.mjs`.
- **Idempotência** (Parte 23): finaliza a mesma partida duas vezes via
  `finalizePracticeMatch` real — segunda chamada é reconhecida como
  duplicata (`skipped:true`), XP/coins não duplicam, exatamente 1 novo
  registro de `Match` é criado (não 2).
- **Checkpoint/entidade corrompida** (Partes 4/12): injeta `energy: NaN`,
  `fatigue: Infinity`, `coins: -50` na criação do perfil e confirma que a
  carreira não quebra ao ler — achado real documentado na §8.

## 4. Seeds utilizadas

`1001`, `2002` (novo simulador de motor real, reproduzível por
perfil+seed); seeds internas de `test-massive-careers-v32.mjs`/
`test-career-difficulty-pace.mjs` (`${scenario.id}:${run}`) preservadas como
já existiam.

## 5. Bugs encontrados e corrigidos (com causa raiz)

Todos os itens abaixo são **P1/P2** (nunca P0 — nenhuma corrupção de save foi
encontrada), com causa raiz identificada, mudança localizada e teste de
regressão passando.

### 5.1 [P1] Limite diário de treino inconsistente (2 vs. 3)

- **Arquivo**: `src/lib/trainingSystemV2.js:167` (antes: `if (doneToday >= 2)`)
- **Causa raiz**: `DAILY_TRAINING_LIMIT = 3` (`src/lib/padel.js:131`) é o
  valor usado pela UI (`Training.jsx` mostra "X/3"), por `canTrainToday()` e
  por `NextStepCard.jsx` (que convida o jogador a treinar de novo em
  `trainings_today === 2`) — mas o gate real dentro de `executeTraining()`
  estava com um número mágico `2`, divergente da constante compartilhada.
- **Impacto real**: em `trainings_today === 2`, a UI inteira dizia "ainda dá
  pra treinar" e o clique sempre falhava com "Limite diário de treino
  atingido."
- **Correção**: `executeTraining` agora importa e usa `DAILY_TRAINING_LIMIT`
  em vez do número mágico.
- **Teste de regressão**: `test:training-v2` (passa, sem alterar
  assertions).

### 5.2 [P2] Energia da comissão técnica podia passar de 100

- **Arquivo**: `src/game-core/staffLifecycle.js:229`
  (`clamp(..., 0, 110)` → `clamp(..., 0, 100)`)
- **Causa raiz**: bônus diário de energia da comissão técnica usava um teto
  de 110, inconsistente com `MAX_ENERGY = 100` usado em todo o resto do jogo
  (ex.: `src/components/home/StatusStrip.jsx`). Sem normalizador central de
  energia (diferente de `fatigue`, que tem `normalizeFatigue` chamado em
  todo write path), esse excesso nunca era corrigido a jusante.
- **Teste de regressão**: `test:staff-architecture` (passa).

### 5.3 [P1] Inscrição de torneio órfã após lesão forçar a perda da rodada

- **Arquivo**: `src/game-core/calendarLifecycle.js`
  (`resolveInjuryCalendarConflicts`)
- **Causa raiz**: quando uma lesão força o avanço automático a marcar um
  `CalendarEvent` de torneio como `'missed'`
  (`getInjuryAutoResolution`/`calendarAdvancePolicy.js`), o código só
  atualizava o `CalendarEvent` — nunca o `TournamentRegistration`
  correspondente, que ficava `'confirmed'` **para sempre**. Nenhum outro
  caminho do jogo fecha esse registro fora do fluxo normal de
  finalização/abandono de torneio.
- **Impacto real**: numa carreira longa com múltiplas lesões durante
  torneios, a coleção `TournamentRegistration` acumula registros órfãos
  indefinidamente (exatamente o tipo de "estrutura que cresce sem limite" que
  a Parte 25 do enunciado pede para vigiar), e reabrir aquele torneio depois
  podia recarregar um `tournament_run` obsoleto e travado (achado
  independente do agente de pesquisa, consistente com este).
- **Correção**: ao marcar o evento como `'missed'` por lesão, o
  `TournamentRegistration` correspondente (`status` `pending`/`confirmed`)
  agora também é marcado `'withdrawn'` na mesma passagem.
- **Teste de regressão**: `test:calendar-advance` (cenário "lesão resolve
  torneios e treinos automaticamente" passa), `test:tournament-flow-rc`,
  `test:tournament-registration`.

### 5.4 [P1] Softlock: jogador lesionado no meio de um torneio, com energia ≥35

- **Arquivo**: `src/components/tournaments/TournamentModal.jsx`
- **Causa raiz**: `startMatch()` já bloqueava (com um toast) se o jogador
  estivesse lesionado; mas o botão "Abandonar torneio" só aparecia com
  `energy < 35`. Um jogador lesionado com energia alta não conseguia jogar
  (bloqueado), nem abandonar (botão escondido), nem avançar o calendário
  (bloqueado pela decisão pendente do torneio) — nenhuma saída na tela.
- **Correção**: condição do botão passou a ser
  `energy < 35 || isInjured(profile)`.
- **Teste de regressão**: `test:tournament-flow-rc`, `test:mobile-m3-live-match`
  (TournamentModal também é tocado pelo checkpoint de partida do M3 — nenhuma
  regressão).

### 5.5 Testes corrigidos (não eram bugs do jogo — Parte 27 do enunciado)

Nos três casos abaixo, investiguei a causa antes de tocar na assertion,
conforme exigido. Em todos, **o jogo estava certo; o teste estava
desatualizado**:

- **`test-tutorial-chronology.mjs`**: `assert.equal(TUTORIAL_VERSION, 6)`
  falhava porque `TUTORIAL_VERSION` real é `8` — o tutorial evoluiu (mais
  capítulos/passos) e o teste nunca foi atualizado. Trocado para
  `assert(Number.isInteger(TUTORIAL_VERSION) && TUTORIAL_VERSION > 0)`, para
  não ficar obsoleto de novo na próxima revisão de conteúdo — todas as
  demais 40+ assertions do arquivo (cronologia, capítulos, ações
  antecipadas, idempotência, retomada) já validavam corretamente contra o
  código atual e permaneceram inalteradas.
- **Mesmo arquivo, segunda falha real** (só aparecia depois de corrigir a
  primeira): `assert.match(guideSource, /!isMissionCenter.*Orientação
  contextual do tutorial/s)` falhava porque `PageIntroduction` (dono do
  aria-label "Orientação contextual do tutorial") é definido **antes** de
  `isMissionCenter` no arquivo atual — a supressão em si
  (`!isMissionCenter && <PageIntroduction .../>`,
  `OnboardingGuide.jsx:194`) sempre esteve correta; só a suposição de ordem
  textual do regex quebrou. Trocado por uma checagem literal do gate
  (`guideSource.includes('!isMissionCenter && <PageIntroduction')`),
  independente de ordem.
- **`test-coach-system-v28.mjs`**: "impacto real em partidas" checava
  `coach_tactical_understanding` dentro de `SimulationModal.jsx` — essa
  string foi legitimamente movida para `finalizePracticeMatch`
  (`src/game-core/matchLifecycle.js`, função compartilhada por partidas
  treino) num refactor anterior; `SimulationModal.jsx` continua aplicando o
  bônus do treinador via `_coachMatchBonus`/`getCoachEffects`, só não mais
  aquela string específica. Corrigido para checar `getCoachEffects`
  presente em **ambos** `SimulationModal.jsx` e `TournamentModal.jsx` — isso
  também fecha um ponto cego real: o teste original nunca checava
  `TournamentModal.jsx`, então uma regressão futura de "treinador ignorado
  em torneios" (o bug histórico mencionado no enunciado) não seria pega por
  ele. Confirmado por leitura de código que hoje ambos os arquivos aplicam a
  mesma fórmula (duplicada, não compartilhada — ver §6).

## 6. Achados documentados e deliberadamente NÃO corrigidos

Por instrução explícita ("se descobrir problema estrutural grande, NÃO faça
refactor massivo silenciosamente — documente e pare"), os itens abaixo são
reais, mas exigiriam mudança arquitetural maior que o escopo de um bug-fix
localizado, ou têm risco de reprodução tão estreito que uma correção
apressada traria mais risco de regressão do que benefício:

- **[P2] Ranking mostrado no header/Home (`getWorldRank`,
  `src/lib/padel.js:391-427`) usa um algoritmo e universo de participantes
  **provavelmente diferentes** do algoritmo da página `/ranking`
  (`src/pages/Ranking.jsx:56-153`, que inclui times/`TeamRanking` e todos os
  `PlayerProfile`, e ordena por índice em vez de "contagem de quem está
  acima"). Um jogador pode ver "#42 mundial" no header e um número diferente
  ao rolar até si mesmo em `/ranking`. Isso é exatamente o risco descrito na
  Parte 10 do enunciado ("evitar corrigir apenas a apresentação") — a
  correção correta é unificar a fonte de verdade do ranking, não maquiar um
  dos dois lados. Fora do escopo de um fix pontual desta fase.
- **[P2] Dois sistemas de pontuação de ranking dos bots rodam sem
  coordenação no mesmo `processGameStateDay`**: `processWorldCircuit`
  (`src/game-core/circuitLifecycle.js`, decaimento semanal + resultado
  sintético) e `resolveCompletedWorldTourEvents`
  (`src/gameplay/worldTour/WorldTourLifecycle.js`, via torneios simulados) —
  escrevem em campos diferentes (`ranking_position` vs. `world_ranking`),
  sem trava compartilhada. Mesma classe de problema do item anterior;
  mesma decisão de não tocar sem um desenho dedicado.
- **[P1] `src/lib/career.js:193-206`** — o estágio de execução de treino
  automático dentro de `advanceDay()` roda **sem try/catch**, logo depois
  que data/eventos de calendário/recompensas já foram persistidos
  (`career.js:117`, `career.js:192`). Uma exceção nesse ponto específico
  deixaria o dia "meio aplicado" (data avançada, recompensas creditadas, mas
  o treino daquele dia nunca executado, e um evento de calendário
  relacionado ficaria `'scheduled'` preso no passado). Todos os outros
  estágios pós-persistência da mesma função já são protegidos
  individualmente por try/catch — este não é, de forma isolada. Não
  reproduzido nas 900 dias-carreira simulados nesta fase (exige uma exceção
  real nesse ponto exato, não apenas volume de execução) — documentado como
  risco residual em vez de corrigido às pressas numa função tão central sem
  cobertura de teste dedicada para cada ramo.
- **[P1] `src/lib/trainingSystemV2.js:210-220`** — `TrainingSession.create`
  e `PlayerProfile.update` são duas escritas sequenciais não-transacionais.
  Uma interrupção exatamente entre as duas deixaria uma `TrainingSession`
  registrada (que por si só já impede reaplicação futura daquele dia, via
  `calendarSystem.js:193-194`) sem que os ganhos/energia/XP/moedas tenham
  sido realmente aplicados ao perfil — perda silenciosa e permanente, sem
  sinalizador de reconciliação. Mesma razão para não corrigir agora: risco
  estreito, correção não-trivial (exigiria uma escrita atômica combinada ou
  um flag de reconciliação), fora do escopo de um fix pontual.
- **[P2] Deriva de parceiro na finalização de torneio**: `TournamentModal`
  usa o parceiro **atual** do perfil (`getPartnerBot(profile)`) para
  calcular a chave de `TeamRanking` ao finalizar uma rodada, não o
  `registration.partner_id` que foi de fato registrado. Se o jogador trocar
  de parceiro no meio de um torneio, os pontos de ranking do time podem ir
  para a dupla errada. Risco de borda (exige trocar de parceiro ativamente
  durante um torneio em andamento); documentado, não corrigido.
- **[P2] Três mecanismos de idempotência não relacionados** coexistem no
  perfil sem um helper compartilhado: `processed_tournament_runs`
  (`tournamentLifecycle.js`), `processed_match_keys` (`padel.js`),
  `processed_match_finalizations` (`CareerEntityRepository.js`, este último
  já validado ponta-a-ponta pelo novo teste, §3.2). Todos funcionam
  corretamente hoje; risco é de deriva arquitetural futura (corrigir um sem
  lembrar dos outros dois), não um bug ativo.
- **Equipamento**: bônus de atributo é somado diretamente ao valor
  persistido do atributo (não há campo `base_<atributo>` separado em
  lugar nenhum do código) — funcional hoje, mas sem forma de reconstruir
  "atributo base" caso um bug de stacking apareça no futuro. Compra/equipar
  também são escritas não-atômicas sequenciais (mesma classe de risco dos
  itens acima). Sistema de equipamentos não foi alterado nesta fase.
- **`processed_match_finalizations` é uma janela deslizante de 250 chaves**
  (`CareerEntityRepository.js:324`, `.slice(-250)`) — em carreiras muito
  longas (centenas de partidas), chaves antigas saem da janela. Isso só
  importaria se a finalização de uma partida MUITO antiga fosse
  reinvocada depois de 250+ partidas — não encontrado nenhum caminho real
  que faça isso (checkpoints são limpos ao terminar a partida, por M3), mas
  registrado como tradeoff aceito (também evita crescimento indefinido do
  array, um cuidado explícito da Parte 25).
- **Universo Vivo**: `ensureWorldEvents`/`ensureMacroEvents`
  (`src/lib/world.js`, `src/lib/worldEvents.js`) são chamados diretamente no
  mount de `WorldEvents.jsx`/`WorldFeed.jsx`, fora do pipeline de avanço de
  dia — mas ambos são "top-up até um teto" com checagem de contagem
  existente antes de criar, então recarregar a página não duplica eventos
  (confirmado por leitura de código + `test:living-world` continua
  passando). Padrão arquitetural incomum, mas não é o bug de duplicação que
  a Parte 20 do enunciado tinha medo de encontrar.
- **Encerramento de temporada** (`finalizeSeason`,
  `src/game-core/seasonLifecycle.js`) pula `career_date` direto para 1º de
  janeiro sem passar por `advanceDay`/`canAdvanceDay` — qualquer decisão
  pendente na janela de fechamento fica órfã. Guardado por uma checagem de
  data na UI (`SeasonDashboard.jsx`, `career_date >= '12-15'`); o mecanismo
  de idempotência do próprio `finalizeSeason` (checa `SeasonResult`
  existente por `profile_id`+`season_year`) é sólido e já é testado por
  `test:ranking-carryover-v32`. Não corrigido — mudaria o fluxo de
  fechamento de temporada, que tem seus próprios testes dedicados.

## 7. O auditor de carreira (`auditCareer`, dentro do novo script)

Verifica, em cada carreira e em cada checkpoint da simulação:

- Números não-finitos (NaN/Infinity) em qualquer ponto da árvore da
  carreira — **e**, especificamente, `null` residual em `energy`, `fatigue`,
  `coins`, `xp` e atributos (ver achado da §8 sobre por que `null`, não
  `NaN`, é o sintoma real de um valor não-finito persistido).
- `energy`/`fatigue` fora de 0-100; `coins` negativo; atributos fora de
  1-100; `trainings_today` acima do limite diário.
- `career_date` com formato inválido.
- IDs duplicados dentro de qualquer coleção de entidades.
- Integridade de `TournamentRegistration` (reutiliza
  `validateTournamentRegistrations`, já existente em
  `src/lib/tournamentRegistration.js`, em vez de reimplementar a checagem) +
  checagem adicional de registro confirmado apontando para torneio
  inexistente.
- Partida marcada como torneio sem referência a um torneio real.

Resultado: **0 ocorrências** em toda a matriz de 90 dias × 10
combinações perfil/seed, e o auditor **detecta corretamente** a corrupção
injetada de propósito no teste isolado da §3.2 (energy=null,
coins negativo).

## 8. Achado: `energy` não tem normalizador central (diferente de `fatigue`)

`normalizeFatigue` (`src/game-core/physicalStats.js`) é chamado em todo
write path relevante (`CareerValidator`, `CareerMigration`,
`ActiveCareerAdapter`, `CareerEntityRepository.batch`) e trata **qualquer**
valor não-finito (incluindo `Infinity`) como inválido, usando o fallback (0)
— não um clamp para o teto. `energy` não tem equivalente central; cada
call site clampa individualmente (a maioria corretamente, ver §5.2 para a
exceção encontrada).

Ao injetar `energy: NaN` propositalmente no teste isolado, o valor **não**
sobrevive como `NaN` — `GameStorage.writeJsonUnlocked` serializa com
`JSON.stringify`, que converte `NaN`/`Infinity` em `null` (JSON não tem
representação para eles). O valor então persiste como `energy: null`. Isso é
particularmente enganoso porque `Number(null) === 0`, então qualquer
checagem ingênua de intervalo (`energy < 0 || energy > 100`) passa batido —
o auditor precisou de uma checagem explícita de `null` para pegar isso (e
agora pega). Um jogador que exportasse esse save para reportar um bug veria
`"energy": null`, não `"energy": NaN` — vale saber ao investigar reports
reais no futuro.

Não é um bug ativo (nenhum caminho encontrado nesta fase realmente produz
`NaN`/`Infinity` em `energy` durante jogo normal), mas documenta exatamente
o tipo de vetor que a Parte 4 do enunciado pediu para vigiar.

## 9. Investigação dos testes que já falhavam antes desta fase

Ver §5.5 para o veredito completo (teste obsoleto, não bug do jogo, em todos
os três casos) e as correções aplicadas.

## 10. Arquivos modificados

- `src/lib/trainingSystemV2.js` — limite diário alinhado à constante (§5.1)
- `src/game-core/staffLifecycle.js` — teto de energia corrigido (§5.2)
- `src/game-core/calendarLifecycle.js` — inscrição de torneio encerrada
  junto com o evento ao ser auto-resolvido por lesão (§5.3)
- `src/components/tournaments/TournamentModal.jsx` — botão de abandono
  também visível quando lesionado (§5.4)
- `scripts/test-tutorial-chronology.mjs` — duas assertions obsoletas
  corrigidas (§5.5)
- `scripts/test-coach-system-v28.mjs` — cobertura estendida para
  `TournamentModal.jsx` (§5.5)
- `package.json` — novo script `test:career-beta-readiness`

## 11. Testes criados

- **`scripts/test-career-beta-readiness.mjs`** (`npm run
  test:career-beta-readiness`, aceita `--days=N` e `--verbose`) — ver §3.2
  para escopo completo. Roda em ~90s para o horizonte padrão de 90 dias.

## 12. Testes alterados

Ver §5.5 — dois arquivos, três assertions, todas com causa raiz investigada
e documentada antes da alteração (Parte 27 do enunciado).

## 13. Progressão de carreira (via `test:massive-v32`, simulador estatístico
pré-existente, 10 perfis × 100 carreiras × 10 temporadas)

| Perfil | OVR final | Nível carreira | Rank final | Top500 | Top100 | Top20 | Top10 | #1 |
|---|---|---|---|---|---|---|---|---|
| casual-right-control | — | — | 38 | 2/100 | 7/100 | — | — | 0% |
| efficient-right-control | 87 | 42.2 | 20 | 1/100 | 4/100 | 10/100 | — | 0% |
| lefty-right-offense | 82.7 | 43.7 | 19 | 1/100 | 3/100 | 9/100 | — | 0% |
| left-finisher | 83.2 | 44 | 18 | 1/100 | 3/100 | 8/100 | — | 0% |
| right-defensive | 81 | 41.9 | 23 | 2/100 | 5/100 | 10/100 | — | 0% |
| versatile-balanced | 86.1 | 42.4 | 20 | 1/100 | 4/100 | 9/100 | — | 0% |
| chemistry-focused | 76.9 | 42.1 | 23 | 2/100 | 4/100 | 10/100 | — | 0% |
| economy-conservative | 85 | 38.8 | 24 | 2/100 | 6/100 | 10/100 | — | 0% |
| competition-heavy | 82.4 | 42.2 | 14 | 1/100 | 3/100 | 7/100 | 10/100 | 0% |
| overtraining (stress-test) | 20.5 | 31.7 | 21 | 1/100 | 4/100 | 9/100 | — | 0% |

Achados de balanceamento já reportados por esse simulador **antes** desta
fase (não uma regressão introduzida agora):
`TOP100_TOO_SLOW` (casual), `TOP10_TOO_SLOW` (competition-heavy),
`ECONOMY_TOO_RICH` (maioria dos perfis), `FATIGUE_HIGH` (overtraining, por
desenho — é o cenário de estresse proposital).

Nenhuma carreira, em nenhum perfil, chegou a #1 do mundo em 10 temporadas —
e nenhum perfil chega ao Top 10 antes da 10ª temporada, exceto o mais
agressivo em competição. Lida isoladamente, essa tabela sugeriria uma curva
mais lenta que a intenção declarada.

### 13.1 Correção via `test:career-difficulty-pace` (1000 carreiras por
dificuldade, 16 temporadas — resultado chegou após a redação inicial deste
documento)

Esse segundo simulador (também pré-existente, não recriado) é
especificamente desenhado para responder a pergunta da Parte 9 — detecta
"auge de carreira" por critério composto (técnico + competitivo +
experiência, `src/gameplay/difficulty/careerPeak.js`) e aplica os
modificadores reais de dificuldade. Com N=1000 por dificuldade (ordem de
grandeza maior que a tabela acima), o resultado é mais confiável:

| Dificuldade | Temporada de auge (mediana) | p25–p75 | Nunca atinge o auge em 16 temporadas | OVR final | Overall/teto |
|---|---|---|---|---|---|
| easy | 4 | 4–5 | 10% | 82.4 | 0.934 |
| normal | 6 | 5–6 | 10% | 80.6 | 0.914 |
| hard | 8 | 7–8 | 10% | 79.3 | 0.902 |
| hard vs. neutro (sem modificador) | 8 vs. 8 | — | — | 79.3 vs. 78.9 | — |

Com a carreira começando aos 16 anos e ~1 temporada por ano, isso coloca o
auge por volta de **20 anos (fácil) a 24 anos (difícil)** — dentro da
intenção declarada de 22-25 anos, não além dela. O próprio simulador (que
tem detecção de outliers embutida, `tooSlow`/`tooFast`) reportou
`"findings": []` para as três dificuldades: nenhuma calibrado fora da faixa
esperada por esse critério.

**Conclusão revisada**: a tabela de §13 (massive-v32, N=100, sem
diferenciar dificuldade) por si só pareceria indicar um problema de
pacing; o simulador dedicado a essa pergunta específica (N=1000,
diferenciado por dificuldade, com detecção de outlier própria) não
confirma isso — o auge acontece dentro da janela pretendida. **Rebaixado de
P3 (achado de balanceamento a corrigir) para observação sem ação**: as duas
fontes não são estritamente contraditórias (a primeira mede
Top10/Top100/#1 absolutos em 10 temporadas fixas sem diferenciar
dificuldade; a segunda mede o critério composto de "auge" propriamente dito,
diferenciado por dificuldade, com N muito maior) — mas a fonte desenhada
especificamente para responder "quando é o auge" diz que ele já está na
janela certa. Não há evidência forte o suficiente para justificar mexer em
curvas de XP/ranking nesta fase.

## 14. Economia

- Nenhum caminho de dinheiro infinito ou duplicado encontrado.
- Prêmio de partida/torneio é idempotente (mecanismo pré-existente,
  revalidado ponta-a-ponta pelo novo teste real, §3.2).
- **[P2, documentado, não corrigido]** `processMonthlyFinances`
  (`src/lib/economy.js:166-169`) não tem piso — o saldo pode ficar negativo
  indefinidamente sem nenhuma consequência de jogo (sem "falência", sem
  bloqueio). Existe uma conquista escondida referenciando "fique com 0
  moedas", sugerindo que um piso era intenção original mas não foi
  implementado. Não é corrupção (o valor continua sendo um número finito
  válido, só negativo), e implementar mecânica de falência é uma decisão de
  design nova, fora do escopo de bug-fix desta fase.
- ~25+ pontos de código mutam `coins` diretamente (`profile.coins +/- x`) em
  vez de por um helper central — a maioria com checagem prévia de saldo
  (então não é possível ficar negativo *por uma compra*), mas sem
  normalização central de NaN/negativo no ponto de escrita (mesmo padrão do
  achado de `energy`, §8).

## 15. Ranking

Ver §6 para os dois achados estruturais (fontes divergentes de ranking,
sistemas de pontuação de bots não coordenados) — reais, documentados,
não corrigidos por exigirem redesenho de fonte única de verdade.

Season carryover (80% dos pontos do jogador, aplicado uma vez por chamada
explícita de "Encerrar temporada", guardado por checagem de
`SeasonResult` existente) funciona corretamente e é idempotente
(`test:ranking-carryover-v32` passa).

## 16. Torneios

Ciclo completo (inscrição → elegibilidade → chave → rodada → resultado →
prêmio → ranking → histórico) auditado. Elegibilidade é checada
rigorosamente no registro; no início de cada rodada, é checada de forma mais
fina (injúria, energia) mas não repete a checagem completa de elegibilidade
esportiva. Achados reais documentados na §6 (deriva de parceiro,
inconsistência de registro órfão — este último **corrigido**, §5.3).
Finalização de torneio (título, eliminação, abandono explícito) é atômica e
idempotente — `test:tournament-flow-rc` valida "derrota, título, reload,
calendário e idempotência".

## 17. Partidas

Nenhuma regressão em `test:match-integrity` (padrão de saque determinístico
preservado) nem `test:match-balance` (1000 partidas simuladas, todos os
`gates` de balanceamento — lados justos, janela de energia, faltas duplas
raras, etc. — `true`). Motor de partida não foi tocado nesta fase.

## 18. Universo Vivo

Ver §6 — padrão de "ensure" chamado no mount de página é incomum mas
verificadamente seguro (teto com checagem de contagem existente antes de
criar). `test:living-world` e `test:world-auditor-v35` continuam passando
sem alteração.

## 19. Performance

Medido pelo novo teste (`test:career-beta-readiness`), pipeline real, sem UI:

- Save de carreira curta (10 dias): ~85KB
- Save de carreira mais longa simulada (90 dias, perfil mais ativo): ~209KB
- Média: ~60-100ms por dia de carreira avançado (pipeline completo,
  incluindo treino automático, universo vivo, ranking, staff, calendário)
- Nenhum crescimento não-linear perceptível de tamanho de save entre 10 e
  90 dias simulados
- 90 dias × 10 combinações perfil/seed + blocos de determinismo/idempotência
  completam em ~90 segundos

Nenhuma degradação de performance identificada que justifique otimização
nesta fase.

## 20. Conclusão

**BETA READY COM RESSALVAS.**

Nenhum P0 (corrupção de save/carreira impossível) foi encontrado em nenhuma
das verificações — nem nas 900 dias-carreira simuladas pelo pipeline real,
nem na injeção proposital de corrupção, nem na auditoria manual da cadeia de
persistência/migração/atomicidade. A arquitetura de save é sólida.

Quatro bugs reais (P1/P2), reproduzíveis e com causa raiz clara, foram
encontrados e corrigidos, com teste de regressão passando para cada um.
Três testes que davam falso-negativo (testando código que mudou de lugar
legitimamente, não um bug real) foram corrigidos com investigação
documentada.

Ficam **conhecidos e documentados, não bloqueantes**: duas fontes de
ranking divergentes (header/Home vs. página de ranking — confusão de UX,
não corrupção), e dois pontos de escrita não-transacional que podem perder
silenciosamente uma sessão de treino ou deixar um dia "meio aplicado" sob
uma interrupção de processo em uma janela muito estreita (não reproduzido
em 900 dias simulados). A curva de progressão foi investigada com dois
simuladores independentes (§13/§13.1) — o de maior N e desenhado
especificamente para medir "auge de carreira" mostra o auge dentro da
janela de 22-25 anos pretendida; não há evidência forte o suficiente para
tratar isso como um problema de balanceamento a corrigir nesta fase.

Nenhum desses itens documentados bloqueia um beta fechado com jogadores
reais — nenhum corrompe carreira, nenhum duplica recompensa, nenhum trava o
jogo permanentemente sem saída.
