# LOCAL-8G — Estabilidade final de navegação (P3 remanescentes da LOCAL-8D)

Branch `integracao/cloud-6o` · base `ea79766` (LOCAL-8F) · **sem commit** (aguardando validação).

Antes de corrigir qualquer coisa, verifiquei quais achados P3 da LOCAL-8D ainda existiam.

| Achado (8D) | Situação encontrada | Ação na 8G |
|---|---|---|
| 8D-04 Torneios antecipavam o calendário | **Existia**: `Tournaments.jsx` chamava `simulatePastTournaments` + `ensureFutureTournaments` a cada abertura | Corrigido (8G-01) |
| 8D-05 Propostas: ordem e aberturas simultâneas | **Resolvido pela LOCAL-8F** | Só revalidação (8G-02) |
| 8D-10/11/12 Catálogos na 1ª visita | Treinadores: **resolvido pela 8F**. Imprensa e Enciclopédia: **existiam** | Corrigido (8G-03) |
| Data do computador | **Existia** em regra (preço da Loja) e em registros esportivos | Corrigido onde comprovado (8G-04) |
| 8D-13 Entrevistas a cada abertura | **Existia**, e com um defeito pior: reabria entrevista respondida | Corrigido (8G-05) |

## 8G-01 — Torneios e temporadas

**Ciclo de vida (investigado).**

- O calendário inicial (temporada de 2026) vem de `localSeed`.
- O motor mantém **15 meses** à frente na virada de cada mês (`career.js`, `monthlyBoundary:ensureFutureTournaments`, horizonte = data + 15 meses).
- A virada de temporada (`seasonLifecycle`) também chama `ensureFutureTournaments`.
- A geração é determinística (`buildSeasonTournaments` por ano, chave `ano:circuit_code`, upsert idempotente, que já evitava regravação desde a 5.24-B).
- Nenhum consumidor depende de eventos além do horizonte mantido pelo motor.

**Defeito.** `Tournaments.jsx` repetia o trabalho do motor a cada abertura:

- Com a data do dia, antecipava os torneios da borda do horizonte. Na temporada 10, medido: +2 torneios e 1 gravação na 1ª abertura.
- Perto do fim do ano, podia criar a `Season` seguinte (`Season.create`, id aleatório) antes do motor.
- Rodava `simulatePastTournaments`, reparo legado que ignora os eventos do circuito mundial (`world_tour_event`) e não faz nada em saves modernos.

Não havia efeito em inscrições, chaves, resultados, pontos ou parceiro inscrito, o que confirma a 8D.

**Correção.** A página só consulta. Nada foi movido para o avanço diário: o motor já fazia esse trabalho no ponto certo.

**Prova** (`test-local-8g-navigation-stability.mjs`):

- Abrir Torneios 2× em t1/t5/t10: **0 registros e 0 gravações**. Antes: +2 torneios na temporada 10.
- **Virada de mês** (29/03 → 02/04) e **virada de temporada** (29/12 → 02/01), comparando A (sem visita) e B (abrindo Torneios todo dia): calendário (810 e 895 torneios), temporadas e inscrições **idênticos**, nos dois casos.
- O horizonte mantido pelo motor ficou em 15,0 e 14,9 meses.

## 8G-02 — Propostas de parceiros (resolvido pela LOCAL-8F)

Revalidado sem mudar código:

- inicializações simultâneas sem erro;
- reabertura com mesmas propostas e mesma ordem;
- recusa parcial grava só a recusa;
- recusa total não gera lote novo;
- calendário: +3 dias cria uma janela (4 propostas), +7 dias (mesma janela) não duplica, +10 dias abre a janela seguinte (4);
- nenhum candidato repetido em 12 propostas;
- aceitação e confirmação da dupla;
- save → load → reabrir com propostas idênticas.

**O achado P3 está resolvido pela LOCAL-8F.** A negociação antecipada não foi implementada.

## 8G-03 — Catálogos na primeira visita

| Catálogo | Fonte canônica | Estado de jogo? | Antes | Depois |
|---|---|---|---|---|
| Treinadores | `COACHES_DATA` | sim (contratos) | criado na 1ª visita | **ativação (8F)**, sem mudança aqui |
| Clubes, missões, Loja | catálogos estáticos | sim | 1ª visita | **ativação (8F)** |
| Imprensa (jornalistas) | `pressData.JOURNALISTS` | sim, depois da 1ª entrevista (`bias_toward_player`, `interviews_done`) | **1 upsert por jornalista** na 1ª visita (14 registros, 12 gravações) | montado **em memória** e persistido só na 1ª resposta a uma entrevista (upsert do registro inteiro) |
| Enciclopédia | `encyclopediaData.ENCYCLOPEDIA_ENTRIES` | **não** (conteúdo de leitura) | 62 entradas copiadas para o save na 1ª visita | lida do catálogo estático, sem gravação (entradas extras que um save antigo já tenha são preservadas na exibição) |

Nenhum catálogo novo foi para a ativação, e o custo da ativação da temporada 10 **não aumentou**. A Imprensa e a Enciclopédia ficaram mais baratas que antes: não persistem dado derivável.

## 8G-04 — Data do computador

Classificação dos usos de `new Date()`/`Date.now()` (200 em 84 arquivos):

- **Tempo real legítimo** (mantido): carimbos `created_at`/`updated_at`, `answered_at`, backups, medições (`performance`, perfis), nomes de arquivo, logs e diagnósticos.
- **Fallback defensivo** (mantido): `profile.career_date || new Date()` em cerca de 30 funções. Numa carreira válida, a data da carreira sempre existe (`ensureMyProfile` garante `2026-01-01`).
- **Dependência indevida comprovada** (corrigida):

| Uso | Efeito | Correção |
|---|---|---|
| `computeItemPrice`: oscilação de preço pelo **dia do mês do PC** | mudar a data do computador mudava os preços da Loja (medido: 5 271 × 4 728 para o mesmo item) | dia da **data da carreira** (`Shop.jsx` passa `profile.career_date`) |
| `relationships.updateRelationshipScore` / `seedInitialRelationships` | histórico e última interação com a data real | `getActiveCareerDate()` (`src/lib/careerClock.js`, novo) |
| `partnershipSystem.addConflict`, `recordPartnershipMatch/Title` | conflitos e química no histórico da dupla com a data real | data da carreira |
| `fanBase.reactToEvent` (fechamento mensal de fãs) | histórico e última reação com a data real | `context.careerDate` |
| `Shop.jsx`: `acquired_date` do item comprado | data real | data da carreira |
Prova: com o relógio do sistema simulado em 2026-10-03 e 2041-05-17, o preço é idêntico e os registros usam a data da carreira. Antes, todos usavam a data do relógio simulado.

**Encontrado e NÃO corrigido (revertido):** `careerDefaults.js` grava `metadata.career_date` e `metadata.season` com a data **do PC** na criação. A lista de carreiras mostra 2026-10-21 / 2026 em vez de 2026-01-01; num PC em 2041, mostraria 2041. É só exibição. Corrigi e reverti, porque alterar o que `createDefaultCareerData` grava:

1. muda os bytes do save comparados pelo baseline histórico da CLOUD-7B1, que as regras da fase mandam preservar;
2. remove uma chamada ao relógio determinístico dos testes 7G.1, 7H e 7H.1, o que desloca toda a sequência de ids e muda o cenário sorteado.

O 7G.1 passou a falhar porque, no novo cenário, um membro da dupla "intacta" se aposenta naturalmente antes da liquidação. A política do motor está correta; o teste é frágil. Reproduzido também no HEAD só com o deslocamento do relógio, com o resto da 8G revertido. A correção da `metadata` fica para uma fase que autorize regenerar esses baselines.

Idade, vencimento de contratos, calendário, torneios, patrocínios e simulação já usavam a data da carreira: nenhum uso indevido foi encontrado nesses caminhos.

**Não corrigido** (fora da regra esportiva, documentado): reações aleatórias de fãs usam `Math.random` (texto cosmético); o botão manual "gerar notícias" é aleatório por ser ação explícita.

## 8G-05 — Entrevistas

**Ciclo de vida.** Entrevistas são derivadas de fatos (partidas, inscrições, dupla, rivalidade) por `getPendingInterviews`. `ensureContextualCareerCommunications` (Home, sino e Central) cria o registro `PressInterview` e a mensagem com ids estáveis por `sourceId`. A resposta, em `Press.jsx`, aplica reputação, contadores e o jornalista **uma única vez** por `sourceId` (`processed_press_interview_sources`). Esse caminho já era idempotente e foi mantido.

**Defeitos** (8D-13):

1. A cada abertura da Home ou da Central, **todo `PressInterview` pendente era regravado** (`upsert` com o mesmo conteúdo): uma serialização do save por visita.
2. O mesmo `upsert` gravava `interview_status: 'available'` por cima de um registro já **respondido**. Medido no HEAD: uma entrevista marcada como respondida voltava a "available" na abertura seguinte. A reputação não era reaplicada (protegida pelos `processed_*`), mas o registro mentia sobre o estado.

**Correção.** Grava só quando o registro não existe ou mudou de fato, e nunca sobrescreve um registro respondido.

**Prova:** reabrir Home/Central gera 0 alterações em entrevistas; uma entrevista respondida continua "answered"; save → load → Central mantém as entrevistas idênticas.

**Observação, não corrigida (onboarding):** entrar na Home conclui a etapa 1 do tutorial ("Conheça o painel da carreira") e paga 50 moedas **uma única vez**, com ids determinísticos. É progressão de tutorial por visita, prevista no desenho do tutorial; mantido.

## Testes antes/depois

`scripts/test-local-8g-navigation-stability.mjs` roda em dois modos: HEAD (`ea79766`, modelos fiéis das páginas antigas) e corrigido.

| Execução | Resultado |
|---|---|
| Código do HEAD (`stability-before-fix.json`) | **21 PASS e 10 FAIL** |
| Código corrigido (`stability-after-fix.json`) | **31 PASS e 0 FAIL** |

As 10 falhas do HEAD:

- Torneios na temporada 10 (+2 torneios);
- Imprensa (14 registros, 12 gravações);
- Enciclopédia (62 registros);
- preço pela data do PC;
- 3 registros com a data do PC;
- regravação de entrevistas;
- entrevista respondida reaberta;
- save/load de entrevistas divergente.

## Determinismo e save/load

**Chrome real, dev server reiniciado** (`tools/determinism.mjs`, cópia da 8F):

- **A:** carregar e avançar 1 dia.
- **A':** repetir A.
- **B:** abrir Torneios, Torneios/calendário, Imprensa, Enciclopédia, Central de comunicações, Home, Loja e Duplas, e avançar 1 dia.

| Cenário | Ruído A×A' | Atribuível à navegação | Atletas / treinadores / partidas / missões / itens |
|---|---|---|---|
| t5-com-dupla | nenhum | **nenhum** | 0 / 0 / 0 / 0 / 0 |
| temporada 1 | `MissionProgress` (também em A×A') | **nenhum** | 0 / 0 / 0 / 0 / 0 |

**Auditoria por rota** (`tools/route-audit.mjs`, carreira nova e temporada 10, 8 rotas): **0 registros** alterados na 1ª abertura e **0 gravações** na 2ª. A gravação da 1ª visita é a introdução de página do onboarding. Torneios faz centenas a milhares de chamadas a `Math.random` ao **renderizar**, sem nenhuma gravação; é componente visual, sem efeito no estado.

**Save/load:**

- propostas (save → load → reabrir) idênticas;
- entrevistas (save → load → Central) idênticas;
- teste integrado de carreira nova no Chrome com a 8G: **9/9** (`integrated-new-career.json`). Cobre a criação pela interface, propostas, aceite pela interface, 9 telas, 3 dias, recarga e uma nova navegação sem nenhuma alteração.

## Desempenho

| Tela (1ª abertura) | Antes: registros / gravações / ms | Depois |
|---|---|---|
| Torneios, temporada 1 | 0 / 0 / 18 | 0 / 0 / 1 |
| Torneios, temporada 5 | 0 / 0 / 11 | 0 / 0 / 2 |
| Torneios, temporada 10 | **2 / 1 / 877** | **0 / 0 / 4** |
| Imprensa (t5-com-dupla, 37 MB) | **14 / 12 / 4 686** | **0 / 0 / 0** |
| Enciclopédia | **62 / 1 / 492** | **0 / 0 / 0** |
| Home/Central (reabertura) | **1 / 1 / 339** | **0 / 0 / 1** |

Na temporada 10 (SSR, em memória, `tools/advance-cost.mjs`):

- **Ativação:** cerca de 12 s e 8 gravações, uma única vez num save antigo sem catálogos. É o custo da 8F; a 8G **não acrescentou** nada à ativação.
- **Avanço diário:** 1,6 a 2,1 s por dia, medido com a CPU disputada pelos testes de navegador. O baseline da LOCAL-8A era 1,16 s de mediana, medido isoladamente.
- **Estágio de conquistas** (8F), medido à parte: 26–63 ms por dia em regime; a 1ª execução custa 2,6 s, porque inclui a reconciliação única do save antigo.
- **Heap:** 558 MB depois de 5 dias. **Save:** 64,3 MB.

Nenhum custo foi transferido de forma oculta: o que saiu das telas (Imprensa, Enciclopédia, Torneios) simplesmente deixou de existir, porque o motor ou o catálogo estático já cobriam.

## Regressões

92 testes: 87 SSR e 5 no navegador. São os da 8F, mais calendário, persistência, CLOUD-7B1/7B2A, imprensa, entrevistas, viradas de ano e torneios.

| Grupo | Resultado |
|---|---|
| LOCAL-8C (22 + navegador 35), 8D (sondas), 8E (22/41/52), 8F (60), 8G (31) | PASS |
| 5.32-A/B/C/C.1 (64, 18, 164, 69, 162, 58, 160, 51) | PASS |
| LOCAL-7D, 7E, 7F, 7G, 7G.1, 7H, 7H.1 · CLOUD-7D1 · CLOUD-6N · CLOUD-7B2A (determinismo) | PASS |
| Propostas, primeira dupla, pós-separação, missões, conquistas, tutorial, treinadores | PASS |
| Torneios e calendário (registration-v2, calendar-advance-v24, consecutive-eligibility, header-next-tournament, global-header-calendar, viradas de ano: ranking, Race, ano 2) | PASS |
| Entrevistas e imprensa (response-consistency, variety, post-match, phase15-5-1, hotfix-rc1-press-v2) | PASS |
| Persistência (career-persistence-integrity) | PASS |
| `sponsor-eligibility-authority-v526c` (3/7) | **preexistente**: teste anterior à regra "prova de carreira: 1 torneio disputado"; sua fixture não tem torneios |
| `premium-market-v33-4` | **preexistente**: exige `version === '0.9.0-beta.8'` |
| `hotfix-rc1-press` | **preexistente**: exige a rota `'/press'` em `careerCommunications.js`, que não existe nem no HEAD nem na `main` (a rota é `/world/circuit?tab=press`) |
| `test-cloud-7b1-save-pipeline`: equivalência byte a byte com o baseline histórico | **preexistente**: falha também com o código de `4226055` (LOCAL-8D, antes da 8E/8F/8G), medido trocando os arquivos de `src`. O baseline não acompanha as mudanças de comportamento anteriores; regenerá-lo exige decisão (as regras desta fase mandam preservá-lo) |

**Ocorrência durante a fase, resolvida:** com a mudança da `metadata` em `careerDefaults` (depois revertida, ver 8G-04), 7G.1/7H/7H.1 falharam por deslocamento do relógio determinístico. Revertida a mudança, os três passam. As falhas de 8C e da sonda 8D numa rodada intermediária foram contaminação: os arquivos estavam trocados para a bisseção. Repetidas com os arquivos estáveis, passam.

**Gates:** `npm run lint` OK, `npm run build` OK, `npm run validate:architecture` OK, `git diff --check` OK.

**Testes antigos alterados:** nenhum.

**Relatórios versionados** regenerados pelos testes foram restaurados com `git checkout`.

## Arquivos

**Produção:**

- `src/pages/Tournaments.jsx`
- `src/pages/Press.jsx`
- `src/pages/Encyclopedia.jsx`
- `src/lib/careerCommunications.js`
- `src/lib/marketEngine.js`
- `src/pages/Shop.jsx`
- `src/lib/relationships.js`
- `src/lib/partnershipSystem.js`
- `src/lib/fanBase.js`
- `src/game-core/fanLifecycle.js`
- `src/lib/careerClock.js` (novo)

**Teste:** `scripts/test-local-8g-navigation-stability.mjs`.

**Evidências:** `reports/local-8g-navigation-stability/`.

**Formato de save:** inalterado (versão 21). Nenhuma incompatibilidade.
