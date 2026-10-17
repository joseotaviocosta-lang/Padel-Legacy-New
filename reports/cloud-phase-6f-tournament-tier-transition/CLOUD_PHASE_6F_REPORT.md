# CLOUD-6F — Tournament Tier Transition & Competitive Accessibility

Fase de **investigação**. Nenhum código de produção foi alterado. O diff contém este relatório, dois scripts (auditoria somente-leitura e teste de caracterização) e dados em `data/`. Rótulos: **Observado** = medido/lido aqui; **Inferência** = deduzido do código sem execução; **Hipótese** = não isolado; **Recomendação** = decisão humana.

| Item | Valor |
|---|---|
| Origem | `cloud/phase-6e-competitive-balance-isolation` @ `897ec03` (worktree limpo) |
| Branch | `cloud/phase-6f-tournament-tier-transition` (local, sem push, sem PR) |
| Funções reais usadas | `EntryManager.evaluateTournamentEntry`, `buildAthleteEntryContext`, `circuitCatalog.getTierRankingFit`, `rankingPopulation.overallForRank` (carregadas via Vite SSR, como os demais testes) |

## 1. Causa: confirmada ou descartada?

- **Teto 400 como causa da queda de resultados: NÃO confirmado (não reproduzido).** O teto existe e funciona exatamente como escrito, mas nos dados da 6D a saída da base **não foi causada por ele**.
- **Causa reproduzida (Observado):** o salto de força entre Silver (~35–51) e Gold (~74–79) é real e independe do teto. A dupla (OVR 45–55) enfrenta Δ de −17 a −35 já na primeira rodada principal do Gold: 0 vitórias em 21 + 22 primeiras rodadas (6D normal e otimizador).
- **Por que o teto não explica (Observado nos CSVs da 6D, `data/evidence-6d-by-rank-bucket.json`):** o Gold passa a ser elegível em teamRank ≤ 450 (`minRanking`), e o harness (`tierPick: best-eligible`, `respectMinRanking`) escolhe sempre o tier mais alto elegível. A migração ocorreu na faixa **401–450**, onde Bronze, Silver e Gold estão todos abertos: 6D normal jogou Gold 5× e Bronze 1× nessa faixa; 6D otimizador, Gold 3× e Bronze 3×; baseline normal, Silver 2× e Bronze 1× antes de ir para Gold. Em 3 de 4 execuções o jogador já estava no Gold antes de cruzar 400.
- **Correção da leitura da 6E:** "a última partida em Bronze/Silver coincide com 360–400" — o dado mostra a última participação (Silver) com rank semanal 357/358, mas a **inscrição foi feita antes** (rank semanal é um retrato com defasagem) e já existia acesso ao Gold desde ~450. Correlação temporal ≠ causalidade.
- **Inferência:** com a política do harness, alterar o teto (250, 150 ou 0) não mudaria as escolhas, porque o harness continuaria escolhendo Gold. Só um jogador humano que *queira* voltar à base com rank ≤ 400 é afetado pelo teto — caso não exercitado pelos dados.

## 2. Regras atuais de elegibilidade (`EntryManager.js`, `circuitCatalog.js`)

Ordem de avaliação em `evaluateTournamentEntry`: janela de prioridade → special exempt → ranking protegido → wildcard → convite júnior → convite nacional → Silver sem ranking → **teto da base** → direto (`directLimit===0` ou `rank ≤ minRanking`) → qualifying → inelegível.

| Tier | minRanking | Chave | Qualifying (jogador) |
|---|---|---|---|
| Bronze, Silver | 0 (abertos) | 16 | — |
| Gold | 450 | 24 | até 900 (`max(2×450, 450+80)`) |
| Platinum | 320 | 32 | até 640 |
| Masters / Elite / Crown | 230 / 140 / 75 | — | acima do alcance inicial |

- **`OPEN_TIER_CEILING = 400`:** Bronze/Silver ficam inelegíveis (`overqualified`) se **rank > 0 e rank ≤ 400**. Sem ranking (0) entra em Bronze/Silver livremente. Lower = melhor, logo o teto barra os *melhores* ranks.
- **Métrica:** rank da **dupla** (`teamRank`). `buildAthleteEntryContext` dá precedência ao `teamRank` explícito sobre `profile.world_ranking`; `tournamentRegistration.js`, `calendarSystem.js` e `Tournaments.jsx` passam o teamRank. (O harness da 6D filtra `minRanking` pelo **rank individual**, `wr.rank` — métrica diferente da do jogo; limitação do instrumento.)
- A mesma constante é usada pelo caminho da IA (`WorldTourLifecycle.js:961`, redistribuição entre eventos abertos) e duplicada em `circuitCatalog.js` (`OPEN_TIER_CEILING_MIRROR`, banda de preferência de Silver 400–800). Mudar o valor exige mudar os dois.
- **Outras restrições:** não há checagem de força/OVR na inscrição; `minLevel` é descritivo. Wildcard, ranking protegido, special exempt, convites e janela de prioridade **contornam o teto** (Observado: wildcard em rank 200 entra no Bronze; comportamento atual, não alterado — ver §8). Vagas: chaves de 16 (Bronze/Silver) e 24 (Gold); sem preenchimento de reserva, chave menor que o mínimo viável não ocorre (comentário da Fase 5.3 no `WorldTourLifecycle.js`).
- Histórico do teto (comentários): 800 → 150 → 190 → 400, ajustado para corrigir Silver mais forte que Gold na mediana de OVR (Playthrough 5.5). **Baixar o teto reabre esse defeito.**

## 3. Cenários de fronteira (funções reais; `data/boundary-scenarios.json`)

Elegibilidade do jogador (sem `aiFieldContext`); `ACIMA` = barrado por `overqualified`; fit = `getTierRankingFit` (preferência da IA, 0–100).

| Rank dupla | Bronze | Silver | Gold | Platinum | Masters | Elite/Crown |
|---|---|---|---|---|---|---|
| 350 | ACIMA | ACIMA | direto | qualifying | qualifying | não |
| 375 | ACIMA | ACIMA | direto | qualifying | qualifying | não |
| 399 | ACIMA | ACIMA | direto | qualifying | qualifying | não |
| **400** | **ACIMA** | **ACIMA** | direto | qualifying | qualifying | não |
| **401** | direto | direto | direto | qualifying | qualifying | não |
| 425 | direto | direto | direto | qualifying | qualifying | não |
| 450 | direto | direto | direto | qualifying | qualifying | não |
| 500 | direto | direto | **qualifying** | qualifying | não | não |

Fit (Bronze/Silver/Gold/Platinum): 350 → 55/55/88/77 · 399 → 55/55/70/39 · 401 → 55/100/69/38 · 450 → 58/100/50/0 · 500 → 61/100/89/0.

Respostas da Etapa 2: (1–3) a tabela; motivo único de bloqueio da base = `overqualified` ("Top 400"); (6) **o comportamento muda exatamente entre 400 e 401**, e o Gold muda de direto para qualifying entre 450 e 451 (varredura 380–460 mostra viradas só em 401 e 451).

**Força dos adversários disponíveis** (Observado, medianas de `oppStrength` dos 4 CSVs da 6D por faixa de teamRank × tier jogado):

| Faixa teamRank | Bronze | Silver | Gold | Platinum+ |
|---|---|---|---|---|
| > 450 | ~35 | ~46–51 | 52 (só qualifying) | — |
| 401–450 | 34–38 | 49 | 74–75 | — |
| 361–400 | — | — | 76–78 | — |
| ≤ 360 | — | 51–53 (1 caso) | 73–79 | 78–81 |

Não existe campo com mediana 55–70 em nenhuma faixa. **Curva do mundo (`overallForRank`, média ±25 ranks individuais):** 200–450 ≈ 76–77 (platô), 500 → 74, 600 → 69,5, 650 → 64, 700 → 58,5, 750 → 54, 800 → 47, 900 → 36. O degrau de força 55–70 existe na população apenas nos ranks individuais ~600–750.

## 4. Análise da transição (Etapa 3)

| Pergunta | Resposta | Tipo |
|---|---|---|
| 1. O 400 remove o acesso a Bronze/Silver? | **Sim**, para rank de dupla ≤ 400, deterministicamente. Mas o jogador da 6D já tinha migrado para o Gold em 401–450 por escolha. | Observado |
| 2. Primeira categoria após a transição? | **Gold** (direto até 450). Platinum/Masters só via qualifying. | Observado |
| 3. Faixa intermediária sem torneios adequados? | **Sim**, de força ~55–70: nenhum tier tem mediana nessa faixa. | Observado |
| 4. Elegibilidade, distribuição ou ambos? | **Distribuição dos adversários**. A elegibilidade deixa Silver aberto até 400 e Gold aberto desde 450; o que falta é um campo intermediário. | Observado + Inferência |
| 5. Evolui sem parceiro de elite? | Não nos dados da 6D: sem parceiro ~80 houve 0/32, 0/39 e 1/44 vitórias após a migração. | Observado (n=1 semente/perfil) |
| 6. Risco de atletas fortes na base se o limite mudar? | **Sim.** Ranks 250–400 têm OVR ~77; a Fase 5.5 subiu o teto para 150→400 justamente para tirá-los da base. Wildcard e convites já são brechas. | Observado (curva) + histórico em comentários |

**Achado adicional (Observado, n=9):** o **qualifying do Gold** (acessível a rank 451–900) tem adversários de mediana 38–54, e o otimizador venceu 7 de 9. Quem entra **direto** (rank 401–450) pula esse degrau e encontra ~77 já na primeira rodada. Ou seja, o melhor rank é punido com campo mais forte — uma inversão da escada que deve ser tratada como hipótese de "degrau intermediário já existente".

**Hipótese (não isolada):** o rank da dupla avança mais rápido que o OVR do jogador (pontos de participação), colocando uma dupla de OVR ~47 no rank ~400, onde o mundo tem OVR ~77. A 6D mostra o descompasso (rank 357 com OVR 46) mas não isola a causa.

## 5. Alternativas (Etapa 4)

**Alternativa A — ajuste de elegibilidade** (reduzir `OPEN_TIER_CEILING`, ou teto por força da dupla)
- Impacto esperado: baixo no harness (continua escolhendo Gold); real só para o jogador humano que opte por Silver.
- Alterações: `EntryManager.js` + `OPEN_TIER_CEILING_MIRROR` em `circuitCatalog.js` (banda de Silver); com teto por OVR, nova leitura de OVR da dupla na inscrição (mudança de contrato do `evaluateTournamentEntry`).
- Riscos: reabrir Silver mais forte que Gold (histórico 5.5); atletas de rank 250–400 (OVR ~77) na base; brecha de farm de pontos em Silver; teto por OVR cria dependência rank↔OVR e ranking menos íntegro.
- Saves: sem migração de schema; inscrições já feitas permanecem válidas.
- Calendário: mais inscritos em Bronze/Silver → mais chaves cheias, redistribuição `barredFromOpen` muda.
- Testes: fronteira (`scripts/test-tier-transition-boundary-6f.mjs`, ampliar), `test:admission-matrix-v522f`, composição de campo por tier em ≥3 sementes, dominância de título por base.

**Alternativa B — degrau intermediário dentro de torneios existentes**
- Ideia: aproveitar o que já funciona — o qualifying do Gold mostra adversários 38–54. Opções: (i) estender o qualifying (ou uma rodada de entrada) a quem entra direto entre 401–450, (ii) enviesar a composição do campo do Gold para incluir duplas de ranks ~600–750 (OVR ~58–70) nas primeiras rodadas via seeding/chaveamento.
- Impacto esperado: introduz oponentes de força 55–70 sem criar categoria; o maior ganho potencial.
- Alterações: `WorldTourLifecycle.js` (montagem do campo/seeding), possivelmente `buildSeedings`; mexe em `getTierRankingFit`/`plateauTilt` do Gold se for por preferência.
- Riscos: altera dificuldade do Gold para todos, ranking (pontos por rodada contra campo mais fraco), oversubscrição do Gold (~818 participações/ano para 24 vagas); pode reintroduzir "Gold mais fraco que Silver".
- Saves: sem schema; campos já sorteados (`draw_pair_ids`, `bracket_schema_version ≥ 2`) não mudam.
- Calendário: nenhum se não adicionar eventos; ocupação de vagas muda.
- Testes: integridade de chave (`test:tournament-draw-*`, `test:masters-24-v522f`), distribuição de oponentes por rodada, ranking pós-resultados, determinismo da chave, campo de Gold ≥3 sementes.

**Recomendação:** não alterar o teto. Se houver decisão de agir, B-(i) (qualifying também para entrada direta de rank 401–450 ou um piso de "rodada de entrada") parece o menor passo, **após** medir a composição real do Gold em ≥3 sementes.

## 6. Correção implementada

**Nenhuma.** Critérios da Etapa 5 não atendidos: (1) a causa (teto) não foi reproduzida; (2) a correção candidata (A ou B) não é localizada nem de baixo risco — A reabre um defeito histórico, B altera composição de campo/ranking; (3) sem alteração, as regras de ranking/elegibilidade permanecem íntegras.

## 7. Testes executados

| Teste | Resultado |
|---|---|
| `node scripts/test-tier-transition-boundary-6f.mjs` (novo, caracterização: 350/375/399/400/401/425/450/500, Gold 450/451, sem ranking, IA, elite barrada, monotonia, rank da dupla) | 17/17 PASS |
| `test:admission-matrix-v522f` | 11/11 PASS |
| `test:tournament-registration` | PASS |
| `test:tier-ladder-migration-fase3` (compatibilidade de saves antigos) | 13 gates PASS |
| `test:ranking-consistency` | 21 gates PASS |
| `test:tournament-canonical-results`, `test:tournament-result-authority`, `test:tournament-flow-rc` | PASS |
| `test:career-persistence-integrity` | 53 gates PASS |
| `npm run lint` | sem erros |
| `build` | **não executado** (sem mudança de produção) |
| `WorldTourEntryFlowTest.js`, `StrategicEntryTest.js` rodados diretamente com `node` | falham com `Cannot find package '@/lib'` — **igual no commit base** (dependem de alias do Vite); não é regressão |
| Simulações de carreira / 75 mil partidas | **não executadas** (controle de custo) |

Reprodução: `node scripts/audit-cloud6f-tier-transition.mjs` (gera `data/*.json`; lê os CSVs da 6D, requer `npm ci`).

## 8. Riscos de regressão e pendências

- Sem alteração de produção: risco de regressão **nulo** nesta fase.
- **Pendência 1:** medir a composição real dos campos Bronze/Silver/Gold (OVR por pair, por rodada) em ≥3 sementes do mundo; aqui usamos 4 execuções de 1 semente.
- **Pendência 2:** testar um humano/política que *escolha* Silver com rank ≤ 400 (nenhuma política do harness faz isso) para dimensionar o efeito real do teto.
- **Pendência 3:** brechas que contornam o teto (wildcard, convites, janela de prioridade) — decidir se são intencionais; hoje a elite pode ser inscrita na base com wildcard.
- **Pendência 4:** o harness filtra `minRanking` pelo rank individual enquanto o jogo usa teamRank; alinhar antes de novas medições.
- **Pendência 5:** investigar se o rank da dupla avança mais rápido que o OVR (hipótese do §4).
- Qualquer mudança em A/B exige aprovação humana (rebalanceamento de torneios).

## 9. Compatibilidade com saves

Nenhuma mudança de schema, versão ou persistência. Registros existentes e `bracket_history` intactos; `test:tier-ladder-migration-fase3` e `test:career-persistence-integrity` passam.

## 10. Arquivos e commit

| Arquivo | Tipo |
|---|---|
| `reports/cloud-phase-6f-tournament-tier-transition/CLOUD_PHASE_6F_REPORT.md` | novo |
| `reports/cloud-phase-6f-tournament-tier-transition/data/boundary-scenarios.json`, `evidence-6d-by-rank-bucket.json` | novos |
| `scripts/audit-cloud6f-tier-transition.mjs` | novo (somente leitura) |
| `scripts/test-tier-transition-boundary-6f.mjs` | novo (teste de caracterização) |

Nenhum arquivo em `src/`, `package.json`, `base44/` foi alterado. Restrições respeitadas: sem mudança em 6B/6C, schema, versão, IA, economia, fadiga, preset; sem merge, rebase, PR ou push. Commit final: ver `git log -1` na branch `cloud/phase-6f-tournament-tier-transition`.
