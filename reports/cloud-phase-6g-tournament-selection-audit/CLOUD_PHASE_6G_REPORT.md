# CLOUD-6G — Tournament Selection & Competitive Progression Audit

Fase **exclusivamente de diagnóstico**. Nenhum código de produção, balanceamento, regra de ranking, schema de save, versão, economia, fadiga ou treinamento foi alterado. O diff contém este relatório, dois scripts (auditoria e teste de caracterização) e os dados em `data/`.

Rótulos usados em cada conclusão:

- **[CÓDIGO+TESTE]** — confirmada por leitura de código e por teste executado.
- **[SIMULAÇÃO]** — observada em simulação/dados (motor real, mundo semeado ou CSVs da 6D).
- **[HIPÓTESE]** — plausível, ainda não comprovada.

| Item | Valor |
|---|---|
| Repositório | `joseotaviocosta-lang/Padel-Legacy-New` |
| Origem | `cloud/phase-6f-tournament-tier-transition` @ `51a6f1b` (confirmado; worktree limpo) |
| Branch | `cloud/phase-6g-tournament-selection-audit` (local, **sem push, sem PR**) |
| Funções reais usadas | `EntryManager.evaluateTournamentEntry/buildAthleteEntryContext`, `circuitCatalog.getTournamentTierConfig/getTierRankingFit/getTournamentChoiceProfile`, `WorldTourLifecycle.buildPlayerTournamentField` (o mesmo construtor de campo do sorteio do jogador), `tournamentSettlement.buildSeededDrawSlots`, motor `createMatch/playPoint` |
| Observação de ambiente | `npm ci` foi executado para rodar os scripts (`node_modules/` é ignorado pelo git; nenhum arquivo rastreado mudou) |

---

## 1. Respostas diretas (Etapa 6)

| # | Pergunta | Resposta | Tipo |
|---|---|---|---|
| 1 | O jogador real enfrenta a mesma barreira do simulador? | **Sim, a partir do rank da dupla ≤ 400.** O teto da base remove Bronze/Silver e sobram Gold (direto), Platinum e Masters (qualifying). Nesses campos a 1ª rodada tem adversário médio de ~72–80 OVR contra uma dupla de ~42–51: Δ ≈ −25 a −35, ~0% de vitória no motor. Entre os ranks 401 e ~900 o jogador **tem** alternativas que o harness não usou (ver 2 e 3). | [CÓDIGO+TESTE] elegibilidade; [SIMULAÇÃO] força dos campos |
| 2 | O simulador representa corretamente as regras de inscrição? | **Parcialmente.** A inscrição em si usa a função real (`registerTournament`, com `teamRank` real). **A lista de candidatos que o harness oferece à política não é a do jogo**: filtra `minRanking` pelo rank **individual** (o jogo usa o rank da **dupla**) e, por isso, nunca oferece o **Gold por qualifying** (dupla 451–900), que a tela mostra como acessível. Em 48–59% das semanas com rank da dupla (conforme a execução) o conjunto de tiers visível ao harness difere do real. | [CÓDIGO+TESTE] + [SIMULAÇÃO] (§3) |
| 3 | Uma estratégia melhor de escolha resolve parte do problema? | **Sim, até o teto de 400; não depois dele.** Com rank da dupla 440–720 a escolha por adequação/progressão (C) sobe a chance de vencer ≥1 partida de 0,11–0,26 (A) para 0,56 e mantém o jogador em Bronze/Silver onde vence. Com rank ≤ 400 (estados N4/O3) **todas as estratégias — inclusive a de informação perfeita — caem no Gold direto e perdem a 1ª rodada**. A estratégia adia a barreira, não a remove. | [SIMULAÇÃO] |
| 4 | Existe lacuna real entre Silver e Gold? | **Sim, na oferta de torneios acessíveis.** Silver/Bronze são montados "mais fraco primeiro" (OVR 35–51) e o Gold por maior pontuação de corte (OVR 64–82). A população tem pares de força 50–70 (≈ 20% dos atletas), mas eles estão espalhados nos ranks individuais 451–1000, onde nenhum tier os reúne. | [CÓDIGO+TESTE] construção do campo; [SIMULAÇÃO] distribuição |
| 5 | Qual intervenção seria mais segura? | **Primeiro corrigir o instrumento e a informação ao jogador (sem tocar em regra de ranking, schema ou balanceamento)**: alinhar o harness às regras reais e tornar visível o risco competitivo (a "chance de título" hoje ignora a força do campo: Gold com rank 443 mostra 40%; o motor dá ~0% na 1ª rodada). Só depois, e com medição em carreiras de meio de jogo, avaliar degrau estrutural (§7). | recomendação |
| 6 | Quais evidências ainda faltam? | Campos de meio de carreira em ≥3 sementes, playtest humano, regra de pontos do qualifying, defasagem entre inscrição e rank semanal (§9). | — |

---

## 2. Mapa do fluxo real de inscrição (Etapa 2)

```
Tournaments.jsx  (lista)                       src/pages/Tournaments.jsx
  ├─ prepareTournamentList: remove só eventos já fechados no dia 1 da carreira
  ├─ abas: Todos | Legacy Finals | … | Bronze | Pré-Temporada  (filtro por TIER, não por elegibilidade)
  ├─ teamRank = getTeamRank(perfil, parceiro).rank            ← rank da DUPLA (0 se sem parceiro/sem pontos)
  └─ TournamentCard: evaluateTournamentEntry(buildAthleteEntryContext(perfil, teamRank, torneio))
       ├─ rótulo verde/vermelho "· Chave principal | Qualifying | Wildcard | … | Não elegível"
       │   (fica no botão "Análise do treinador", recolhida por padrão)
       └─ "Análise do treinador": titleChance / semifinal / lucro / pontos / fadiga
                                  ← evaluateTournamentChoice → getTournamentChoiceProfile(torneio, rank)

TournamentRegistrationModal.jsx                src/components/calendar/
  ├─ checkTournamentRequirements (calendarSystem.js:93): min_level, evaluateTournamentEntry,
  │     taxa, parceiro, janela de inscrição  → habilita/desabilita o botão; mostra entry.reason
  └─ registerForTournament → registerTournament (tournamentRegistration.js:299)
        └─ evaluateTournamentRegistration: janela, já inscrito, jogador/parceiro ativos,
           saída de parceria, SPORTING_INELIGIBLE (evaluateTournamentEntry), moedas, vagas,
           DATE_CONFLICT (sobreposição de agenda); REST_ADVISORY é só aviso
        └─ grava TournamentRegistration(entry_path), desconta taxa, cria CalendarEvent
           (metadata: qualifying_required, team_rank, …); janela de prioridade desconta 1; wildcard é consumida

D-3  ensureTournamentDraw (tournamentDraw.js)  →  buildPlayerTournamentField
        main  = melhores pares elegíveis pela pontuação de corte (tiers com corte)
                ou MAIS FRACOS primeiro (Bronze; Silver com deslocamento de 25%)
        qualifying = pares elegíveis MAIS FRACOS por rank, fora da chave principal
        adversário de cada rodada = melhor cabeça de chave do bloco-espelho
```

Respostas pontuais:

1. **Quais torneios aparecem?** Todos os torneios oficiais ainda relevantes de todos os tiers, independentemente da elegibilidade. **[CÓDIGO+TESTE]**
2. **Quais podem ser selecionados?** Os que passam em `checkTournamentRequirements` + `evaluateTournamentRegistration`. A elegibilidade esportiva é só o rank da dupla (sem checagem de OVR/força; `minLevel` do tier é descritivo). **[CÓDIGO+TESTE]**
3. **Bloqueios e motivo:** `overqualified` ("Ranking já classifica para tiers acima (Top 400)"), "Ranking necessário: Top N ou convite", janela fechada, sem vaga, conflito de datas, moedas, parceiro indisponível. O motivo aparece no modal; o card só mostra "Não elegível". **[CÓDIGO+TESTE]**
4. **Ranking usado:** **sempre o da dupla** quando `teamRank > 0`. Se `teamRank` é 0/nulo, `buildAthleteEntryContext` **recai no rank individual** (`profile.world_ranking`). Efeito: dupla ainda sem ranking com individual 380 é tratada como rank 380 e barrada do Silver (teste `OBSERVAÇÃO` em `test-tournament-selection-divergence-6g.mjs`). **[CÓDIGO+TESTE]**
5. **Qualifying / direta / wildcard / convites:** ordem de avaliação em `evaluateTournamentEntry`: janela de prioridade → special exempt → ranking protegido → wildcard → convite júnior → convite nacional → Silver sem ranking → **teto da base** → direta (`rank ≤ minRanking`) → qualifying (`rank ≤ max(2×min, min+80)`; Gold 451–900, Platinum 321–640, Masters 231–460) → inelegível. A janela de prioridade (4 inscrições garantidas após vencer um qualifying) ignora **qualquer** corte, inclusive o teto. **[CÓDIGO+TESTE]**
6. **A interface diferencia acessível / bloqueado / arriscado?** Diferencia acessível × bloqueado (rótulo verde/vermelho; botão desabilitado; motivo no modal). **Não diferencia "arriscado"**: `getTournamentChoiceProfile(torneio, rank)` só recebe o rank; não há OVR da dupla nem do campo. Medido: Gold com rank 443 mostra título 40%, Silver 69%, Bronze 47%; o motor dá ~0% de vitória na 1ª rodada do Gold e 22–32% no Silver. No rank 462, Gold (qualifying) mostra 65%. **[CÓDIGO+TESTE]** (valores fixados em teste) + **[SIMULAÇÃO]** (motor)
7. **Seleção automática no jogo real?** **Não para o jogador.** `chooseTournament` (TournamentSelectionAI) só é chamado por `SeasonScheduler` e `WorldTourLifecycle` (IA e montagem de campo). `weeklyCareerReview.buildUpcomingTournamentPlanning` produz uma recomendação ("Melhor opção", pontuada por `fit×2 + retorno − risco`) que **não registra nada**. **[CÓDIGO+TESTE]** (busca de chamadores)

---

## 3. Comparação jogo × simulador (Etapa 3)

Estados de carreira = linhas reais dos CSVs da 6D (rank individual, rank da dupla, OVR do jogador e do parceiro). Elegibilidade por `evaluateTournamentEntry` com o rank da dupla; "visível ao harness" = filtro de `sim-progression-economy-v526.mjs:596` (rank individual ≤ `minRanking`). Dados: `data/harness-vs-game-eligibility.json`.

| Aspecto | Jogo | Harness (6D) | Divergência |
|---|---|---|---|
| Torneios disponíveis | todos os oficiais com janela aberta | `registrationCandidates`: mesmos, janela aberta | nenhuma |
| Filtro `minRanking` | rank da **dupla** (via elegibilidade) | rank **individual** (`wr.rank`) | **sim** |
| Gold por qualifying (dupla 451–900) | oferecido ("Qualifying") | filtrado antes de chegar à política | **sim** |
| Inscrição | `registerTournament` + `teamRank` real | a mesma função, `teamRank` real | nenhuma |
| Escolha | humana; recomendação não vinculante | `best-eligible` (normal) / `best-fit` com rank individual (otimizador) | política, não regra |
| Motivo da escolha | percepção do jogador + "Análise do treinador" (rank-only) | ordem do tier / `isRankInTierDiagnosticCore(rank individual)` | política |
| Wildcard/convites/prioridade | contornam corte e teto | não exercitados | lacuna de cobertura |

Medição por semana com rank da dupla (`data/harness-vs-game-eligibility.json`):

| Execução | Semanas com rank da dupla | Semanas em que o harness esconde tier elegível no jogo | Semanas com Gold-qualifying aberto (dupla 451–900) | …dessas, escondidas pelo harness | Mediana de \|individual − dupla\| |
|---|---|---|---|---|---|
| normal 6D | 111 | 66 | 33 | 33 | 13 |
| otimizador 6D | 124 | 59 | 31 | 24 | 11 |
| normal baseline | 111 | 61 | 25 | 25 | 11 |
| otimizador baseline | 124 | 67 | 25 | 25 | 32 (máx. 553) |

**[SIMULAÇÃO]** (contagens sobre CSVs; funções de elegibilidade reais). Os testes `DIVERGÊNCIA:` em `scripts/test-tournament-selection-divergence-6g.mjs` fixam os dois casos mínimos (individual 600/dupla 600; individual 437/dupla 462). **[CÓDIGO+TESTE]**

Achados adicionais:

- **Gold direto ocorreu sempre que dupla ≤ 450**; em 3 de 4 execuções o primeiro Gold foi direto. O otimizador 6D usou qualifying 3× no Gold (fev/2027, dupla 453–471); nas 10 partidas de qualifying da execução (Gold e Platinum) foram 7 vitórias, adversário mediano 48 — o único caso em que o harness exerceu o caminho que o jogo oferece desde a dupla 900. **[SIMULAÇÃO]**
- Participações em Gold sem vencer partida rendem pontos (rodada 1 do Gold = 5 pelo catálogo; 7 nos CSVs; um título Bronze = 10). Na 6D normal o rank da dupla foi de 443 (04/02/2027) a 387 (18/03/2027) com derrotas na 1ª rodada do Gold (uma única entrada em Bronze no intervalo). O rank avança por **participação**, não por força, e ao cruzar 400 fecha a base. **[SIMULAÇÃO]**; que isso decorre do `roundPoints` é **[CÓDIGO+TESTE]** (config), o mecanismo completo ao longo de uma temporada é **[HIPÓTESE]**.
- Linhas "jogado mas inelegível" (Silver com dupla 357/358/197) resultam da **defasagem entre a inscrição e a linha semanal do CSV**; a 6F já explicou o caso. A data de inscrição não está nos CSVs, então não dá para fechar. **[HIPÓTESE]**
- Divergência menor: o modal usa `checkTournamentRequirements` (inclui `min_level`), enquanto o harness chama `registerTournament`, que não checa `min_level`. Não verificado se `Tournament.min_level` é preenchido. **[HIPÓTESE]**

---

## 4. Estratégias de inscrição (Etapa 4)

Escopo: 7 estados reais de carreira (normal: ago/26, out/26, fev/27, mar/27; otimizador: out/26, fev/27, mar/27), cenários curtos de **um torneio por estado**, sem temporada completa. Motor real, n = 60 chaves por opção (sementes determinísticas `6g:…`). Decisão e resultado em mundos diferentes para não dar conhecimento perfeito do sorteio:

- **Decisão:** mundo A (semente `6g-world-a`), usado como "experiência prévia" do jogador.
- **Resultado:** mundo B (semente `6g-world-b`) — outro conjunto de atletas e campos.
- Sensibilidade: repetição usando as medianas de adversário **observadas** na 6D (meio de carreira) por tier/estágio/rodada (`data/strategy-comparison-observed-fields.json`).

Estratégias:

- **A_harness** — maior tier elegível, com o filtro do harness (rank individual). É a política da 6D/6F.
- **A_real** — maior tier elegível pelas regras reais (rank da dupla, inclui qualifying). Referência teórica: escolhe Platinum/Masters por qualifying; não foi usada pelo harness.
- **B_closest** — adversário da 1ª partida mais próximo da força da dupla (média do OVR), estimado pelo mundo A.
- **C_balanced** — maximiza os pontos de ranking esperados ao longo da chave, estimando a chance de vitória por rodada com uma curva Δ-de-força → vitória calibrada no motor (informação: rank e OVR da dupla, tier e adversários típicos da experiência prévia; **sem** conhecer o sorteio).
- **oracle** — melhor opção realizada no mundo B (limite superior, informação perfeita).

Resultado agregado nos 7 estados (média de P(vencer ≥ 1 partida) | soma de pontos esperados | média de rodadas ganhas na principal):

| Estratégia | Mundos A/B (dia ~8) | Campos observados 6D |
|---|---|---|
| A_harness | 0,11 \| 27,4 \| 0,21 | 0,26 \| 26,6 \| 0,19 |
| A_real | 0,00 \| 0,0 \| 0,00 | 0,04 \| 0,0 \| 0,00 |
| B_closest | 0,38 \| 26,7 \| 0,83 | 0,36 \| 26,9 \| 0,46 |
| C_balanced | **0,56 \| 38,0 \| 1,63** | **0,56 \| 37,3 \| 1,62** |
| oracle | 0,52 \| 39,3 \| 1,39 | 0,56 \| 37,3 \| 1,62 |

Por estado (escolha de cada estratégia; entre parênteses P(≥1 vitória) quando relevante; pontos do Gold direto = 5 por derrota na 1ª rodada):

| Estado (dupla / individual · OVR dupla) | A_harness | B_closest | C_balanced |
|---|---|---|---|
| N1 722/702 · 37 | Silver (0,15) | Bronze (0,53) | Bronze (0,53) |
| N2 500/521 · 39 | Silver (0,17) | Bronze · Gold-qual no campo observado | Bronze (0,67) |
| N3 443/432 · 42,5 | Gold direto (0) | Silver (0,22) | Bronze (0,83) |
| N4 387/373 · 43,5 | Gold direto (0) | Gold direto (0) | Gold direto (0) |
| O1 520/516 · 48 | Silver (0,60) | Silver (0,60) | Bronze (0,95) |
| O2 462/437 · 50 | Gold-qual (0 / 0,93 no campo observado) | Silver (0,52) | Bronze (0,95) |
| O3 389/381 · 51 | Gold direto (0) | Gold direto (0) | Gold direto (0) |

Leituras:

1. **[SIMULAÇÃO]** A escolha importa enquanto o jogador **pode** escolher: com rank 440–720, C vence ≥ 1 partida em 53–95% dos casos contra 0–60% de A. O Δ de força é o fator dominante, e o rótulo de tier não informa isso.
2. **[SIMULAÇÃO]** Em N4 e O3 (dupla ≤ 400) as quatro opções são Gold direto, Platinum e Masters por qualifying; o oráculo também escolhe Gold direto e **perde a 1ª rodada**. Nenhuma estratégia contorna o teto.
3. **[SIMULAÇÃO]** A_harness só "ganha pontos" no Gold porque a derrota na 1ª rodada paga 5 pontos; a métrica de pontos subestima o problema (0 vitórias).
4. **[SIMULAÇÃO]** Gold por qualifying depende do mundo: nos mundos A/B os 3 adversários do qualifying têm OVR 59,5–68 (P(vitória) ≈ 0 para dupla 37–50); nos dados de meio de carreira da 6D têm 38–55,5 (otimizador venceu 7 de 10). Isso indica que **o degrau intermediário existe em parte do tempo** e some conforme o mundo evolui — sem a medição em mundos de meio de carreira não se pode afirmar a tendência.
5. **Limite:** o experimento é de **um torneio por estado**. Não mede a trajetória (o jogador que fica em Bronze ganha pontos mais devagar; o efeito sobre o ranking e sobre o momento de cruzar 400 não foi simulado). Os pontos de qualifying eliminado foram assumidos como 0 (não verificado).

---

## 5. Investigação do Gold (Etapa 5)

Dados: `data/player-field-composition.json`, `data/world-strength-supply.json`. Mundos A/B no dia ~8 (o kit de testes não avança além de decisões de calendário; não foi possível aquecer para 2027).

1. **Por que o qualifying é tão mais fraco que a chave principal?** **[CÓDIGO+TESTE]** Por construção, em `buildPlayerTournamentField`: a chave principal é preenchida com os pares elegíveis de **maior pontuação de corte** (`fieldAdmissionScore` = força × encaixe), e o qualifying do jogador com os **elegíveis de pior rank, fora da chave principal** (`sort` por rank decrescente). São, de propósito, as duas pontas do conjunto elegível.
2. **Como a chave principal é selecionada?** Pares elegíveis (`aiFieldContext`) → preferidos primeiro (os que a IA escolheria nesse tipo de semana) → ordem pela pontuação de corte → primeiros `bracketSize − 1` (31 no Gold). Resultado nos mundos A/B: pools elegíveis de 141 e 320, 31 selecionados, OVR de 64 a 82,5 (mediana 73–76). **[SIMULAÇÃO]**
3. **A diferença de OVR é regra ou concentração artificial?** Mistura. **(a) Regra:** o Gold usa a ponta alta do pool, Bronze/Silver usam a baixa (`fieldAdmissionScore` inverte o sinal nos tiers abertos; Silver tem deslocamento de 25%). Os campos Bronze/Silver têm ranks de dupla **piores** (560–940 / 470–840) que o jogador (443), mas OVR 35/45–51 — são os pares de menor OVR entre os elegíveis, não os "naturais" para esses ranks. **(b) Oferta:** a população tem plateau de OVR por rank individual — ≤ 200: mediana 80; 201–450: 77; 451–700: 70; 701–1000: 39 (queda abrupta). Não há concentração artificial de atletas fortes **além** da curva de geração (`overallForRank`), que a 6F já caracterizou. **[SIMULAÇÃO]**; a origem da curva (projeto × efeito colateral das fases 5.x) é **[HIPÓTESE]**.
4. **Pares de força intermediária encontram competição adequada?** Existem (OVR 50–70 ≈ 198 de 1000 atletas), mas 196 deles estão nos ranks individuais 451–1000. Bronze e Silver escolhem os elegíveis de menor OVR (ponta fraca), e o Gold só chega a esse grupo no qualifying (mundos A/B: sim; 6D: parcialmente). Para a dupla do jogador (45–55) **não há torneio cujo campo principal tenha mediana 55–70**. **[SIMULAÇÃO]**
5. **Alternativas (apenas análise; nada implementado):**

| Alternativa | Efeito esperado | Evidência |
|---|---|---|
| Rodada extra / qualifying ampliado | Acrescenta adversários fracos antes da mesma chave principal; o Δ da 1ª rodada principal (~−27) não muda; só aumenta a exposição a pontos e dias de calendário | inferência a partir da curva do motor **[HIPÓTESE]** |
| Qualifying também para entrada direta 401–450 (B-i da 6F) | Dá ao rank 401–450 o mesmo degrau que os 451–900 já têm, **se** o qualifying for mais fraco que a chave (depende do mundo, ver §4.4) | **[HIPÓTESE]** |
| Composição da chave principal (faixa de força em torno da dupla / mistura de percentis) | Atua na causa, mas muda a dificuldade do Gold para todos, a distribuição de pontos e o histórico de "Silver mais forte que Gold" (5.5) | **[HIPÓTESE]** |
| Teto da base por força da dupla, em vez de rank | Reabre a base a duplas com rank bom e OVR baixo; exige OVR na inscrição (mudança de contrato de `evaluateTournamentEntry`) e cria dependência rank↔OVR | **[HIPÓTESE]** |

6. **Riscos comuns** (detalhe em §8): ranking (inflação por pontos de participação; a janela de prioridade ignora cortes), calendário (qualifying acrescenta dias e `DATE_CONFLICT`; `getTournamentCampaignDates`), saves (`tournament_run_schema_version`, `bracket_schema_version ≥ 2`, `draw_pair_ids`, `qualifying_required` já gravados em inscrições existentes).

---

## 6. Divergências e achados de código

| # | Achado | Tipo | Impacto |
|---|---|---|---|
| D1 | Harness filtra `minRanking` pelo rank **individual**; o jogo usa o da **dupla** | [CÓDIGO+TESTE] | alto para medições (esconde Gold-qualifying em 25–33 semanas por execução) |
| D2 | O harness nunca oferece o Gold por qualifying à política, embora a tela o mostre | [CÓDIGO+TESTE] | alto para a pergunta "existe degrau?" |
| D3 | "Chance de título"/"Lucro esperado" dependem só do rank (`computeRankingFit`); ignoram OVR da dupla e do campo | [CÓDIGO+TESTE] | alto para a decisão do jogador (Gold rank 443: 40% exibido, ~0% no motor) |
| D4 | O card não ordena nem destaca por adequação; a recomendação semanal usa `fit` do mesmo rank | [CÓDIGO+TESTE] | médio |
| D5 | `buildAthleteEntryContext` recai no rank individual quando `teamRank` é 0/nulo | [CÓDIGO+TESTE] | baixo/médio (par novo sem ranking com individual ≤ 400 é barrado do Silver) |
| D6 | `playerRank` é limitado ao tamanho da chave (`min(rank, bracketSize)` = 32 no Gold); como os demais entrantes têm rank real (> 32), o jogador vira **cabeça de chave nº 1** no campo projetado | [CÓDIGO+TESTE] (ordenação provada em teste; ranks dos campos medidos: Gold 248–502) | médio: se a intenção era "jogador = pior cabeça", o caminho atual é **mais favorável** que o seeding honesto; qualquer revisão tornaria a 1ª rodada mais difícil |
| D7 | Janela de prioridade, wildcard e convites contornam o teto e os cortes | [CÓDIGO+TESTE] | médio (já anotado na 6F) |
| D8 | Qualifying do jogador = "pior rank elegível"; força real depende do mundo (59–68 em A/B, 38–55 nos dados 6D) | [SIMULAÇÃO] | alto: o degrau intermediário não é estável |

Observação sobre a seleção da IA × campo do jogador: o campo do jogador usa a mesma autoridade de admissão da IA, mas é uma **projeção** (um adversário por rodada); a equivalência com os campos de torneios sem jogador não foi medida aqui. **[HIPÓTESE]**

---

## 7. Recomendações priorizadas

1. **(Prioridade 1 — instrumento, risco nulo)** Alinhar o harness ao jogo antes de qualquer novo rebalanceamento: filtro por rank da dupla via `evaluateTournamentEntry`, inclusão do Gold-qualifying, e uma política C (adequação por força) ao lado da `best-eligible`. Só assim a pergunta "o salto Silver→Gold é do jogo ou da política?" é respondida com carreira completa.
2. **(Prioridade 2 — informação ao jogador, sem mudar regra de ranking/saves)** Dar ao card e ao modal um indicador de **risco competitivo** que use a força da dupla e uma estimativa do campo do tier ("campo típico ~75; sua dupla ~45"), além de avisar **antes** do rank 400 que a base será encerrada. Requer decisão de design; não altera elegibilidade nem persistência.
3. **(Prioridade 3 — decisão humana de design)** Esclarecer a intenção de D6 (jogador como cabeça nº 1) e de D7 (brechas).
4. **(Prioridade 4 — estrutural, só após medição)** Entre as alternativas da §5.5, a de menor superfície é estender o degrau do qualifying à entrada direta 401–450 (B-i); só vale se o qualifying for mesmo mais fraco que a chave em mundos de meio de carreira (D8). Teto por força e recomposição da chave ficam para depois, por tocar no histórico de equilíbrio da 5.5 e no ranking de todos.

**Intervenção mais segura:** (1) + (2). São reversíveis, não tocam em ranking, schema, economia nem balanceamento, e dão a medição que falta para decidir (4).

---

## 8. Riscos

- **Ranking:** mais rodadas/qualifying/entradas no Gold distribuem mais pontos a duplas fracas e aceleram o cruzamento de 400 (o rank já avança por participação); a janela de prioridade ignora cortes e pode multiplicar o efeito.
- **Calendário:** qualifying acrescenta dias (`getTournamentCampaignDates`) e conflitos (`DATE_CONFLICT`); o piso de descanso é apenas aviso.
- **Saves:** inscrições existentes carregam `qualifying_required`, `team_rank`, `entry_path`; chaves sorteadas carregam `draw_pair_ids` e `bracket_schema_version ≥ 2`. Mudar contagem de rodadas ou composição exige compatibilidade com eventos já agendados (`test:tier-ladder-migration-fase3`, `test:career-persistence-integrity`).
- **Balanceamento:** baixar o teto reabre "Silver mais forte que Gold" (5.5); ajustar o campo do Gold muda a dificuldade para a IA e para o jogador.
- **Informação:** qualquer estratégia que use dados que o jogador não vê (OVR dos adversários antes do sorteio) não vale como evidência de jogabilidade.

---

## 9. Limitações

- Mundos A/B estão no **dia ~8**; o kit não avança além de eventos de calendário (a tentativa de 60 dias parou em 29/01). Os campos de meio de carreira vêm só das medianas da 6D (1 semente, 4 execuções).
- Estratégias avaliadas em **um torneio por estado**; sem trajetória de ranking/OVR/economia.
- Pares do mundo e do jogador entram no motor com atributos **planos** no OVR (como na 6E), sem atributos individuais reais.
- Pontos: qualifying eliminado = 0 foi premissa; `gatedFirstRoundLossPointsRatio` não foi reconstituído (CSV mostra 7 onde o catálogo diz 5).
- `n = 60` por opção; probabilidades têm IC95% de até ±13 pp perto de 50%.
- Defasagem entre inscrição e linha semanal dos CSVs não medida.
- Nenhum teste de interface renderizada; os fatos de UI vêm de leitura do código e das funções que a UI chama.
- Não foi feito playtest humano.

---

## 10. Proposta de escopo para CLOUD-6H

**Título sugerido:** *Measurement parity & competitive-risk visibility* (ainda diagnóstico + instrumento).

1. Alinhar `sim-progression-economy-v526.mjs` ao jogo (rank da dupla, Gold-qualifying, `evaluateTournamentEntry` como filtro) e adicionar política "adequação" (C). Reexecutar **um** perfil por política, mesma semente, 2 sementes, com relatório de trajetória (rank, OVR, tier por mês).
2. Instrumentar o campo do jogador em carreira (observer já existente `__PL527I_FIELD_OBSERVER`) para obter OVR por rodada em 2026–2028, em ≥ 3 sementes.
3. Verificar a regra de pontos de qualifying eliminado e o `gatedFirstRoundLossPointsRatio`.
4. Protótipo **somente de UI** (flag local, sem persistência) do indicador de risco competitivo; critério de aceite: o indicador concorda com o motor dentro de ±15 pp para os 7 estados desta fase.
5. Decisão humana sobre D6/D7.

Fora do escopo: alterar teto, qualifying, composição de campo, pontos ou curva de treino.

---

## 11. Testes executados

| Teste | Resultado |
|---|---|
| `node scripts/test-tournament-selection-divergence-6g.mjs` (novo, caracterização) | 9/9 PASS |
| `node scripts/test-tier-transition-boundary-6f.mjs` | 17/17 PASS |
| `test:admission-matrix-v522f` | 11/11 PASS |
| `test:tournament-registration` (`test-tournament-registration-v2.mjs`) | termina com código 0 |
| `test-tournament-teamrank-resolution-v526d.mjs` | 4/4 PASS |
| `eslint` nos dois scripts novos | sem erros |
| `node scripts/audit-cloud6g-selection.mjs` | 5 partes executadas (~50 s); regenera `data/*.json` |
| `build` | não executado (sem mudança de produção) |
| Simulações de carreira completa | não executadas (controle de custo) |

Reprodução: `npm ci && node scripts/audit-cloud6g-selection.mjs [--n=60]`.

---

## 12. Arquivos modificados

| Arquivo | Tipo |
|---|---|
| `reports/cloud-phase-6g-tournament-selection-audit/CLOUD_PHASE_6G_REPORT.md` | novo |
| `reports/cloud-phase-6g-tournament-selection-audit/data/harness-vs-game-eligibility.json` | novo |
| `reports/cloud-phase-6g-tournament-selection-audit/data/player-field-composition.json` | novo |
| `reports/cloud-phase-6g-tournament-selection-audit/data/strategy-comparison.json` | novo |
| `reports/cloud-phase-6g-tournament-selection-audit/data/strategy-comparison-observed-fields.json` | novo |
| `reports/cloud-phase-6g-tournament-selection-audit/data/world-strength-supply.json` | novo |
| `scripts/audit-cloud6g-selection.mjs` | novo (somente leitura) |
| `scripts/test-tournament-selection-divergence-6g.mjs` | novo (caracterização) |

Nenhum arquivo em `src/`, `package.json`, `base44/` ou schema de saves foi alterado. Restrições respeitadas: sem mudança de balanceamento, ranking, economia, fadiga, treino, versão; sem merge, rebase, PR ou push; nenhuma outra fase iniciada.

## 13. Commit final

Ver `git log -1` na branch `cloud/phase-6g-tournament-selection-audit` (commit local, **não publicado**).
