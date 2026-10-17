# CLOUD-6E — Competitive Balance & Partner Impact Isolation

Fase **exclusivamente de diagnóstico**. Nenhum código de produção, balanceamento, schema, versão, contrato de IA, economia, fadiga ou preset foi alterado. O diff contém só este relatório, os dados em `data/` e um script somente-leitura (`scripts/audit-cloud6e-balance.mjs`).

| Item | Valor |
|---|---|
| Repositório | `joseotaviocosta-lang/Padel-Legacy-New` |
| Origem | `cloud/phase-6d-career-progression-validation` @ `3234cd4` (confirmado; worktree limpo) |
| Branch | `cloud/phase-6e-competitive-balance-isolation` (local, **sem push, sem PR**) |
| Motor testado | produção: `src/engine/match/MatchEngine.js` (`createMatch` + `playPoint`) — **nenhum motor alternativo** |
| Rótulos | **Observado** = medido aqui; **Hipótese** = interpretação não isolada; **Recomendação** = decisão humana |

---

## 1. Resumo executivo

1. **Observado:** o motor depende da **média da dupla** contra a **média dos adversários**. Jogador e parceiro pesam **igual** por ponto de OVR (regressão sobre 64 células: ponto ganho ≈ +0,31 pp por OVR do jogador, +0,30 por OVR do parceiro, −0,57 por OVR médio dos adversários). Não há prêmio de "parceiro" no motor; a dominância do parceiro vem da **amplitude de OVR disponível** (14–90), não de peso maior.
2. **Observado:** o jogador **OVR 45 vence iniciantes** (adversários ~35, nível Bronze) em 87,5% das partidas mesmo com parceiro 45, e 97% com parceiro 60. O problema **não** é "OVR 45 não vence iniciantes".
3. **Observado:** o início real é bem pior que 45. O personagem nasce com OVR 22 e parceiro 14–37. Com jogador 22–30 e parceiro 15, a vitória contra Bronze é de 7–11%; com parceiro 35, 24–40%; com parceiro 60, 72–83%.
4. **Observado:** a força dos adversários é **bimodal**. Os campos Bronze/Silver têm força ~35/~47 e Gold/Platinum/Masters ~78–81 (6D, partidas reais). Não há degrau intermediário. Contra ~80, uma dupla de média 57 (jogador 55 + parceiro 60) vence **0%**; só vence com parceiro 90 e jogador ≥65 (29%) ou 75 (61%).
5. **Observado (achado principal):** nas 4 execuções da 6D/baseline a última partida em Bronze/Silver ocorre quando o ranking de dupla cruza ~360–400 (ex.: 6D normal em 08/04/2027, rank de dupla 357). **Depois disso o normal fez 0/32 (6D) e 0/39 (baseline)** e o otimizador 6D 1/44, com Δ de força médio de −31 e −23. **Hipótese:** o teto `OPEN_TIER_CEILING = 400` em `EntryManager.js` retira o jogador da base exatamente quando ele ainda tem média ~47–55, e o próximo campo disponível (Gold) tem ~78. A coincidência de datas foi observada; a causalidade não foi isolada (a política `best-eligible` do harness também influencia).
6. **Observado:** a 6B/6C **não é a causa única nem principal** das derrotas. O motor com atributos planos reproduz as vitórias observadas da 6D e da baseline (36 observadas contra 40,5 esperadas; 73 contra 79,6; 20 contra 27,5; 2 contra 8,3). A curva mais lenta desloca o jogador para a faixa onde a **média da dupla fica 25–30 pontos abaixo** do próximo campo.
7. **Veredito (diagnóstico):** o início ficou mais difícil, mas o gargalo estrutural é o **salto de força Silver→Gold combinado com o teto de rank 400 da base e a ausência de aviso**. Ajustes de curva são o último recurso (§8).

---

## 2. Metodologia

- **Instrumento:** `scripts/audit-cloud6e-balance.mjs` chama `createMatch`/`playPoint` (mesmo laço de `simulateBalancedMatch` e do harness de torneios `scripts/lib/v526Tournament.mjs`). Nenhuma fórmula reimplementada.
- **Como o motor usa os dados (lido em `playerModel.js`, `RallyEngine.js`):**
  - Cada golpe usa o **atributo individual** do golpe (`serve`, `forehand`…); o OVR só é fallback quando falta atributo. Atletas do mundo (só `overall_rating`) entram com os 10 atributos iguais ao OVR.
  - `skill = 50 + (atributo − 50) × 0,2`; confiança e energia entram com a mesma inclinação (0,2); `execution = skill + confiança − penalidade de energia − risco + iniciativa de saque + ruído`.
  - Não há multiplicador de compatibilidade, experiência, dificuldade ou superfície no cálculo do ponto. Química inicial é um valor guardado no jogador, mas não entra em `execution`.
- **Constantes mantidas:** energia 100 (exceto controle), moral 72, entrosamento 76, tática `equilibrado` nos dois lados, jogador na direita e parceiro na esquerda, adversários fixos. A semente depende só do índice (`6e:0..n-1`), então todas as células usam os mesmos índices (números aleatórios comuns, reduz ruído nas diferenças).
- **Faixas de adversário** (medianas por tier em 4 CSVs reais da 6D, coluna `oppStrength`): iniciante = **35** (Bronze, 32–41); intermediário = **48** (Silver, 39–58); elite = **80** (Gold/Platinum/Masters, 71–87). Adicionei **65** como faixa exploratória (zona vazia entre Silver e Gold).
- **Ruído:** n = 400 partidas por célula → IC95% ≈ ±3,6 pp perto de 50%, ±1,5 pp perto de 95%. Taxas são **estimativas**, não probabilidades exatas.
- **Calibração externa:** cada partida real da 6D/baseline foi re-simulada com atributos planos (n = 40 por partida) e comparada com o resultado observado.

### Tamanho das amostras

| Bloco | Células | Partidas por célula | Total |
|---|---|---|---|
| Matriz principal (4 jogador × 4 parceiro × 4 faixas) | 64 | 400 | 25.600 |
| Início de carreira (jogador 22/30/38 × parceiro 15/35/60 × 2 faixas) | 18 | 400 | 7.200 |
| Controles (§5) | 26 | 400 | 10.400 |
| Atributos reais da 6D (snapshots, 5 dias × 2 perfis × 2 faixas × 2 formas) | 40 | 400 | 16.000 |
| Calibração (≈ 406 partidas reais) | 406 | 40 | ≈ 16.200 |
| **Total** | | | **≈ 75.000 partidas, ~11 min em 3 processos** |

---

## 3. Matriz de cenários e resultados (taxa de vitória %, n = 400)

Linhas = OVR do jogador; colunas = OVR do parceiro. Dados completos (inclui diferença de sets, games, % de pontos e frequência de 3º set) em `data/main-matrix-n400.json`.

**Adversários iniciantes (35)**

| | Q45 | Q60 | Q75 | Q90 |
|---|---|---|---|---|
| P45 | 87,5 | 97,3 | 99,5 | 100 |
| P55 | 97,0 | 99,5 | 100 | 100 |
| P65 | 98,8 | 99,5 | 100 | 100 |
| P75 | 99,8 | 100 | 100 | 100 |

**Adversários intermediários (48)**

| | Q45 | Q60 | Q75 | Q90 |
|---|---|---|---|---|
| P45 | 31,5 | 64,8 | 93,0 | 98,3 |
| P55 | 55,8 | 84,3 | 99,0 | 100 |
| P65 | 82,5 | 97,8 | 100 | 100 |
| P75 | 91,3 | 99,8 | 100 | 100 |

**Faixa exploratória (65)**

| | Q45 | Q60 | Q75 | Q90 |
|---|---|---|---|---|
| P45 | 0,3 | 6,3 | 23,0 | 62,0 |
| P55 | 2,5 | 13,8 | 48,5 | 78,5 |
| P65 | 7,5 | 32,0 | 73,5 | 96,0 |
| P75 | 24,8 | 65,3 | 93,0 | 99,5 |

**Adversários de elite (80)**

| | Q45 | Q60 | Q75 | Q90 |
|---|---|---|---|---|
| P45 | 0,0 | 0,0 | 0,0 | 1,8 |
| P55 | 0,0 | 0,0 | 0,0 | 8,5 |
| P65 | 0,3 | 0,3 | 3,3 | 29,5 |
| P75 | 0,3 | 1,3 | 15,3 | 61,3 |

**Início real de carreira** (`data/career-start-n400.json`; OVR do personagem na criação = 22):

| Jogador / Parceiro | vs iniciante (35) | vs intermediário (48) |
|---|---|---|
| 22 / 15 | 6,5 | 0,0 |
| 22 / 35 | 23,5 | 2,5 |
| 22 / 60 | 72,0 | 21,3 |
| 30 / 15 | 10,8 | 0,3 |
| 30 / 35 | 40,0 | 3,0 |
| 30 / 60 | 82,5 | 37,0 |
| 38 / 15 | 16,5 | 1,0 |
| 38 / 35 | 57,5 | 10,3 |
| 38 / 60 | 92,8 | 53,0 |

### Combinações praticamente incapazes de vencer (< 5%)

14 das 64 células da matriz principal: 12 contra a elite (80) e 2 contra a faixa 65 (P45/Q45 = 0,3 e P55/Q45 = 2,5). Contra a elite, **só combinações com parceiro 90 e jogador ≥ 65 passam de 25%**. No início real, jogador ≤ 30 com parceiro ≤ 15 contra intermediário vence 0–0,3%.

---

## 4. Sensibilidade

| Medida (células não saturadas) | Valor |
|---|---|
| +10 OVR no **jogador** (média das diferenças) | intermediário +8,6 pp · faixa 65 +15,9 pp · elite +6,4 pp |
| +15 OVR no **parceiro** (média) | intermediário +11,4 pp · faixa 65 +25,1 pp · elite +8,4 pp |
| Por ponto de OVR | ≈ +0,8 a +1,7 pp de vitória por ponto de OVR de jogador ou de parceiro na zona central → **mesmo peso por ponto** |
| Regressão do % de pontos ganhos (64 células, resíduo σ = 1,0) | `46,9 + 0,313·jogador + 0,297·parceiro − 0,569·adversário` |
| Mesma média de dupla (60) vs 48 (`controls`) | P45/Q75 93,0 · P75/Q45 91,3 · P60/Q60 91,3 · P55/Q65 94,3 · P65/Q55 92,8 (todas dentro do ruído) |
| 50% de vitória | aproximadamente quando a média da dupla ≈ média dos adversários + 1 a 2 |
| Inclinação | ~10 pontos de diferença de média ≈ 30–40 pp de vitória na zona central |

**Observado:** a diferença jogador × parceiro é só de **disponibilidade** — o parceiro pode valer 90, o jogador não tem esse alcance aos 16–18 anos. Como o peso por ponto é igual, 10 pontos de parceiro valem 10 pontos de jogador; o parceiro só 'vale mais' porque pode ser 40 pontos maior.

---

## 5. Controles

Tabelas completas em `data/controls-n400.json` e `data/realistic-attributes-n400.json`.

| Controle | Resultado | Leitura |
|---|---|---|
| Espelho (55/55 contra 55/55) | 52,0% ± 4,9 | Sem viés de lado/ordem |
| Lado do jogador (esq. × dir.) | idênticos (84,3 / 84,3 e 3,3 / 3,3) | Lado não altera o resultado neste ajuste (preferência de lado não testada além disso) |
| Energia do jogador 100 → 90 → 75 → 60 (P55/Q60 vs 48) | 84,3 → 83,0 → 82,0 → 78,0 | Energia de campanha típica (75–91) custa **1–3 pp**; efeito pequeno |
| Bônus de contexto (`_chemistryBonus` 5, `_coachMatchBonus` 3, `_partnerBondBonus` 2,5) | 84,3 → 84,3 (idêntico, mesmos pontos e games) | **Observado: sem efeito quando o jogador tem atributos.** Química, treinador e vínculo não alteram a partida |
| Espalhamento dos adversários (48/48 × 38/58) | 84,3 × 86,8 | Só a média importa (ruído) |
| Atributos desiguais, média 55, vs 35 / vs 48 | plano 99,5 / 84,3 · desigual 98,8 / **72,8** | Atributos desiguais custam ~11 pp perto de 50% |
| Atributos desiguais, média 65, vs 48 | plano 97,8 · desigual 98,0 | Sem penalidade nesse perfil (mais equilibrado) |

### Atributos reais da 6D (snapshots semanais) — `data/realistic-attributes-n400.json`

| Perfil / dia | Média atrib. (mín–máx) | Parceiro | Real vs 35 | Plano vs 35 | Real vs 48 | Plano vs 48 |
|---|---|---|---|---|---|---|
| normal d90 | 30,5 (21–48) | 15 | 9,3 | 10,3 | 0,3 | 0,3 |
| normal d180 | 36,5 (22–61) | 34 | 40,0 | 53,0 | 4,8 | 6,5 |
| normal d270 | 40,9 (23–69) | 35 | 44,8 | 60,0 | 7,5 | 13,8 |
| normal d360 | 45,4 (26–76) | 36 | 57,5 | 68,3 | 9,8 | 18,5 |
| normal d540 | 52,4 (28–86) | 38 | 74,3 | 83,0 | 23,8 | 35,5 |
| otimizador d180 | 36,7 | 53 | 86,5 | 84,8 | 40,0 | 34,0 |
| otimizador d360 | 46,9 | 52 | 96,3 | 93,3 | 60,0 | 55,0 |
| otimizador d540 | 54,4 | 50 | 98,8 | 96,3 | 74,5 | 67,0 |

**Observado:** o perfil do normal tem atributos muito desiguais (mín 21–28, máx 48–86) e perde **10–15 pp** frente ao jogador plano de mesma média; o do otimizador é mais equilibrado e não perde. **Hipótese:** o harness "normal" concentra treino em poucos atributos. Um jogador humano pode ou não repetir isso.

### Calibração contra as partidas reais (`data/calibration-vs-6d-nc40.json`)

| Execução | Vitórias observadas | Esperadas (motor, atributos planos) |
|---|---|---|
| 6D normal | 2 | 8,3 (Bronze 1 contra 6,1; Silver 1 contra 2,1) |
| 6D otimizador | 36 | 40,5 |
| baseline normal | 20 | 27,5 |
| baseline otimizador | 73 | 79,6 |

**Observado:** o motor prevê as vitórias observadas dentro de ~10% (otimizador) e com viés para cima de 6–27 nos normais, coerente com a penalidade de atributos desiguais (acima) e energia. **Conclusão:** os resultados da 6D são explicados pelo **motor + composição das duplas + faixa de campo**, sem comportamento anômalo.

---

## 6. Torneios iniciais e progressão (Etapa 4)

Fontes: `src/gameplay/worldTour/EntryManager.js`, `src/lib/circuitCatalog.js`, 4 CSVs de partidas da 6D. Nada foi modificado.

**Elegibilidade (código):**

| Tier | `minRanking` | Chave | Observação |
|---|---|---|---|
| Bronze, Silver | 0 | 16 | abertos; `minLevel: 'Iniciante'` (descritivo; sem uso em lógica de inscrição encontrado) |
| Gold | 450 | 24 | qualifying até rank 900 (`max(2×450, 450+80)`) |
| Platinum | 320 | 32 | qualifying até rank 640 |
| Circuit Finals / Masters / Elite / Crown / Legacy Finals | 8 / 230 / 140 / 75 / 16 | 8–24 | acima do alcance inicial |

- **Teto da base:** `directLimit === 0 && hasRanking && rank <= OPEN_TIER_CEILING (400)` ⇒ **inelegível** em Bronze/Silver (`overqualified`). Quem nunca teve ranking entra em Silver livremente.
- Não existe checagem de **força** da dupla na inscrição (já apontado na 6A).

**Força dos adversários (partidas reais 6D, `oppStrength`):**

| Tier | Mediana | Faixa (min–max) | Observação |
|---|---|---|---|
| Bronze | 35 | 32–41 | iniciante |
| Silver | 47–51 | 39–58 | intermediário |
| Gold | 74–78 | 38–84 | maioria 71+; ~9 de 31 campos do otimizador 6D abaixo de 60 |
| Platinum | 78–81 | 65–87 | |
| Masters | 80–81 | 77–87 | |

**Observado:** **não há campo de força 55–70**. Gold e Platinum jogados pelo normal 6D: 0 de 38 partidas abaixo de 60.

**Primeiras vitórias possíveis?** Sim, em Bronze: o normal 6D venceu em 20/08/2026 (OVR 39, parceiro 35) e o otimizador em 19/02/2026 (OVR 25, parceiro 37). 6D normal: 2 vitórias em 70 partidas (1º ano, só Bronze/Silver: 2 em 28); o motor com atributos planos esperaria 8,3 em 70.

**Observado (principal):** teto e queda

| Execução | Última partida Bronze/Silver | Partidas antes (vitórias) | Partidas depois (vitórias) | Δ médio depois | Média da dupla depois |
|---|---|---|---|---|---|
| 6D normal | 08/04/2027 | 38 (2) | 32 (**0**) | −30,9 | 46,7 |
| 6D otimizador | 08/04/2027 | 66 (35) | 44 (**1**) | −23,1 | 55,0 |
| baseline normal | 19/11/2026 | 49 (20) | 39 (**0**) | −20,5 | 58,9 |
| baseline otimizador | 11/04/2027 | 76 (51) | 60 (22) | −0,1 | 80,2 |

O único perfil que continuou vencendo foi o da baseline otimizador, com média de dupla ~80 (parceiro 81 contratado no dia 225). **Dependência de parceiro forte para progredir: observada** — os perfis com parceiro ≤ 50 não venceram nada depois do fim da base.

---

## 7. Análise (Etapa 5)

1. **OVR 45 vence iniciantes?** **Sim.** 87,5% (parceiro 45), 97,3% (60), ≥99,5% (75+). Contra intermediários: 31,5% / 64,8% / 93,0%.
2. **Melhora com OVR 55 e 65?** Contra intermediários, com parceiro 45: 31,5 → 55,8 → 82,5%; com parceiro 60: 64,8 → 84,3 → 97,8%. Contra a faixa 65 com parceiro 60: 6,3 → 13,8 → 32,0%. Contra elite não muda de forma útil sem parceiro 75–90.
3. **Influência do parceiro:** mesmo peso por ponto de OVR que o jogador (§4), mas com amplitude maior: de 45 a 90 o parceiro eleva a vitória contra intermediários, para o jogador 45, de 31,5% a 98,3%.
4. **Curva de atributos ou composição das duplas?** **Observado:** o motor explica a 6D com a média da dupla; a 6B/6C reduz o OVR, mas as derrotas decisivas ocorrem depois do teto da base, com média da dupla 20–30 pontos abaixo do campo. **Hipótese:** a composição (parceiro ≤ 50 por ~640 dias, 6D otimizador) e a estrutura de campos explicam mais que a curva. Não foi testada uma curva alternativa.
5. **Torneios adequados para recém-criados?** **Sim**, Bronze/Silver (abertos, campos 35/48); o jogador com OVR 22 e parceiro ≥ 35 já tem 24–72% em Bronze.
6. **Barreiras artificiais?** **Indícios, não prova:** (a) teto de rank 400 na base, sem degrau intermediário; (b) campos bimodais; (c) sem aviso de risco; (d) atributos desiguais penalizam 10–15 pp (por escolha de treino, não do sistema); (e) bônus de química/treinador/vínculo sem efeito na partida enquanto o jogador tem atributos — pode ser **barreira invisível** (a UI promete bônus que o motor não aplica; requer confirmação).
7. **Ajustes mais seguros:** §8.

---

## 8. Limitações

- Atributos **planos** para parceiro e adversários (o mundo real usa só `overall_rating`, então é fiel); o jogador usa planos na matriz e atributos reais só em 8 snapshots.
- **Energia, moral e fadiga** de campanha foram testadas só em um cenário (P55/Q60 vs 48). Fadiga de torneio entre rodadas e jogos consecutivos não foi simulada.
- Faixas de adversário vêm de **uma semente por perfil** da 6D (≈ 400 partidas); a distribuição real pode ser diferente em outras sementes.
- A atribuição do fim da base ao teto de rank 400 é **correlação temporal** em 4 execuções (n = 1 semente), não experimento.
- O harness de torneios (política `best-eligible`/`best-fit`) escolhe tiers sem olhar a força; humanos podem evitar Gold.
- Química, treinador e vínculo: sem efeito na partida **no motor**; o efeito pode existir em outras camadas (`getChemistryBonus`, energia, reputação) que não foram avaliadas aqui.
- Calibração usa atributos planos e tem viés para cima nos perfis desiguais.
- Experiência, superfície e dificuldade: não alteram a probabilidade do ponto no código lido; **não** houve teste experimental separado.
- Não foram simuladas temporadas completas nem ranking.

## 9. Recomendações priorizadas (decisão humana; nada aplicado)

1. **P0 — Aviso de risco na inscrição** quando a média da dupla estiver > ~15 pontos abaixo da média do campo (calibração pela matriz do §3: Δ ≈ −3 → ~30%; Δ ≈ −12 → ~6%; Δ ≤ −20 → ~0%). Baixo risco, não altera regras de elegibilidade nem saves.
2. **P0 — Investigar o teto `OPEN_TIER_CEILING = 400`** e/ou criar um degrau entre Silver e Gold (campo ~60–65). Medir primeiro: quantas duplas reais ficam entre OVR 55 e 70 no mundo. Este é o ajuste de maior efeito esperado e de maior risco de regressão (calendário, ranking e parâmetros de Gold).
3. **P1 — Confirmar o efeito de química/treinador/vínculo** (§5): se a UI anuncia bônus, o motor não os usa. Corrigir é mudança de balanceamento (aprovação).
4. **P1 — Parceiro inicial:** garantir que a primeira oferta/Busca tenha OVR ≥ 35–40 para jogadores sem ranking (com OVR 15, mesmo contra Bronze a vitória é 7–11%).
5. **P2 — Treino sugerido** que evite atributos < 30 (penalidade de 10–15 pp medida no perfil do normal).
6. **P3 — Suavizar a curva** (`scale 0,56→0,62` ou `floor`, conforme a 6B) **somente depois** de 1–4 e de replicação com mais sementes: o motor mostra que o OVR 45 já vence iniciantes.

## 10. Possível escopo da CLOUD-6F

- Medir, no mundo semeado, a distribuição real de OVR/rank dos atletas e a de pares por tier (para definir um degrau intermediário).
- Verificar se `getChemistryBonus`/coach/bond chegam ao motor por outro caminho que não `overall`.
- Experimento controlado de elegibilidade: simular a carreira inicial com `OPEN_TIER_CEILING` 400 contra 250 e 600 (somente em harness, com a mesma semente), medir vitórias, rank e moedas ao fim do 2º ano.
- 3–5 sementes por perfil; política de parceiro fixa (mesmo parceiro nos dois lados).
- Protótipo de aviso de risco na UI (sem alterar regras).

## 11. Arquivos modificados

| Arquivo | Tipo |
|---|---|
| `reports/cloud-phase-6e-competitive-balance-isolation/CLOUD_PHASE_6E_REPORT.md` | novo |
| `scripts/audit-cloud6e-balance.mjs` | novo (somente leitura; importa o motor e lê os CSVs da 6D) |
| `reports/cloud-phase-6e-competitive-balance-isolation/data/main-matrix-n400.json` | novo |
| `.../data/career-start-n400.json`, `controls-n400.json`, `realistic-attributes-n400.json`, `calibration-vs-6d-nc40.json` | novos |

Nenhum arquivo em `src/`, `package.json` ou `base44/` foi alterado.

**Reprodução** (≈ 11 min por bloco em uma máquina de 4 núcleos):
```
node scripts/audit-cloud6e-balance.mjs --n=400 --only=main     --out=<dir>
node scripts/audit-cloud6e-balance.mjs --n=400 --only=start    --out=<dir>
node scripts/audit-cloud6e-balance.mjs --n=400 --only=controls --out=<dir>
node scripts/audit-cloud6e-balance.mjs --n=400 --only=realistic --out=<dir>
node scripts/audit-cloud6e-balance.mjs --only=calibration      --out=<dir>
```

## 12. Restrições respeitadas

Sem alteração de produção, balanceamento, schema de saves, versão, contratos de IA, economia, fadiga ou preset. Sem merge, rebase, PR ou push. Nenhuma outra fase iniciada.

## 13. Commit final

Ver `git log -1` na branch `cloud/phase-6e-competitive-balance-isolation` (local, sem push).
