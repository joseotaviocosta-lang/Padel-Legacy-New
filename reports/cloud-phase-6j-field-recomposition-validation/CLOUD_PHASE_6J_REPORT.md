# CLOUD-6J — Competitive Field Recomposition: Final Validation

Fase **exclusivamente de diagnóstico e experimentação isolada**. Nenhum código de produção, balanceamento, ranking/elegibilidade, treino, economia, fadiga, schema de save ou versão foi alterado. O diff contém este relatório, dois scripts (`scripts/audit-cloud6j-field-recomposition.mjs`, `scripts/analyze-cloud6j-summary.mjs`) e dados em `data/`.

Rótulos: **[CÓDIGO]** leitura de código · **[TESTE]** teste existente · **[SIMULAÇÃO]** experimento desta fase · **[HIPÓTESE]** não comprovado.

| Item | Valor |
|---|---|
| Repositório | `joseotaviocosta-lang/Padel-Legacy-New` |
| Origem | `cloud/phase-6i-competitive-tier-design` @ `01824b4` (confirmado; worktree limpo na partida) |
| Branch | `cloud/phase-6j-field-recomposition-validation` (local, **sem push, sem PR**) |
| Relatórios lidos | 6F, 6G, 6H (cabeçalhos/conclusões), 6I (integral), 5.27-I (`REBALANCE_527I.md`, `silver-choice.json`, testes `*-v527i`) |
| Dados brutos | `data/field-recomposition-experiments.json`, `data/win-curves.json`; todas as tabelas agregadas em `data/summary-tables.md` |

## 0. Resumo executivo

1. **Achado novo e importante [CÓDIGO]:** a calibração 5.27-I (`silverFieldOffsetPct` 0,25 → 0,15) **não está ativa no padrão de produção**. Ela vive em `ENTRY_COMPETITION_527E`, só anexada aos presets `*-e`; `getBalance527()` usa `'balanced'` quando `globalThis.__PL527_PRESET` não está definido, e nada em `src/` define esse valor (grep). Em produção o Silver usa o offset legado de **25%** e a banda legada de Silver (`silverPeakLow` ausente). O mesmo vale para `firstPartnerTargetOvr` (36) da 5.27-E. A 6I já notava o offset; esta fase mostra que o conjunto "-E" inteiro está inativo no app. Medido: offset real 74–77 (25%) no preset `balanced` contra 45–46 (15%) em `balanced-e`.
2. **A alternativa A como proposta na 6I (A5 / W35–85 / S40) é prejudicial a quem começa e a quem está em OVR 40–55 [SIMULAÇÃO, 4 sementes]:** P(vencer a 1ª partida no Silver) para OVR 45 cai de **0,73 → 0,32–0,34** (OVR 40: 0,52 → 0,16–0,18; OVR 30: 0,19 → 0,01–0,03). Isso reintroduz, em direção mais forte, o defeito que a 5.27-I corrigiu (Silver ≥ ~10 OVR acima de Bronze e acima da dupla). **Não recomendada.**
3. **A única variante que não piora o início é a estratificação "leve" (A5_LITE, janela p15–p60):** neutra para OVR ≤ 45 (+0,00 a +0,03) e reduz o "passeio" de OVR 55–65 (vitórias esperadas no Silver 3,38 → 2,10 e 3,95 → 3,38; título 0,69 → 0,10 e 0,97 → 0,60, dupla com rank 600). Mas **a variação entre sementes é grande** (P(1ª partida) OVR 45: 0,64–0,87), não ajuda OVR 75 (título 0,99) nem quem tem rank ≤ 400, e o ganho está dentro do que um parâmetro de offset já dá. **Evidência insuficiente para implementar.**
4. **A calibração intencional da 5.27-I (ativá-la) melhora o início** (Silver, OVR 45: 0,73 → 0,85; OVR 30: 0,19 → 0,27; título OVR 45 com rank 600: 0,13 → 0,38) — é uma **decisão de balanceamento humana**, separada da recomposição, e deixa Silver quase igual ao Bronze (mediana 36,6 contra 35).
5. **Atributos reais [SIMULAÇÃO]:** os adversários do mundo são **planos por construção** (AthleteProfile só tem `overall_rating`; `normalizePlayer` usa atributos = OVR). Só o lado do jogador é desigual. A *direção* e a ordem das políticas são idênticas com atributos planos e reais; a *magnitude absoluta* muda até 0,17 em P(1ª partida) (média +0,03).
6. **Ranking ≤ 400 (Gold):** a recomposição localizada com âncoras de elite (GL8/GL12/GL8_M) rende pouco (OVR 65: 0,15 → 0,19/0,24/0,13) porque o **pool elegível do Gold quase não tem duplas de OVR 50–70 (11–13%, ~40 duplas)**. A variante que realmente ajuda (GA4: 0,15 → 0,41) preenche a chave principal com duplas de rank 450–900, **apagando a diferença entre chave principal e qualifying** e derrubando o título de OVR 75 (0,26 → 0,08). **Não recomendada.**
7. **Recomendação final: NÃO IMPLEMENTAR recomposição neste momento.** Escopo proposto para a CLOUD-6K: decisão humana sobre o preset `-E` (item 1) e, só então, uma medição focada (§10).

---

## 1. Preparação

* Repositório, branch de origem e HEAD conferem (`cloud/phase-6i-competitive-tier-design`, `01824b4`); `git status` limpo; branch `cloud/phase-6j-field-recomposition-validation` criada a partir dele. `npm ci` executado (`node_modules/` ignorado).
* **Implementação atual da composição [CÓDIGO]:** `buildPlayerTournamentField` (`WorldTourLifecycle.js:1076`): pool = duplas canônicas não comprometidas; elegíveis por `evaluateTournamentEntry(..., {aiFieldContext:true})`; preferidos por `chooseTournament`; ordem por `fieldAdmissionScore` (fraco-primeiro em tiers abertos); Silver pula `max(vaga, round(len × silverOffsetPct))` (`:1188-1192`), `silverOffsetPct = getBalance527().competition?.silverFieldOffsetPct ?? 0.25`. Qualifying = elegíveis fora da chave com pior rank. Caminho do jogador via `buildSeededDrawSlots` (bloco-espelho; jogador sempre seed 1 com `min(rank, bracket)`).
* **Reuso de funções reais:** o script usa `bootDrawCareer` (carreira real + Vite SSR), `buildCanonicalPairs`, `evaluateTournamentEntry`, `fieldAdmissionScore`, `chooseTournament`, `createPairSeedRankResolver`, `buildSeededDrawSlots`, `buildPlayerTournamentField` (campo real observado por `__PL527I_FIELD_OBSERVER`), `buildInitialAttributes` (forma dos atributos de produção) e o motor `createMatch/playPoint`. **Validação:** a réplica da seleção coincide com a função real em **100% das duplas** (Bronze 15/15, Silver 15/15, Gold 31/31) nas 4 sementes e nos dois presets; exceção no mundo de sensibilidade +45d (Gold 28/31, ver §9).

## 2. Metodologia

* **Políticas** (aplicadas fora do jogo sobre a ordem de admissão real, 15 vagas no Silver):
  `PROD` produção efetiva (preset `balanced`, offset 25%) · `CAL_E` calibração 5.27-I real (preset `balanced-e`: offset 15% **e** `silverPeakLow` 900, executada pela função de produção) · `S40` offset 40% · `A5` estratificado p25–p75 (6I) · `W35_85` estratificado p35–p85 (6I) · **`A5_LITE`** estratificado p15–p60 (novo: ancorado no offset 15% da 5.27-I) · `A5_E` / `A5_LITE_E` as duas últimas sobre a ordem do preset `-E`. Gold: `PROD`, `GA4` (6I: pula 25% do topo da ordem), **`GL8`/`GL12`** (8/12 âncoras de elite do campo atual + restante distribuído na metade inferior do pool por OVR), **`GL8_M`** (8 âncoras + faixa até p75).
* **Sementes:** `6j-world-1..4` (mundos ao dia ~8 pelo pipeline real) + 1 mundo de sensibilidade (`6j-world-1` +45 dias de calendário, não é temporada). Nenhuma temporada ou carreira completa simulada.
* **Probabilidades:** curva P(vitória) × OVR do adversário plano, calibrada **no motor real** por nível de dupla (OVR 22/30/40/45/55/65/75) e por cenário de dupla (100 partidas por ponto, ~38 mil partidas): `FLAT` (dois atletas planos, método 6E/6G/6I), `REAL_BAL` (jogador com perfil de produção Equilibrado + parceiro plano), `REAL_PW` (parceiro 8 pontos mais fraco), `REAL_PS` (parceiro 8 mais forte), `REAL_SPEC` (Ofensivo, especialização 1,6×). Caminho do jogador projetado como na produção; P(título) e vitórias esperadas calculadas analiticamente sobre o caminho (partidas independentes). Não há motor alternativo.
* **OVR da dupla** = média dos dois atletas (como no campo). O OVR do início de carreira 22 corresponde ao novato com curva inicial de produção (atributos 16–27, média ~21).

## 3. Início de carreira (Etapas 2 e 3 — sem ranking, REAL_BAL, média de 4 sementes)

### 3.1 Dificuldade atual (referência)
P(vencer a 1ª partida), sem ranking:

| Tier | OVR 22 | 30 | 40 | 45 | 55 | 65 | 75 |
|---|---|---|---|---|---|---|---|
| Bronze (PROD) | 0,08 | 0,30 | 0,70 | 0,91 | 0,97 | 1,00 | 1,00 |
| Silver (PROD) | 0,04 | 0,19 | 0,52 | 0,73 | 0,98 | 1,00 | 1,00 |

Vitórias esperadas por torneio: Bronze 0,09 / 0,42 / 1,74 / 3,10; Silver 0,04 / 0,21 / 0,80 / 1,58 (OVR 22/30/40/45). **Mesmo hoje, a dupla de OVR 22 tem só 4–8% de vencer a estreia** (o campo mais fraco do mundo é OVR 35); a primeira vitória depende de o jogador/parceiro evoluírem. P(≥1 vitória em 3 torneios Silver) = 0,11 (OVR 22), 0,46 (30), 0,89 (40).

### 3.2 Alternativas no Silver (P(1ª partida), REAL_BAL; [mín–máx] entre sementes em `data/summary-tables.md`)

| Política | 22 | 30 | 40 | 45 | 55 | 65 | 75 |
|---|---|---|---|---|---|---|---|
| PROD | 0,04 | 0,19 | 0,52 | 0,73 | 0,98 | 1,00 | 1,00 |
| CAL_E (5.27-I real) | 0,07 | 0,27 | 0,65 | 0,85 | 0,98 | 1,00 | 1,00 |
| S40 | 0,01 | 0,02 | 0,16 | 0,32 | 0,76 | 0,95 | 1,00 |
| A5 | 0,01 | 0,03 | 0,18 | 0,34 [0,16–0,64] | 0,76 | 0,96 | 1,00 |
| W35_85 | 0,01 | 0,01 | 0,12 | 0,27 | 0,72 | 0,95 | 1,00 |
| **A5_LITE** | 0,04 | 0,19 | 0,53 | 0,76 [0,64–0,87] | 0,96 | 1,00 | 1,00 |
| A5_E | 0,01 | 0,07 | 0,31 | 0,53 | 0,87 | 0,99 | 1,00 |
| A5_LITE_E | 0,06 | 0,23 | 0,59 | 0,80 | 0,98 | 1,00 | 1,00 |

Leitura dos cinco critérios da Etapa 2:

1. **Força dos adversários.** Mediana do campo Silver (média das 4 sementes): PROD 44,1 · CAL_E 36,6 · S40 54,1 · A5 57,9 · W35_85 65,8 · A5_LITE 48,6. Estreia (rodada 1, sem ranking): PROD 39,5–42 · A5 45–55 · A5_LITE 36,5–45 (varia por semente). Bronze fica em 35 em todas as sementes.
2. **Chance na estreia.** Tabela acima. A, S40 e W35_85 reduzem a chance de OVR 40–45 em ~0,35–0,45 pontos.
3. **Primeiras vitórias.** P(≥1 vitória em 3 torneios Silver), OVR 40 / 45: PROD 0,89 / 0,98 · A5 0,45 / 0,72 · W35_85 0,32 / 0,61 · A5_LITE 0,90 / 0,99. Para OVR 22/30 o Silver (qualquer política) já é difícil; o jogador deve ficar no Bronze (0,08/0,30 por torneio, ainda baixo).
4. **Risco de tornar Bronze/Silver difíceis demais:** **confirmado** para S40, A5, W35_85 (e parcialmente A5_E). Gatilho de reversão (§8) violado nas 4 sementes.
5. **Risco de Silver fácil demais para duplas fortes** (Silver com rank 600; título): PROD OVR 55/65/75 = 0,69 / 0,97 / 1,00 · A5 0,00 / 0,01 / 0,32 · W35_85 0,00 / 0,01 / 0,50 · **A5_LITE 0,10 / 0,60 / 0,99** · S40 0,14 / 0,71 / 1,00. As variantes fortes eliminam o "farm" mas à custa dos iniciantes; A5_LITE reduz o farm de OVR 55–65 sem custo para iniciantes, mas **não toca OVR 75** (duplas assim em geral já estão acima do teto 400 e não podem entrar no Silver).

**Cenários realistas de parceiro (Silver, PROD, P(1ª partida)):** OVR 22: plano 0,01 · real 0,04 · parceiro fraco 0,06 · forte 0,01 · especialista 0,02; OVR 30: 0,18 / 0,19 / 0,12 / 0,17 / 0,12; OVR 45: 0,56 / 0,73 / 0,69 / 0,73 / 0,68. A ordem das políticas não muda em nenhum cenário (§6).

## 4. Múltiplas sementes (Etapa 3)

* **Sementes:** 4 mundos determinísticos (+1 de sensibilidade). A tabela completa por semente (campos, caminhos, qualifying, consistência) está em `data/summary-tables.md` seções **F**, **C** e **P**.
* **Distribuição de OVR (mediana do campo Silver por semente):** PROD 45 / 43 / 44,5 / 44; CAL_E 37 / 37 / 36,5 / 36; A5 59 / 59 / 56,5 / 57; A5_LITE 46 / 47 / 50 / 51,5; W35_85 67,5 / 65,5 / 63,5 / 66,5. Desvio entre sementes da mediana: PROD 0,9 · CAL_E 0,5 · A5 1,3 · A5_LITE 2,6.
* **Variabilidade do que importa (caminho do jogador):** as políticas estratificadas escolhem só 15 duplas espaçadas, então o 1º adversário muda muito entre sementes: P(1ª partida) OVR 45 em A5 = 0,16–0,64; A5_LITE = 0,64–0,87; PROD = 0,71–0,78; CAL_E = 0,79–0,91. **A estratificação aumenta a variância entre sementes de 2 a 5 vezes** frente ao offset fixo.
* **Rankings:** rank de seed mediano do campo Silver: Bronze 927–958 · PROD 766–794 · CAL_E 832–853 · A5 583–661 · A5_LITE 691–734 · Gold 424–430 (caminho). A recomposição aproxima o rank do campo Silver do limiar de 400 sem violá-lo (nenhuma dupla inelegível entrou em nenhuma política).
* **Consistência de elegibilidade (soma das 4 sementes):** 0 duplicatas, 0 vagas vazias, 0 duplas inelegíveis (avaliadas com `evaluateTournamentEntry`/preset da própria política), 0 comprometidas ou parceiro do jogador, tamanho correto (15 / 31) em **todas** as políticas. Qualifying do Gold nunca reutiliza dupla da chave (inalterado).
* **Ordem Bronze < Silver < Gold (mediana do campo):** vale em todas as sementes e políticas. Diferença Silver − Bronze ≥ 5 só **não** vale em CAL_E (1,6 a 2,0 acima do Bronze) — exatamente o desenho da 5.27-I ("Bronze ≥ Silver").
* **Sensibilidade (+45 dias, uma semente):** medianas quase idênticas (PROD 45 → 45,5; A5 59 → 59); primeiras rodadas mudam 3–10 pontos nas estratificadas. O mundo continua jovem; não substitui mundos de meio de carreira (§9).

## 5. Fase 5.27-I (Etapa 4)

**Fonte:** `reports/rebalance-527i/REBALANCE_527I.md`, `silver-choice.json`, `src/lib/balance527.js:60-72`, `WorldTourLifecycle.js:1183-1192`, testes `test-silver-band-baseline-v527i`, `test-silver-vs-gold-order-v527i`, `test-balanced-e-gates-v527i`, `test-silver-candidate-comparison-v527i`, `test-no-gold-change-v527i`, `test-no-tuning-during-stage1-v527i`.

1. **Problema corrigido:** no micro de 5 sementes (Normal, 1 ano) o campo Silver ficava em OVR **46,8** contra dupla ~40,5 (**+6 a +7 acima da dupla**), Silver WR **21%** < Gold **32%** e < Bronze **59%**: o Silver era *estruturalmente mais difícil que o Gold*. Causa mapeada: "o percentil pega pares fortes" — na base do ranking o OVR sobe rápido (~950 → 35; ~810 → 47); pular ~68 posições custa ~11 OVR.
2. **Evidência:** micro de 2 anos, candidatos A–E (uma dimensão por vez), escolhido **E: 25% → 15%** (menor ajuste que corrige a ordem): campo 39 [37–42], Bronze 57,5 > Gold 48,2 ≈ Silver 45,3; Stage 1 45/45 carreiras, Easy 52,9 (≥ 45), Medium 43,8 (≥ 30), R1 46,7 (≥ 40), gate Silver + 5 ≥ Gold. Candidatos B/C/D (janela mais curta) deixavam o Silver tão fácil quanto o Bronze; A (faixa) não mexia no campo.
3. **A alternativa A contradiz os objetivos anteriores?** **Sim, na versão da 6I (A5/W35/S40/A1):** sobe a mediana do Silver para 54–66, muito além dos 46,8 que já foram considerados excessivos, e reproduz o defeito (Silver > Bronze e > dupla do iniciante) com folga. **A5_LITE** fica entre PROD (44) e o "Silver excessivo" (46,8 da época; 48,6 aqui) — marginalmente acima, ainda na zona que a 5.27-I rejeitou, compensada pela estratificação (rodadas iniciais fracas).
4. **Risco de reintroduzir defeito corrigido:** **alto** para offsets maiores e A5/W35 (medido: P(1ª partida) OVR 45 cai 0,73 → ~0,33); **baixo-moderado** para A5_LITE (neutro em ≤ 45, mas a variância entre sementes pode reproduzir "Silver > Gold em WR" em mundos desfavoráveis — não medido em carreira).
5. **Invariantes a preservar** (a maioria já tem teste): (a) `Bronze main WR ≥ Silver main WR` (`test-silver-vs-gold-order`); (b) `Silver WR + 5 ≥ Gold WR`; (c) campo Silver não deve superar a dupla do iniciante por mais de ~+5 (`test-silver-band-baseline`); (d) Gold+/Bronze/`circuitCatalog` inalterados (`test-no-gold-change`); (e) offset legado 25% para presets antigos e flag `silverFieldOffsetPct` como único ponto de ajuste; (f) congelamento semântico (`test-no-tuning-during-stage1`); (g) teto 400 e ordem de avaliação de elegibilidade.
6. **Descoberta (ver §0.1):** o app não ativa o preset `-E`; logo "o estado calibrado pela 5.27-I" **não é o estado entregue**. Qualquer decisão de recomposição precisa começar por esclarecer se a intenção é que `-E` seja o padrão. Nota de teste: `test-no-gold-change-v527i` falha 1 de 3 verificações (hash dos blocos `ranking/tactics/balance/partnerPolicy` contra `frozen-before`) **já em `01824b4`** (sem alteração de `src/` nesta fase); é desvio de congelamento histórico, não causado pela 6J, e não foi investigado.

## 6. Atributos reais (Etapa 5)

* **Produção [CÓDIGO]:** `AthleteProfile` do mundo guarda `overall_rating` e nenhum atributo individual (medido: `serve…emotional_control` ausentes); `normalizePlayer` usa `attributes = overall`. **Os adversários são planos em produção**; só o jogador (e parceiro materializado) tem perfil desigual. Logo o método "adversário plano" é fiel; a incerteza é o formato do lado do jogador.
* **Resultados planos × reais:** (E5 em `summary-tables.md`)

| Cenário real | Métrica | máx \|Δ\| vs plano | média Δ | pontos com \|Δ\| > 0,10 |
|---|---|---|---|---|
| REAL_BAL | P(1ª partida) | 0,17 (Silver OVR 45) | +0,03 | 15/119 |
| REAL_PW | P(1ª partida) | 0,14 | +0,03 | 16/119 |
| REAL_PS | P(1ª partida) | 0,17 | +0,03 | 17/119 |
| REAL_SPEC | P(1ª partida) | 0,11 | +0,01 | 4/119 |
| REAL_BAL | vitórias esperadas | 0,87 (Bronze OVR 45) | +0,13 | 54/119 |

* **Diferenças relevantes:** (a) atributos reais *favorecem* levemente a dupla (média +0,03), mais no nível OVR 40–45; (b) o perfil de início de carreira (OVR 22) tem P(estreia) 0,04–0,08 contra 0,01–0,14 plano — o plano sobrestima o Bronze/subestima o Silver nesse nível; (c) o especialista (1,6×) perde 0,03–0,11 em OVR 45–55.
* **A conclusão sobre as políticas não muda:** Δ de cada política contra PROD (P(1ª partida), Silver, OVR 45/55/65) tem o mesmo sinal e magnitude parecida em todos os cenários — A5: −0,32/−0,24/−0,04 (plano) × −0,39/−0,21/−0,04 (real) × −0,46/−0,20/−0,01 (parceiro forte); A5_LITE: +0,03/+0,01/0,00 × +0,03/−0,01/0,00; CAL_E: +0,15/+0,03/0,00 × +0,12/0,00/0,00. **Resultados de atributos planos permanecem representativos para a comparação entre políticas; não para probabilidades absolutas de início de carreira** (±0,1).
* Limites: o perfil "real" é o de produção reescalado (forma inicial), não o produto de treino de uma carreira longa; chemistry/teamwork/moral usam os padrões do `createBalanceAthlete` (76/76/72).

## 7. Ranking 400 ou melhor (Etapa 6)

**Diagnóstico [SIMULAÇÃO]:** o pool elegível do Gold tem mediana 76,5–77, p25 72,5 e só 11–13% de duplas OVR 50–70 (~40 de ~320); o mínimo é ~56. A chave real do Gold tem mediana 74,5–76 (mín 68,5–70). O problema para rank ≤ 400 é de **população**, não de ordenação: não existe um grupo de ~23 duplas OVR 50–70 elegíveis ao Gold para recompor.

| Política (Gold direto, rank 300, REAL_BAL) | Campo (mediana · % 50–70) | P(1ª partida) OVR 55 / 65 / 75 | Vit. esp. 65 / 75 | P(título) 75 |
|---|---|---|---|---|
| PROD | 75,4 · 0–3% | 0,01 / 0,15 / 0,71 | 0,20 / 2,30 | 0,26 |
| GA4 (6I) | 68,9 · 52–55% | 0,09 / 0,41 / 0,92 | 0,74 / 2,68 | 0,08 |
| GL8 | 73,9 · 19% | 0,01 / 0,19 / 0,74 | 0,21 / 1,92 | 0,15 |
| GL12 | 74,1 · 16–19% | 0,03 / 0,24 / 0,78 | 0,30 / 2,19 | 0,19 |
| GL8_M | 75,5 · 13–16% | 0,01 / 0,13 / 0,62 | 0,14 / 1,33 | 0,06 |

* **Recomposição localizada com preservação de elite (GL8/12):** efeito mínimo em OVR 50–65 (+0,00 a +0,09 em P(1ª partida)) e **inconsistente entre sementes** (OVR 65 em GL8: 0,11–0,40). O caminho do jogador (seed 1) passa a cruzar as âncoras de elite *mais cedo* em algumas sementes (1ª rodada 80,5 na semente 1), o que também piora o caso. Não distribui "a força na primeira rodada" de forma estável.
* **GA4 (a única que mexe):** campo 69 e OVR 65 sobe a 0,41 — mas (i) preenche a chave principal com duplas de rank mediano 538 (vs 430), a mesma faixa 451–900 que hoje só entra pelo **qualifying** — o qualifying deixa de ser degrau de acesso e a chave principal perde a distinção de ranking; (ii) para OVR 75 o título cai de 0,26 para 0,08 porque as âncoras de elite passam a ficar nas rodadas finais (a elite segue **intacta** em Platinum/Masters, mas o Gold deixa de ser "alcançável" para OVR 75 pelo mesmo motivo); (iii) a chave real do Gold é de 24 (31 slots no caminho) e só o campo do jogador mudaria, deixando a IA do mundo com o Gold antigo (paridade, 6I §8).
* **Preservação de elite:** Platinum, Masters, qualifying do Gold e o teto de 400 ficam idênticos por construção; P(1ª partida) em Platinum/Masters para OVR 55–65: 0,00–0,10 (`data/summary-tables.md` E6c). GL8/GL12 mantêm as 8/12 melhores duplas do campo atual; GA4 não.
* **Integridade de ranking/qualifying:** nas políticas de Gold nenhuma dupla inelegível entrou e o qualifying nunca reutilizou dupla da chave. A coluna "rank pior que o corte direto" usa a média dos ranks individuais e marca 31/31 até no Gold atual, portanto **não é um teste válido** — a verificação de elegibilidade (`evaluateTournamentEntry`) é a que vale.
* **Impacto em OVR 50–70:** só GA4 (e a categoria D da 6I) alteram materialmente OVR 55–65, e ambos mudam o significado do Gold para todos. Sem novas categorias nem mudança do limite 400 **não há remédio por composição de campo com evidência suficiente**.

## 8. Critérios objetivos de aprovação e reversão (Etapa 7)

Para uma implementação futura sob flag (`competition.silverFieldComposition`, default = comportamento atual), em **todas** as sementes de um conjunto ≥ 5 mundos (dia ~8 e mundos de meio de carreira):

| # | Requisito | Critério mensurável |
|---|---|---|
| 1 | Melhoria para intermediários | Silver, dupla OVR 55–65 (rank ≥ 401): vitórias esperadas por torneio cai ≥ 0,5 **e** P(título) cai ≥ 0,2 (o "passeio" desaparece), sem P(1ª partida) < 0,85 em OVR 55 |
| 2 | Iniciantes | P(1ª partida) no Silver para OVR 30 / 40 / 45 ≥ valor PROD − 0,03 (neutro) e P(≥1 vitória em 3 torneios) ≥ 0,85 em OVR 40; Bronze inalterado |
| 3 | Torneios superiores | Gold, Platinum, Masters, qualifying: campo, caminho e P(1ª partida) **idênticos** (hash) com a flag desligada **e** ligada; OVR mediana Gold ≥ Silver + 15 |
| 4 | Elite | P(título) de OVR ≥ 75 em Bronze/Silver ≤ 1,0 (sem melhora artificial) e em Gold/Platinum/Masters não aumenta; âncoras de elite preservadas |
| 5 | Inscrição e ranking | `evaluateTournamentEntry` inalterado (suíte `test:admission-matrix-v522f`, `test-tier-transition-boundary-6f`); 0 duplas inelegíveis, 0 duplicatas, 0 comprometidas; qualifying e pontos por tier inalterados |
| 6 | Saves | Campos derivados no D-3 e persistidos em `tournament_run`: torneios já sorteados não mudam; sem campo novo em save; `test:career-persistence-integrity` e `test:tier-ladder-migration-fase3` verdes |
| 7 | Reversibilidade | Flag em `balance527.competition`; default "off" ⇒ campos byte-idênticos ao atual (hash por semente × tier); desligar a flag em save existente não exige migração |
| 8 | Testes determinísticos | (i) hash dos campos com flag off; (ii) sementes fixas `6j-world-1..4` com asserts de faixas (mediana Silver, ordem Bronze < Silver < Gold); (iii) `test-silver-vs-gold-order`, `test-silver-band-baseline`, `test-no-gold-change` (após reparar o hash congelado) |

**Gatilhos de reversão:** P(1ª partida) no Silver OVR ≤ 45 menor que PROD − 0,05 em qualquer semente; ordem Bronze ≥ Silver (WR) violada; `Silver WR + 5 < Gold WR` em perfil de carreira curto; variação entre sementes (amplitude da P(1ª partida) em OVR 45) > 0,25; qualquer divergência persistida em saves.

**Aplicação aos candidatos medidos:** S40, A5, W35_85, A5_E → **reprovados** (critério 2 e gatilho 1). A5_LITE → **passa 1 parcialmente (título OVR 65 −0,37; vit. esp. −0,57; P(1ª OVR 55) 0,96), passa 2, passa 3 (por construção), mas falha o teto de variância** (amplitude da P(1ª partida) em A5_LITE: 0,27 em OVR 40 e 0,23 em OVR 45, contra o gatilho de 0,25) e não foi medido em perfil de carreira ⇒ **dados insuficientes**. GA4/GL8/GL12/GL8_M → **reprovados** nos critérios 3–5 (§7).

## 9. Riscos e limitações

* **Mundos jovens:** dia ~8 (+ uma sensibilidade de 45 dias). Não há mundo de meio de carreira (qualifying do Gold já se mostrou 38–55 em dados da 6D, contra 61–68 aqui); conclusões sobre A5_LITE e Gold local podem mudar. No mundo +45d, a réplica do Gold coincide em 28/31 duplas (3 divergências não investigadas), então o resultado de sensibilidade do Gold é indicativo.
* **Probabilidades analíticas:** P(título) assume partidas independentes e adversário da rodada = melhor seed do bloco-espelho (projeção de produção, não chave jogada). Não há "competitividade" por partida salva; usei vitórias esperadas e P(título) como proxy.
* **Grade de calibração:** passo de 5 OVR do adversário, 100 partidas por ponto (erro ±0,05); extrapolação por extremo fora da grade (adversário < OVR T−30 ou > T+45).
* **Perfis de atributos:** derivados da curva inicial de produção; carreiras treinadas podem ter mais especialização; moral/química fixas.
* **Rank do jogador:** cenários sem ranking / 600 / 300 são ilustrativos; a associação rank–OVR da carreira real não foi reamostrada.
* **Efeitos de ranking/calendário/pontos** são qualitativos; nenhuma carreira simulada (restrição da fase).
* **Paridade IA × jogador:** `silverFieldOffsetPct` só existe no campo do jogador; qualquer recomposição deixa os Silver do mundo-IA como estão.
* **Riscos da implementação futura:** reabrir a 5.27-I; variância entre sementes de campos estratificados; confusão entre "preset -E não ativo" e "calibração ativa" (§0.1); interação com os indicadores de dificuldade da 6I (`titleChance` alimenta a IA).

## 10. Recomendação final e escopo da CLOUD-6K

**Recomendação: NÃO implementar recomposição estratificada agora** (os dados não atendem aos critérios 1–3 simultaneamente com variância aceitável; Gold/rank ≤ 400 não tem solução por composição).

**Escopo proposto — CLOUD-6K (decisão + medição curta, ainda sem mexer em balanceamento sem aprovação):**

1. **Decisão humana sobre o preset:** o app deve ou não rodar `balanced-e` (offset 15%, `silverPeakLow` 900, `firstPartnerTargetOvr` 36)? Se sim, é uma mudança de balanceamento pequena, já validada pela 5.27-I (e aqui: Silver OVR 45 0,73 → 0,85), e **deve vir antes** de qualquer recomposição; se não, documentar por que a 5.27-I existe só em harness.
2. Se (1) for "sim" ou "não" e ainda houver interesse em recomposição: medir **A5_LITE_E** (e variantes de janela p10–p50) em **mundos de meio de carreira** (≥ 5 sementes, datas 2026-10 / 2027-02 / 2027-06) e com um **perfil de carreira curto** por política (WR Bronze/Silver/Gold), aplicando a §8.
3. Corrigir ou reconciliar `test-no-gold-change-v527i` (hash congelado) antes de usar o conjunto `*-v527i` como piso de regressão.
4. Fora do escopo: A4/GA4, categorias novas, mudança do teto 400, seeding (D6), qualquer mudança em ranking/treino/economia/fadiga/schema.

## 11. Testes executados (baseline, `01824b4`, sem alteração de `src/`)

`test-tier-transition-boundary-6f` 17/17 · `test-tournament-selection-divergence-6g` 9/9 · `test-tournament-consistency-6h` 12/12 · `test:admission-matrix-v522f` PASS (11/11) · `test-silver-vs-gold-order-v527i` 3/3 · `test-silver-band-baseline-v527i` 4/4 · `test-no-gold-change-v527i` **2/3 (falha preexistente do hash congelado, ver §5.6)**.

Reprodução: `node scripts/audit-cloud6j-field-recomposition.mjs --seeds=4 --cal=100` (~8 min) e `node scripts/analyze-cloud6j-summary.mjs`.

## 12. Arquivos modificados

| Arquivo | Tipo |
|---|---|
| `reports/cloud-phase-6j-field-recomposition-validation/CLOUD_PHASE_6J_REPORT.md` | novo |
| `reports/cloud-phase-6j-field-recomposition-validation/data/field-recomposition-experiments.json` | novo |
| `reports/cloud-phase-6j-field-recomposition-validation/data/win-curves.json` | novo |
| `reports/cloud-phase-6j-field-recomposition-validation/data/summary-tables.md` | novo |
| `scripts/audit-cloud6j-field-recomposition.mjs` | novo (somente leitura) |
| `scripts/analyze-cloud6j-summary.mjs` | novo |

Nenhum arquivo de `src/`, `package.json`, `base44/` ou schema foi alterado.

## 13. Commit final

Ver `git log -1` em `cloud/phase-6j-field-recomposition-validation` (commit local, **não publicado**).

**CLOUD-6J — READY FOR HUMAN REVIEW**
