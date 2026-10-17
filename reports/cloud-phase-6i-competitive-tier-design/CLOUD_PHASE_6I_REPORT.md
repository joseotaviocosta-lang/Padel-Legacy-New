# CLOUD-6I — Competitive Tier Progression & Tournament Field Design

Fase **exclusivamente de desenho e experimento**. Nenhum código de produção, balanceamento, limite de ranking, curva de treino, economia, fadiga, schema de save ou versão foi alterado. O diff contém este relatório, um script isolado e os dados em `data/`.

Rótulos: **[CÓDIGO]** leitura de código · **[TESTE]** teste existente executado · **[SIMULAÇÃO]** experimento desta fase · **[HIPÓTESE]** não comprovado.

| Item | Valor |
|---|---|
| Repositório | `joseotaviocosta-lang/Padel-Legacy-New` |
| Origem | `cloud/phase-6h-tournament-consistency` @ `94fe862` (confirmado; worktree limpo) |
| Branch | `cloud/phase-6i-competitive-tier-design` (local, **sem push, sem PR**) |
| Ambiente | `npm ci` executado (`node_modules/` ignorado pelo git) |
| Relatórios lidos | 6E, 6F, 6G, 6H (6E/6F por sumário e conclusões; 6G/6H integralmente) |

## 0. Resumo executivo

1. **A lacuna é real, mas tem duas causas distintas.** (a) *Oferta de campo*: Bronze/Silver escolhem os elegíveis **mais fracos** (OVR 35 / 43–45) embora o pool elegível deles tenha mediana 58–59 e **35–38% de duplas com OVR 50–70** (~105 duplas); o Gold escolhe o topo (OVR 74,5–76) e seu pool elegível tem só 11–13% de duplas 50–70; Platinum e Masters têm 0%. (b) *Elegibilidade*: com rank da dupla ≤ 400 o Silver fecha (`OPEN_TIER_CEILING`) e só restam campos de OVR ~75–80. **[SIMULAÇÃO, 3 sementes]**
2. **Alternativa B (qualifying/rodada intermediária) não ajuda** com o pool atual: o qualifying do Gold **já usa as piores duplas do pool elegível** (OVR 54–68). Reordenar por degraus de percentil o *piora* (73–80); trazer adversários por vizinhança de rank não melhora (62–69). Mais rodadas só aumentam a exposição.
3. **Alternativa C (composição por adequação ao rank) é prejudicial**: faz o Silver ficar com OVR 78 (campo de Gold) e o Bronze com 46, o que quebra a entrada de novatos.
4. **Alternativa A funciona, mas nenhum ajuste de Silver sozinho cobre OVR 45–65.** Um Silver estratificado (A5) dá P(1ª rodada) 0,45 / 0,84 / 0,99 para OVR 45 / 55 / 65 e derruba o "farm" de duplas fortes (P(título) OVR 75: 1,00 → 0,13), mas OVR 65 continua sem opção competitiva; cobrir 65 exige também baixar a cauda do Gold (A4: campo 68,5) — o que muda o Gold para todos.
5. **Alternativa D (nova categoria)** entrega o mesmo efeito de A4 (campo 68, 80% em 50–70) ao custo de calendário, ranking e saves; fica como contingência.
6. **Seeding**: corrigir o seed do jogador muda o rank do 1º adversário (~417 → ~437/406) mas o OVR do caminho em apenas ±0–2 pontos nas 3 sementes: **não é a causa da dificuldade** e não deve ser tratado como remédio. É correção de integridade, decisão separada.
7. **Indicadores**: a 6H escondeu o percentual só no card. O texto **"Chance estimada de avançar: X%"** continua sendo gerado por `buildRecommendationRationale` e persistido nas mensagens da comissão; os rótulos "recomendado/arriscado" dos lembretes de inscrição e "Fraco…Muito forte" do planejamento continuam derivados do índice de rank. `getTournamentChoiceProfile` alimenta a IA do mundo e **não deve ser alterado**; propõe-se uma função paralela só de exibição.
8. **Recomendação**: principal = **A (composição dentro do pool elegível), implementada primeiro só no Silver e atrás de flag**; complementar condicional = **A4 (cauda inferior do Gold)** somente se o gate de meio de carreira confirmar o buraco em OVR 60–70; D como contingência. Antes disso, **CLOUD-6J** deve fechar o que esta fase não pôde medir (mundos de meio de carreira, OVR < 40).

---

## 1. Preparação e parâmetros atuais

**Confirmações.** Repositório e `HEAD 94fe862` conferem; `git status` limpo na partida; branch criada a partir da 6H.

**Funções responsáveis [CÓDIGO]:**

| Responsabilidade | Função / arquivo |
|---|---|
| Campo do torneio do jogador (31 adversários + projeção do caminho) | `buildPlayerTournamentField` — `src/gameplay/worldTour/WorldTourLifecycle.js:1076` |
| Autoridade de admissão (ordem do campo) | `fieldAdmissionScore` (`:104`): tiers abertos (Bronze/Silver) usam `-blended` = **fraco primeiro**; tiers com corte usam `blended` = **força × encaixe** |
| Seleção de participantes | `evaluateTournamentEntry(..., {aiFieldContext:true})` + preferência da IA (`chooseTournament`) → `ordered = [preferidos, demais]` → `slice(offset, offset+need)`; Silver pula `silverFieldOffsetPct` do pool (default efetivo **0,25**: o `?? 0.25` em `:1188`; os presets `-E` trazem 0,15 mas não são o padrão) |
| Qualifying do jogador | mesmo arquivo, `:1250-1266`: elegíveis **fora da chave, ordenados por pior rank**, primeiros 3 |
| Seeding / caminho do jogador | `effectivePlayerRank = min(rank da dupla, bracketSize)` (`:1270`); `buildSeededDrawSlots` (`tournamentSettlement.js:135`); adversário de cada rodada = melhor seed do bloco-espelho. Prévia sintética: `computeSeededOpponentRanksForMainDraw` (`tournamentDraw.js:179`) |
| Elegibilidade | `EntryManager.evaluateTournamentEntry`; `OPEN_TIER_CEILING = 400`; `PRIORITY_WINDOW_N = 4` |
| Rótulos | `getTournamentChoiceProfile` — `circuitCatalog.js:927` |

**Parâmetros atuais [CÓDIGO]:** Bronze/Silver `minRanking 0`, draw 16, taxa 10/20, pontos 10/25; Gold `minRanking 450`, draw 24 (esqueleto de 32 no caminho do jogador), qualifying 16 (3 rodadas), qualifying para rank 451–900, taxa 45, pontos 100; Platinum `minRanking 320`, draw 32, qualifying 321–640; Masters `minRanking 230`, draw 24, qualifying 231–460. Teto da base: rank da dupla ≤ 400 não disputa Bronze/Silver.

**Testes relevantes executados nesta fase (baseline, sem regressões):** `test-tournament-consistency-6h` 12/12 · `test-tournament-selection-divergence-6g` 9/9 · `test-tier-transition-boundary-6f` 17/17 · `test-tournament-teamrank-resolution-v526d` 4/4. Os testes `test:admission-matrix-v522f` e `test:tier-ladder-migration-fase3` (13 gates) já fixam elegibilidade e migração; seriam o piso de qualquer implementação.

---

## 2. Diagnóstico dos campos

**Método [SIMULAÇÃO].** Três mundos semeados (`6i-world-1..3`, kit `bootDrawCareer`, mundo ao dia ~8 — ver §9). Campo = saída real de `buildPlayerTournamentField` observada por `__PL527I_FIELD_OBSERVER`; o pool elegível é reconstruído com funções exportadas (`buildCanonicalPairs`, `evaluateTournamentEntry`, `fieldAdmissionScore`, `chooseTournament`) e **validado contra a função real: 100% de sobreposição de duplas em Bronze, Silver e Gold nas 3 sementes** (`validation` em `data/tier-design-experiments.json`). A probabilidade de vitória por partida vem de uma **curva Δ-OVR calibrada no motor real** (`createMatch/playPoint`, 80 partidas por ponto, curvas separadas para níveis 45/55/65/75/85; `data/win-curves.json`), aplicada ao caminho real de adversários. Não há segundo motor, nem simulação de carreira, nem dado futuro: o jogador só "conhece" o rank da dupla.

### 2.1 Campo principal por tier e semente (função real `buildPlayerTournamentField`)

| Tier | Semente | Pool elegível (n · OVR mediano · % OVR 50–70) | Campo: OVR mediano [p25–p75] (mín–máx) | % do campo em OVR 50–70 | Rank de entrada mediano do campo | 1ª rodada (OVR @ rank de seed) | Qualifying (OVR dos 3 adversários) |
|---|---|---|---|---|---|---|---|
| Bronze | 1 | 305 · 59 · 35% | 35 [35–36] (35–37) | 0% | 916 | 35 @ 923 | — |
| Bronze | 2 | 302 · 59 · 38% | 35 [35–35] (35–39) | 0% | 954 | 35 @ 913 | — |
| Bronze | 3 | 300 · 58 · 35% | 35 [35–35] (35–37) | 0% | 936 | 35 @ 908 | — |
| Silver | 1 | 305 · 59 · 35% | 43.5 [41.5–45.5] (37–46.5) | 0% | 829 | 42.5 @ 802 | — |
| Silver | 2 | 302 · 59 · 38% | 43.5 [43–46] (41–50.5) | 7% | 820 | 43.5 @ 814 | — |
| Silver | 3 | 300 · 58 · 35% | 45 [42.5–47.5] (42–50.5) | 7% | 808 | 42 @ 816 | — |
| Gold | 1 | 319 · 77 · 11% | 75.5 [74.5–77] (70–79.5) | 0% | 484 | 75 @ 419 | 64.5 / 58.5 / 61.5 |
| Gold | 2 | 313 · 77 · 13% | 76 [74.5–78] (69–79.5) | 3% | 481 | 78 @ 414 | 66 / 54 / 66.5 |
| Gold | 3 | 317 · 76.5 · 11% | 74.5 [72.5–76.5] (68.5–81) | 3% | 479 | 77 @ 417 | 68 / 63.5 / 64 |
| Platinum | 1 | 221 · 78.5 · 0% | 76.5 [75–79.5] (71.5–82.5) | 0% | 314 | 71.5 @ 260 | 75.5 / 77.5 / 72.5 |
| Platinum | 2 | 224 · 79 · 0% | 77 [75–79.5] (70.5–83.5) | 0% | 312 | 77.5 @ 260 | 78.5 / 80.5 / 78.5 |
| Platinum | 3 | 223 · 78.5 · 0% | 78 [76–79] (72.5–82) | 0% | 297 | 80.5 @ 254 | 80.5 / 76.5 / 80 |
| Masters | 1 | 178 · 79 · 0% | 79.5 [78–82] (75.5–85) | 0% | 184 | 81.5 @ 160 | 71 / 72.5 / 72.5 |
| Masters | 2 | 178 · 79 · 0% | 80 [78.5–82.5] (75.5–86) | 0% | 174 | 79 @ 144 | 73 / 81.5 / 80.5 |
| Masters | 3 | 177 · 79 · 0% | 80.5 [78.5–83] (76–86.5) | 0% | 202 | 76.5 @ 159 | 77.5 / 75.5 / 74 |

### 2.2 Seleção dos melhores × medianos × piores elegíveis (ordem de admissão de produção, mesma quantidade de vagas; OVR mediano por semente 1/2/3)

| Tier | Elegíveis | Primeiros da ordem de admissão (= campo real) | Faixa do meio | Últimos da ordem |
|---|---|---|---|---|
| Bronze | 305 / 302 / 300 | 35 / 35 / 35 | 56 / 64 / 66 | 71 / 72.5 / 74.5 |
| Silver | 305 / 302 / 300 | 35 / 35 / 35 | 57.5 / 58.5 / 58 | 76.5 / 76.5 / 76 |
| Gold | 319 / 313 / 317 | 75.5 / 76 / 74.5 | 76.5 / 77.5 / 78 | 82.5 / 82.5 / 82.5 |
| Platinum | 221 / 224 / 223 | 76.5 / 77 / 78 | 78.5 / 78.5 / 77.5 | 82 / 82.5 / 82.5 |
| Masters | 178 / 178 / 177 | 79.5 / 80 / 80.5 | 79 / 79 / 79 | 77 / 75.5 / 76 |

### 2.3 Baseline: dupla × campo (média das 3 sementes; P = probabilidade de vencer a 1ª partida da chave principal)

| Cenário (rank da dupla) | Δ OVR na 1ª rodada: 45 / 55 / 65 / 75 | P(vencer 1ª rodada principal): 45 / 55 / 65 / 75 | P(título): 75 / 85 |
|---|---|---|---|
| Bronze | 10 / 20 / 30 / 40 | 0.86 / 0.98 / 1.00 / 1.00 | 1.00 / 1.00 |
| Silver | 2 / 12 / 22 / 32 | 0.57 / 0.89 / 1.00 / 1.00 | 1.00 / 1.00 |
| Gold-direct(300) | -32 / -22 / -12 / -2 | 0.00 / 0.00 / 0.06 / 0.42 | 0.02 / 0.74 |
| Gold-qual(600) | -32 / -22 / -12 / -2 | 0.00 / 0.00 / 0.01 / 0.33 | 0.02 / 0.74 |
| Platinum-qual(500) | -32 / -22 / -12 / -2 | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.40 |
| Masters-direct(150) | -34 / -24 / -14 / -4 | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.17 |

**Leituras:**

* **Pool x campo.** O pool elegível de Bronze e Silver é o mesmo (~300 duplas, mediana 58–59, 35–38% entre 50–70). Bronze pega as ~15 mais fracas (OVR 35); Silver pula 25% e pega a janela seguinte (OVR 43–45; ≤ 7% do campo em 50–70). **~105 duplas de OVR 50–70 existem e não aparecem em nenhum campo principal.**
* **Gold** escolhe o topo por encaixe×força (OVR 74,5–76; mín. 68,5–70); só 11–13% do pool elegível é 50–70 e quase nenhuma entra. Platinum e Masters: pool 177–224, 0% em 50–70.
* **Qualifying do Gold** (OVR 54–68, média ~63) é o degrau intermediário que existe — mas **só para rank 451–900** e é formado pelas **piores** duplas do pool (não por escolha de adequação).
* **Primeiras rodadas:** o jogador (seed nº 1 por D6) enfrenta o espelho de menor seed; ainda assim o OVR da 1ª rodada é o do campo (Bronze 35, Silver 42–43,5, Gold 75–78, Platinum 71,5–80,5, Masters 76,5–81,5).
* **Melhores x piores elegíveis (2.2):** a ordem de admissão do Gold não é "mais forte primeiro": como pondera pelo encaixe de rank, as duplas de maior OVR (mediana 82,5 nas últimas vagas da ordem; máx. 93,5 no pool) ficam no fim da ordem, enquanto o campo real é a faixa de rank de entrada ~480 com OVR ~75. No Bronze/Silver a ordem fraco-primeiro faz o campo ser o *piso* do pool (35) e a "última" janela ser OVR 71–77. Ou seja: **qual ponta do pool se escolhe move o campo em 40 pontos de OVR**; é a alavanca dominante.
* **Dupla × campo (2.3):** a tabela a seguir mostra o buraco. Em Silver a dupla 55 vence a 1ª rodada com P=0,89 e a 65 com P≈1,0 (campeã com ~98%); no Gold direto, a 65 vence a 1ª com P=0,06 e a 75 com 0,42.


---

## 3. Alternativas de design

Todas as políticas abaixo são aplicadas **fora do jogo**, sobre o pool real, e comparadas com a mesma projeção de caminho de produção. Cenários: Bronze (rank 600), Silver (600), Gold direto (300), Gold por qualifying (600), Platinum por qualifying (500), Masters direto (150). Colunas: P(vencer a 1ª rodada da chave principal; inclui passar o qualifying quando há) e P(título) para duplas de OVR 45/55/65/75 e 85 (elite). Resultados em média das 3 sementes; os OVR por semente estão na coluna de campo.

**Definições.** *A1* Silver pula 50% do pool (em vez de 25%) e Gold pula o 25% superior da ordem; *A3/A4* componentes isolados de A1; *A5* Silver com 15 duplas espaçadas uniformemente na janela p25–p75 do pool fraco-primeiro (rodadas iniciais fracas, finais intermediárias); *W35–85* idem p35–p85; *S40* Silver pula 40%; *A2* A1 mais agressivo (60% / 40%). *B1* qualifying em degraus p25/p50/p75 do pool fora da chave; *B2* 4 jogos; *B3* os 3 adversários mais próximos do rank da dupla (informação disponível na inscrição); *B4* 4 jogos. *C1* campo por adequação ao rank (`rankCandidatesByTierFit`, a curva do rescue). *D* categoria nova: duplas elegíveis ao Gold cujo rank é o mais próximo de 650, sem qualifying.

#### Bronze — alternativas (média de 3 sementes)

| Alternativa | OVR mediano do campo (por semente) | % campo 50–70 | P(vencer 1ª rodada principal) 45 / 55 / 65 / 75 | Partidas competitivas (\|Δ\|≤10) 55 / 65 | P(título) 75 / 85 |
|---|---|---|---|---|---|
| Baseline (produção) | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| A1 Silver offset 50% + Gold sem o 25% superior | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| A3 só Silver offset 50% | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| A4 só Gold sem 25% superior | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| A5 Silver estratificado p25–p75 | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| W35–85 Silver estratificado | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| S40 Silver offset 40% | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| A2 Silver 60% + Gold sem 40% | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| B1 qualifying em degraus p25/50/75 | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| B2 = B1 com 4 jogos | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| B3 qualifying por vizinhança de rank (3) | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| B4 = B3 com 4 jogos | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |
| C1 composição por adequação ao rank | 46.5/45.5/47 | 15% | 0.53 / 0.87 / 1.00 / 1.00 | 0.75 / 0.00 | 1.00 / 1.00 |
| D categoria intermediária (rank 650) | 35/35/35 | 0% | 0.86 / 0.98 / 1.00 / 1.00 | 0.00 / 0.00 | 1.00 / 1.00 |

#### Silver — alternativas (média de 3 sementes)

| Alternativa | OVR mediano do campo (por semente) | % campo 50–70 | P(vencer 1ª rodada principal) 45 / 55 / 65 / 75 | Partidas competitivas (\|Δ\|≤10) 55 / 65 | P(título) 75 / 85 |
|---|---|---|---|---|---|
| Baseline (produção) | 43.5/43.5/45 | 5% | 0.57 / 0.89 / 1.00 / 1.00 | 0.67 / 0.00 | 1.00 / 1.00 |
| A1 Silver offset 50% + Gold sem o 25% superior | 61/59.5/60.5 | 100% | 0.05 / 0.37 / 0.81 / 0.97 | 0.83 / 1.00 | 0.78 / 1.00 |
| A3 só Silver offset 50% | 61/59.5/60.5 | 100% | 0.05 / 0.37 / 0.81 / 0.97 | 0.83 / 1.00 | 0.78 / 1.00 |
| A4 só Gold sem 25% superior | 43.5/43.5/45 | 5% | 0.57 / 0.89 / 1.00 / 1.00 | 0.67 / 0.00 | 1.00 / 1.00 |
| A5 Silver estratificado p25–p75 | 61/59.5/56.5 | 58% | 0.45 / 0.84 / 0.99 / 1.00 | 0.58 / 0.50 | 0.13 / 0.80 |
| W35–85 Silver estratificado | 61/64/62 | 60% | 0.23 / 0.70 / 0.97 / 1.00 | 0.50 / 0.58 | 0.23 / 0.88 |
| S40 Silver offset 40% | 52.5/54.5/52 | 89% | 0.25 / 0.76 / 0.98 / 1.00 | 1.00 / 0.25 | 0.98 / 1.00 |
| A2 Silver 60% + Gold sem 40% | 69/67/66 | 78% | 0.02 / 0.23 / 0.57 / 0.93 | 0.25 / 1.00 | 0.41 / 1.00 |
| B1 qualifying em degraus p25/50/75 | 43.5/43.5/45 | 5% | 0.57 / 0.89 / 1.00 / 1.00 | 0.67 / 0.00 | 1.00 / 1.00 |
| B2 = B1 com 4 jogos | 43.5/43.5/45 | 5% | 0.57 / 0.89 / 1.00 / 1.00 | 0.67 / 0.00 | 1.00 / 1.00 |
| B3 qualifying por vizinhança de rank (3) | 43.5/43.5/45 | 5% | 0.57 / 0.89 / 1.00 / 1.00 | 0.67 / 0.00 | 1.00 / 1.00 |
| B4 = B3 com 4 jogos | 43.5/43.5/45 | 5% | 0.57 / 0.89 / 1.00 / 1.00 | 0.67 / 0.00 | 1.00 / 1.00 |
| C1 composição por adequação ao rank | 78/79/78 | 0% | 0.00 / 0.00 / 0.04 / 0.31 | 0.00 / 0.08 | 0.01 / 0.63 |
| D categoria intermediária (rank 650) | 43.5/43.5/45 | 5% | 0.57 / 0.89 / 1.00 / 1.00 | 0.67 / 0.00 | 1.00 / 1.00 |

#### Gold-direct(300) — alternativas (média de 3 sementes)

| Alternativa | OVR mediano do campo (por semente) | % campo 50–70 | P(vencer 1ª rodada principal) 45 / 55 / 65 / 75 | Partidas competitivas (\|Δ\|≤10) 55 / 65 | P(título) 75 / 85 |
|---|---|---|---|---|---|
| Baseline (produção) | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| A1 Silver offset 50% + Gold sem o 25% superior | 67.5/69.5/68.5 | 66% | 0.01 / 0.08 / 0.27 / 0.68 | 0.20 / 0.67 | 0.16 / 0.79 |
| A3 só Silver offset 50% | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| A4 só Gold sem 25% superior | 67.5/69.5/68.5 | 66% | 0.01 / 0.08 / 0.27 / 0.68 | 0.20 / 0.67 | 0.16 / 0.79 |
| A5 Silver estratificado p25–p75 | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| W35–85 Silver estratificado | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| S40 Silver offset 40% | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| A2 Silver 60% + Gold sem 40% | 77/76.5/76 | 0% | 0.00 / 0.00 / 0.06 / 0.40 | 0.00 / 0.07 | 0.00 / 0.51 |
| B1 qualifying em degraus p25/50/75 | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| B2 = B1 com 4 jogos | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| B3 qualifying por vizinhança de rank (3) | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| B4 = B3 com 4 jogos | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.06 / 0.42 | 0.00 / 0.40 | 0.02 / 0.74 |
| C1 composição por adequação ao rank | 76.5/76.5/75.5 | 2% | 0.00 / 0.00 / 0.06 / 0.41 | 0.00 / 0.27 | 0.00 / 0.58 |
| D categoria intermediária (rank 650) | 67.5/68.5/68 | 80% | 0.01 / 0.13 / 0.40 / 0.88 | 0.27 / 0.93 | 0.36 / 0.99 |

#### Gold-qual(600) — alternativas (média de 3 sementes)

| Alternativa | OVR mediano do campo (por semente) | % campo 50–70 | P(vencer 1ª rodada principal) 45 / 55 / 65 / 75 | Partidas competitivas (\|Δ\|≤10) 55 / 65 | P(título) 75 / 85 |
|---|---|---|---|---|---|
| Baseline (produção) | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.01 / 0.33 | 0.25 / 0.58 | 0.02 / 0.74 |
| A1 Silver offset 50% + Gold sem o 25% superior | 67.5/69.5/68.5 | 66% | 0.00 / 0.00 / 0.04 / 0.52 | 0.38 / 0.75 | 0.13 / 0.79 |
| A3 só Silver offset 50% | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.01 / 0.33 | 0.25 / 0.58 | 0.02 / 0.74 |
| A4 só Gold sem 25% superior | 67.5/69.5/68.5 | 66% | 0.00 / 0.00 / 0.04 / 0.52 | 0.38 / 0.75 | 0.13 / 0.79 |
| A5 Silver estratificado p25–p75 | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.01 / 0.33 | 0.25 / 0.58 | 0.02 / 0.74 |
| W35–85 Silver estratificado | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.01 / 0.33 | 0.25 / 0.58 | 0.02 / 0.74 |
| S40 Silver offset 40% | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.01 / 0.33 | 0.25 / 0.58 | 0.02 / 0.74 |
| A2 Silver 60% + Gold sem 40% | 77/76.5/76 | 0% | 0.00 / 0.00 / 0.01 / 0.30 | 0.25 / 0.38 | 0.00 / 0.51 |
| B1 qualifying em degraus p25/50/75 | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.00 / 0.02 | 0.00 / 0.38 | 0.00 / 0.54 |
| B2 = B1 com 4 jogos | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.00 / 0.00 | 0.00 / 0.33 | 0.00 / 0.47 |
| B3 qualifying por vizinhança de rank (3) | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.01 / 0.31 | 0.29 / 0.63 | 0.02 / 0.74 |
| B4 = B3 com 4 jogos | 75.5/76/74.5 | 2% | 0.00 / 0.00 / 0.00 / 0.29 | 0.37 / 0.67 | 0.02 / 0.74 |
| C1 composição por adequação ao rank | 76.5/76.5/75.5 | 2% | 0.00 / 0.00 / 0.01 / 0.31 | 0.25 / 0.50 | 0.00 / 0.58 |
| D categoria intermediária (rank 650) | 67.5/68.5/68 | 80% | 0.01 / 0.13 / 0.40 / 0.88 | 0.27 / 0.93 | 0.36 / 0.99 |

#### Platinum-qual(500) — alternativas (média de 3 sementes)

| Alternativa | OVR mediano do campo (por semente) | % campo 50–70 | P(vencer 1ª rodada principal) 45 / 55 / 65 / 75 | Partidas competitivas (\|Δ\|≤10) 55 / 65 | P(título) 75 / 85 |
|---|---|---|---|---|---|
| Baseline (produção) | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |
| A1 Silver offset 50% + Gold sem o 25% superior | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |
| A3 só Silver offset 50% | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |
| A4 só Gold sem 25% superior | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |
| A5 Silver estratificado p25–p75 | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |
| W35–85 Silver estratificado | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |
| S40 Silver offset 40% | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |
| A2 Silver 60% + Gold sem 40% | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |
| B1 qualifying em degraus p25/50/75 | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.00 | 0.00 / 0.17 | 0.00 / 0.33 |
| B2 = B1 com 4 jogos | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.00 | 0.00 / 0.15 | 0.00 / 0.28 |
| B3 qualifying por vizinhança de rank (3) | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.14 | 0.04 / 0.50 | 0.00 / 0.55 |
| B4 = B3 com 4 jogos | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.10 | 0.07 / 0.52 | 0.00 / 0.54 |
| C1 composição por adequação ao rank | 78/78/79 | 0% | 0.00 / 0.00 / 0.00 / 0.00 | 0.00 / 0.09 | 0.00 / 0.26 |
| D categoria intermediária (rank 650) | 76.5/77/78 | 0% | 0.00 / 0.00 / 0.00 / 0.03 | 0.00 / 0.21 | 0.00 / 0.40 |

#### Masters-direct(150) — alternativas (média de 3 sementes)

| Alternativa | OVR mediano do campo (por semente) | % campo 50–70 | P(vencer 1ª rodada principal) 45 / 55 / 65 / 75 | Partidas competitivas (\|Δ\|≤10) 55 / 65 | P(título) 75 / 85 |
|---|---|---|---|---|---|
| Baseline (produção) | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| A1 Silver offset 50% + Gold sem o 25% superior | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| A3 só Silver offset 50% | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| A4 só Gold sem 25% superior | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| A5 Silver estratificado p25–p75 | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| W35–85 Silver estratificado | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| S40 Silver offset 40% | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| A2 Silver 60% + Gold sem 40% | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| B1 qualifying em degraus p25/50/75 | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| B2 = B1 com 4 jogos | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| B3 qualifying por vizinhança de rank (3) | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| B4 = B3 com 4 jogos | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |
| C1 composição por adequação ao rank | 79.5/79.5/80.5 | 0% | 0.00 / 0.00 / 0.03 / 0.26 | 0.00 / 0.00 | 0.00 / 0.30 |
| D categoria intermediária (rank 650) | 79.5/80/80.5 | 0% | 0.00 / 0.00 / 0.04 / 0.26 | 0.00 / 0.00 | 0.00 / 0.17 |


### 3.1 Avaliação qualitativa

| Critério | A — seleção | B — qualifying ampliado | C — composição dos tiers existentes | D — nova categoria |
|---|---|---|---|---|
| **Competitividade (medida)** | Silver estratificado: 45/55/65 → 0,45/0,84/0,99; anti-farm (OVR 75 título 1,00→0,13). Gold A4: 65 → 0,27 (era 0,06). Nenhum ajuste isolado cobre 45–65 | **Nula ou negativa**: qualifying já é o piso do pool; B1/B2 sobem para 73–80; B3 62–69 sem ganho | **Negativa**: Silver→78, Bronze→46 | Positiva: campo 68, 80% em 50–70 (55/65/75 → 0,13/0,40/0,88), mas elite 85 título 0,99 |
| **Ranking** | Muda só quem enfrenta quem; pontos por tier inalterados. Mais duplas fortes derrotadas no Silver reduz o acúmulo de pontos fáceis (efeito **[HIPÓTESE]**, não medido) | Mais jogos → mais participações → mais pontos de participação (6G: ranking avança por participação) | Altera distribuição de pontos entre IA e jogador | Novos pontos/limites de rank; risco de inflar o ranking de 400–900 |
| **Calendário** | Nenhum | +1 a +2 dias por torneio com qualifying mais longo; mais `DATE_CONFLICT` | Nenhum | Novo tier no calendário anual (volume, conflitos, janelas de inscrição) |
| **Risco: forte em torneio fraco** | Reduz o risco atual (Silver base: título 1,00 para OVR ≥ 65); A1 deixa 0,78 | Neutro | Reduz, mas por destruir o Silver | **Alto**: elite 85 → 0,99 se algum par de rank ruim entrar |
| **Complexidade** | Baixa: troca de janela em um `slice` (já parametrizado por `silverFieldOffsetPct`) | Média: contagem de rodadas, datas, `qualifying_required` | Média: reordenar admissão, impacto em IA | Alta: catálogo, elegibilidade, migração, UI, calendário |
| **Saves** | Compatível: campos são derivados no D-3 e já persistidos em `tournament_run` | Cuidado com eventos agendados com 3 rodadas | Compatível | Exige migração de tiers (`test:tier-ladder-migration-fase3`) |
| **Incremental** | **Sim** (flag; Silver primeiro, Gold depois) | Sim, mas sem benefício | Sim, mas prejudicial | Não |

**Achado importante sobre histórico:** o `silverFieldOffsetPct` já foi calibrado na 5.27-I **para baixo** (0,25 → 0,15 nos presets `-E`) para que o Silver não ficasse ~11 OVR acima do Bronze. A direção sugerida aqui é a oposta. O default efetivo hoje continua 0,25; qualquer mudança precisa reavaliar o início de carreira (ver §9 e §10).

---

## 4. Experimentos controlados

* Escopo: 3 sementes × (Bronze, Silver, Gold, Platinum, Masters) × 14 políticas × 6 cenários de entrada × 5 níveis de dupla (45/55/65/75/85), tudo em `data/tier-design-experiments.json`.
* **Níveis solicitados (45/55/65/75):** ver tabelas da §3. Resumo do que um jogador de cada nível encontra **hoje** (baseline): 45 → Bronze P=0,86 (título 0,53) e Silver P=0,57; 55 → Bronze 0,98, Silver 0,89 (título 0,50), Gold 0,00; 65 → Silver 1,00 (título 0,98), Gold direto 0,06, Gold qualifying 0,01; 75 → Silver/Bronze 1,00, Gold direto 0,42 (título 0,02), Platinum/Masters qualifying/direto 0,03–0,26.
* **Elite (OVR 75/85):** Platinum e Masters ficam inalterados por A, B e D (campos 77 e 80 em todas as variantes). Para OVR 85, título: Gold 0,74, Platinum (qual.) 0,40, Masters 0,17. A4 sobe o título de 85 no Gold só para 0,79 e o de 75 de 0,02 para 0,13–0,16: o Gold continua um filtro para OVR 75, e as duplas de elite continuam encontrando Platinum/Masters como degraus exigentes.
* **Sem uso de dados futuros.** As políticas A/B/C/D usam apenas pool elegível, ordens de admissão e (B3) o rank da dupla; o OVR do jogador entra só na medição.

---

## 5. Seeding

### 5.1 Seeding — Gold, campo de produção fixo (média das 3 sementes)

| Rank da dupla | Política | Seed do jogador | OVR da 1ª rodada | Rank de seed do 1º adversário | OVR médio do caminho | P(1ª rodada) 65 / 75 | Partidas esperadas vencidas 75 | P(título) 75 |
|---|---|---|---|---|---|---|---|---|
| 150 | atual (min(rank, 32)) | 32 | 76.7 | 417 | 75.8 | 0.06 / 0.42 | 0.77 | 0.02 |
| 150 | rank real | 150 | 76.7 | 417 | 75.8 | 0.06 / 0.42 | 0.77 | 0.02 |
| 300 | atual (min(rank, 32)) | 32 | 76.7 | 417 | 75.8 | 0.06 / 0.42 | 0.77 | 0.02 |
| 300 | rank real | 300 | 76.7 | 417 | 75.8 | 0.06 / 0.42 | 0.77 | 0.02 |
| 443 | atual (min(rank, 32)) | 32 | 76.7 | 417 | 75.8 | 0.06 / 0.42 | 0.77 | 0.02 |
| 443 | rank real | 443 | 76.7 | 437 | 75.4 | 0.07 / 0.42 | 0.89 | 0.03 |
| 600 | atual (min(rank, 32)) | 32 | 76.7 | 417 | 75.8 | 0.06 / 0.42 | 0.77 | 0.02 |
| 600 | rank real | 600 | 74.8 | 406 | 75.5 | 0.09 / 0.57 | 1.00 | 0.03 |
| 800 | atual (min(rank, 32)) | 32 | 76.7 | 417 | 75.8 | 0.06 / 0.42 | 0.77 | 0.02 |
| 800 | rank real | 800 | 74.8 | 406 | 75.5 | 0.09 / 0.57 | 1.00 | 0.03 |

**Comportamento atual [CÓDIGO+SIMULAÇÃO].** O jogador entra com `seedRank = min(rank, 32)`; todos os adversários têm rank de seed > 32 ⇒ o jogador é sempre seed nº 1 (qualquer rank, inclusive "sem ranking" ≈ 24, que também vira nº 1 — teste C2/C3 da 6H). O adversário de cada rodada é o melhor seed do bloco-espelho. O esqueleto do caminho tem 32 posições preenchidas (31+1), então **não há byes no caminho do jogador**; o draw oficial do Gold (24) não é modelado ali. As regras oficiais já modeladas no jogo (`seedCountForDrawSize`: 4 seeds ≤ 8, 8 seeds ≤ 32; byes para os melhores seeds; demais posições sorteadas de forma determinística por torneio) valem para o campo **inteiro**, mas o caminho do jogador as usa só como projeção.

**Seeding por rank real.** Para ranks 150 e 300 o jogador continua melhor que todo o campo: nada muda. Para 443 o 1º adversário passa de rank ~417 para ~437 e para 600/800 passa para ~406 (o melhor seed do bloco), com **OVR do 1ª rodada 76,7 → 76,7 (443) e 76,7 → 74,8 (600)** e OVR médio do caminho 75,8 → 75,4–75,5. Em P(1ª rodada) para OVR 75: 0,42 → 0,42 (443) / 0,57 (600, 800). **O seeding honesto não torna o Gold mais difícil nestes mundos; em ranks ruins ele chega a facilitar**, porque o rank de seed dos campos de Gold (aprox. 350–500) quase não ordena o OVR (faixa 69–80 sem ordem clara; correlação não calculada formalmente). A 6H sugeriu que a 1ª rodada ficaria "mais difícil" em termos de rank (rank 271 × 462); em força real o efeito medido é ≤ 2 pontos de OVR.

**Silver:** campos homogêneos (OVR 42–47); seeding praticamente irrelevante para a dificuldade (P(1ª rodada) idêntica até a 2ª casa em todos os ranks elegíveis, exceto 800 para OVR 55: 0,88 × 0,89).

**Conclusão [SIMULAÇÃO, 3 sementes]:** corrigir o seeding é uma decisão de **integridade e narrativa** (quem é cabeça de chave, histórico, pontos) mais do que de dificuldade. Não deve ser usado para resolver a lacuna Silver→Gold e **não foi corrigido** nesta fase.

---

## 6. Indicadores de dificuldade

Cadeia: `getTournamentChoiceProfile(torneio, rankDaDupla)` → `titleChance = clamp(2,78, fit·0,55 + (100−prestígio)·0,18)` (fit = trapézio de rank), `expectedPoints`, `expectedNet`, `risk = 100 − titleChance + 5·ordem`. `evaluateTournamentChoice` acrescenta `semifinalChance = titleChance·1,5+8`, `finalChance`, `fatigueIncrease`. **Nenhum recebe OVR, adversários ou campo.**

| # | Indicador | Origem | Consumidor | Classe |
|---|---|---|---|---|
| 1 | `titleChance`, `semifinalChance`, `finalChance` no card | `evaluateTournamentChoice` | `Tournaments.jsx` | Informativo — **já neutralizado na 6H** ("Não estimada") |
| 2 | `expectedPoints`, `expectedNet` no card | idem | `Tournaments.jsx` | Informativo (rotulados "aprox.") |
| 3 | **`titleChance`, `expectedNet`, `expectedPoints`, `prestige`, `fatigueIncrease` → `scoreOption`** | `TournamentSelectionAI.js:120-128` | `chooseTournament`: `SeasonScheduler.js:10`, `ensureWorldTourDraws` (`WorldTourLifecycle.js:945`), preferência no campo do jogador (`:1171`) | **IA / decisão automática** — define quais duplas do mundo jogam cada torneio, logo **a composição dos campos** |
| 4 | `choice.titleChance`/`expectedNet` → `coachToneForTournamentChoice` ("recomendado" se título ≥ 30 ou net ≥ 400; "arriscado") | `weeklyCareerReview.js:109`, `careerCommunications.js:307` | texto "Campo compatível…/Campo mais forte…" e **lembrete de inscrição** ("Seu treinador considera este torneio recomendado") — mensagem **persistida** | Planejamento / comunicação (textual, persistente) |
| 5 | `getTournamentPlanningFieldStrength` ("Fraco…Muito forte") a partir de `titleChance` | `weeklyCareerReview.js:148` | campo `fieldStrength` dos itens do planejamento; **não encontrei renderização em `src/`** (grep) | Planejamento (dado latente) |
| 6 | `getTournamentPlanningRiskReward` a partir de `risk`/`expectedNet` | `weeklyCareerReview.js:157` | campo `riskReward`; **não encontrei renderização** | Planejamento (dado latente) |
| 7 | `planningQualityScore = fit·2 + net/100 + pontos/10 − risk` e `planningScore` (fit/4, prestígio/12) | `weeklyCareerReview.js:176-198` | **"Melhor opção"** na Home/CareerHub e `buildCompetitiveWeeklyDecision` → reunião da comissão | Planejamento — **efeito em decisões do jogador** (recomendação, não registra nada) |
| 8 | **`buildRecommendationRationale`: "Chance estimada de avançar: X%"** (`semifinalChance`) | `competitiveWeeklyDecision.js:38` | corpo da mensagem da comissão (`competitiveStaffReview.js:77`) e `recommendations` persistido (`:220`) | Informativo, **mas ainda exibe percentual enviesado** (residual da 6H) |

**Resposta às classes pedidas:** (1) puramente informativos: 1, 2, 5, 6; (2) usados pela IA: 3; (3) usados no planejamento semanal: 4, 5, 6, 7, 8; (4) com possível efeito em decisões automáticas: 3 (IA do mundo, afeta campos) e 7 (recomendação ao jogador; a inscrição continua manual).

**Como corrigir os rótulos sem alterar silenciosamente a IA [proposta, não implementada]:**

1. **Não tocar em `getTournamentChoiceProfile`/`scoreOption`** (calibração 5.x depende da IA). Congelar seus campos como "índice de adequação por rank" e renomear só na camada de exibição (`rankFitIndex`), com teste que garanta que `chooseTournament` devolve a mesma decisão para uma matriz fixa de entradas.
2. Criar **uma função pura paralela**, p.ex. `getCompetitiveFieldBrief(tier, teamOvr, fieldSample)`, que devolva uma **faixa qualitativa** (Δ de força típico do campo: "muito acima", "acima", "equilibrado"…) baseada no OVR da dupla e em um resumo do campo do tier (mediana observada). Sem percentual até existir calibração.
3. Trocar apenas os **textos**: item 8 → "Índice de adequação ao ranking: N/100 (não mede a força do campo)"; item 4 → tons derivados de (elegível, fit), não de `titleChance`; itens 5 e 6 → alimentados pelo novo resumo (ou removidos enquanto latentes).
4. **Fixar por teste** (a) que a IA não mudou (hash das decisões de `chooseTournament` numa matriz), (b) que nenhum texto de interface contém "Chance" com percentual enquanto a função nova não for validada.
5. Mensagens já persistidas em saves antigos não são reescritas.

---

## 7. Recomendação

**Alternativa principal: A — recompor o campo dentro do pool elegível, primeiro só no Silver, atrás de flag.**

Evidências:

* É a única alternativa com efeito **mensurável e positivo** a baixo custo: o pool tem as duplas (35–38% em 50–70), o que falta é escolhê-las.
* Silver estratificado (A5) / janela p35–85: P(1ª rodada) para OVR 45/55 = 0,45/0,84 (A5) ou 0,23/0,70 (W35–85); duplas de OVR 75 deixam de ser campeãs quase certas (título 1,00 → 0,13–0,23); elite 85 continua dominando (0,78–0,88) — as elites já não deveriam estar ali pelo teto de 400.
* B e C têm resultado nulo/negativo nas mesmas 3 sementes; D é equivalente a A4 com custo muito maior.

**Limite explícito desta recomendação [SIMULAÇÃO]:** nenhuma configuração de Silver cobre 45 **e** 65 (A1: 0,05 / 0,81; A5: 0,45 / 0,99; S45: 0,09 / 0,83). E nenhuma alternativa de Silver ajuda quem já está com rank ≤ 400 (Silver fechado). Para OVR 60–70 em Gold é preciso baixar a cauda do Gold.

**Complementar condicional: A4 (Gold sem o 25% superior da ordem de admissão)** — campo 68,5 (67,5–69,5), 66% do campo em 50–70; P(1ª rodada) para OVR 55/65/75 no Gold direto sobe de 0,00/0,06/0,42 para 0,08/0,27/0,68. Só entra se, na 6J, o gate de meio de carreira confirmar o buraco 60–70 **e** houver decisão sobre a paridade com os Gold do mundo-IA (que usam outra rotina de seleção e continuariam em ~75). Escada resultante: Bronze 35 / Silver ~59 / Gold ~68,5 / Platinum 77 / Masters 80 — degraus 24, 9,5, 8,5, 3.

**Contingência:** D, se A+A4 não atingirem os critérios.

**Rejeitar com base em dados:** B (qualifying) e C (adequação ao rank), por não melhorarem ou piorarem a oferta.

### 7.1 Impacto esperado na experiência
Jogador de OVR 55 deixa de "passear" no Silver (0,89 → 0,70–0,84) e passa a ter partidas apertadas nas rodadas finais; duplas de OVR 65–75 deixam de vencer o Silver com folga (título 0,98–1,00 → ≤ 0,23 para 75). Com A4, o salto ao Gold deixa de ser uma parede (0,06 → 0,27 para OVR 65).

### 7.2 Riscos
Início de carreira (OVR 22–40) não foi medido e é onde a 5.27-I calibrou o oposto; Gold mais fraco para IA e jogador diverge se só o campo do jogador mudar; pontos de ranking podem fluir mais devagar no Silver (hipótese); regressão do equilíbrio "Silver < Gold" da 5.5.

### 7.3 Testes necessários
`test:admission-matrix-v522f`, `test-tier-transition-boundary-6f`, `test-tournament-consistency-6h`, `test:tier-ladder-migration-fase3`, `test:career-persistence-integrity`; novos: (i) campo Silver sob a flag (ordem Bronze < Silver < Gold em cada semente), (ii) flag desligada ⇒ campos idênticos aos atuais (hash), (iii) curva Δ-OVR para níveis 20–40 antes de ligar a flag.

### 7.4 Plano de implementação incremental
1. **6J-1 (sem mudança de jogo):** nova função de exibição + textos (§6); teste de não-regressão da IA.
2. **6J-2 (medição):** repetir este experimento em mundos de meio de carreira (ao menos 3 sementes, datas 2026-10, 2027-02, 2027-06) e para OVR 20–40; decidir o formato (A5 ou W35–85).
3. **6J-3 (flag):** parâmetro de composição do Silver em `balance527.competition` (default = comportamento atual); ligado só em harness.
4. **6J-4:** um perfil de carreira curto por política (sem temporadas completas repetidas).
5. **6J-5:** A4 só se o gate exigir.

### 7.5 Critérios objetivos de aprovação e reversão
**Aprovação** (em ≥ 2 de 3 sementes e nas três datas): campo Silver mediano entre 52 e 62 e Bronze < Silver < Gold com diferença ≥ 5; P(1ª rodada) em Silver ∈ [0,25; 0,85] para OVR 45–55; título de OVR 75 no Silver ≤ 0,30; Platinum/Masters inalterados; flag desligada ⇒ campos idênticos; nenhuma falha nos testes listados. **Reversão:** P(1ª rodada) de OVR ≤ 35 no Bronze/Silver < 0,50 em qualquer semente; ordem Bronze < Silver < Gold violada; queda de pontos de ranking do Silver de início de carreira > 20% (medida em 6J-4); qualquer divergência persistida em saves existentes.

---

## 8. Riscos gerais

* **Saves:** os campos são derivados no D-3 e persistidos em `tournament_run`; a mudança afeta só sorteios futuros. Eventos com campo já sorteado não mudam.
* **IA/paridade:** `silverFieldOffsetPct` só existe no campo do jogador; nenhum "Silver" do mundo-IA usa essa janela — logo, mudar A vale para o jogador e deixa os demais torneios Silver do mundo como estão (precedente, mas precisa de decisão consciente).
* **Ranking/calendário:** B e D aumentam jogos e pontos de participação (6G).
* **Balanceamento histórico:** 5.27-I e 5.5 calibraram Silver e Gold; qualquer ajuste reabre essa discussão.

## 9. Limitações

* Mundos ao **dia ~8** (o kit não avança): o buraco foi medido em mundos jovens; a 6G mostrou que o qualifying do Gold muda entre mundos (59–68 aqui e 38–55 nos dados de meio de carreira da 6D). As conclusões sobre B podem mudar com mundos maduros.
* Atributos **planos** no motor (como 6E/6G): a curva Δ-OVR ignora estilo, lado, fadiga e parceiro individual.
* P(1ª rodada) e P(título) são calculados analiticamente com a curva (caminho projetado = melhor seed do espelho em cada rodada); não há chave completa jogada, nem adversários reais evoluindo.
* A curva não foi calibrada abaixo de OVR 45 (início de carreira OVR 22–40 **não medido**).
* Efeitos em ranking/pontos e calendário são qualitativos.
* Rank da dupla ≠ OVR: os cenários de rank (300/600) são ilustrativos; a associação rank-OVR do jogador real não foi reamostrada.
* A reconstrução de pool replica a função real e foi validada (100% em Bronze/Silver/Gold, 3 sementes), mas não para Platinum/Masters.

## 10. Proposta de escopo para CLOUD-6J

1. Implementar **somente** a camada de exibição dos indicadores (§6) com teste de não-regressão da IA; corrigir "Chance estimada de avançar" e o tom dos lembretes.
2. Reexecutar `scripts/audit-cloud6i-tier-design.mjs` em mundos de meio de carreira e incluir OVR 20–40; escolher formato do Silver pelos critérios da §7.5.
3. Se aprovado, adicionar o parâmetro de composição do Silver atrás de flag (default = atual) e as verificações de hash.
4. Decisão humana separada sobre D6 (seeding) e paridade IA-jogador.
5. Fora do escopo: A4, D, qualquer mudança de ranking, treino, economia, fadiga ou schema.

## 11. Arquivos modificados

| Arquivo | Tipo |
|---|---|
| `reports/cloud-phase-6i-competitive-tier-design/CLOUD_PHASE_6I_REPORT.md` | novo |
| `reports/cloud-phase-6i-competitive-tier-design/data/tier-design-experiments.json` | novo (resultados por semente) |
| `reports/cloud-phase-6i-competitive-tier-design/data/win-curves.json` | novo (curvas Δ-OVR do motor real, n=80) |
| `scripts/audit-cloud6i-tier-design.mjs` | novo (somente leitura; não altera `src/`) |

Nenhum arquivo de `src/`, `package.json`, `base44/` ou schema foi alterado. Reprodução: `npm ci && node scripts/audit-cloud6i-tier-design.mjs [--seeds=3] [--cal=80] [--reuseCurves=1]` (~4 min).

## 12. Commit final

Ver `git log -1` em `cloud/phase-6i-competitive-tier-design` (commit local, **não publicado**).

**CLOUD-6I — READY FOR HUMAN REVIEW**
