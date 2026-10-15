# Rebalance competitivo e econômico — Playthrough 5.27

**TUNING IS ALLOWED · MEASURE → CHANGE → SIMULATE → COMPARE → ADJUST.**
A arquitetura da 5.26-D é protegida: real world pairs, TeamRanking, committed
roster, draw snapshots, admission authority (fórmula), bracket graph, BYEs e
upset snapshots **não foram revertidos**. Baselines `reports/progression-*` e
`reports/tournament-world-parity-526d/` intactas.

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado).
Sem commit, sem push.

## Escopo de simulação (transparência)

O plano completo pede 45 curtas × 3 presets, 45×5 anos no Balanced e long runs
de 10 anos. O runtime desta sessão permitiu **validação reduzida**:
- **5.26-D baseline**: 15 carreiras × 2 anos (referência).
- **Balanced**: 3 perfis × 1 seed × 2 anos (normal/casual/otimizador) + check
  de 120 dias.
- **Conservative / Hardcore**: implementados em `src/lib/balance527.js`, **não
  simulados em carreira completa**.
- Sem 45×5 anos, sem long runs de 10 anos.

Esta é a maior ressalva da fase e a razão principal do veredito.

## Mudanças implementadas

Competição (sem tocar no motor de partida nem no bracket):
- `WorldTourLifecycle.fieldAdmissionScore` — autoridade ÚNICA de admissão
  compartilhada por IA e jogador. Nos tiers abertos (Bronze/Silver,
  `minRanking===0`) a ordem é **fraco-primeiro** (sinal negado), com banda
  Bronze < Silver; tiers com corte mantêm `blendedCutScore`.
- Paridade com `chooseTournament`: o field do jogador só admite a dupla que,
  realisticamente, **escolheria** o torneio na semana (concorrendo com os
  eventos da mesma janela). Ordem: world availability → tournament preference →
  admission → draw.

Economia (centralizada em `src/lib/balance527.js`, presets Conservative/
Balanced/Hardcore; default Balanced):
- `startingCoins` 900; `initialAttributeMultiplier` 1.8 (build inicial).
- `prizeMultiplier` 3.0 (prêmio volta a importar).
- `sponsor.monthlyMultiplier` 0.25 / `signMultiplier` 0.24 + prova mínima
  (`hasSponsorProof`: 1 torneio disputado).
- `staffMultiplier` 1.25; `shopPriceMultiplier` 1.2; `investmentRateMultiplier`
  0.23 (CDB 3,5% → ~0,8%/mês), aplicado a todos os investimentos.

## 1–8. Causa auditada

1. **Easy 7,9%**: o field dos tiers abertos era o **topo elegível** (blendedCutScore
   ordena por força). Bronze/Silver chegavam com OVR 58/76,5 contra 33/35,5 do
   jogador, que começa em OVR 12.
2. **Field OVR 5.26-D**: Bronze 58 · Silver 76,5 · Gold 77 · Platinum 79,5 ·
   Masters 80 · Elite 80,3.
3. **Elite em low tier**: sim (elegível, sem preferência de escolha).
4. **chooseTournament**: não influenciava o field do jogador (dívida 5.26-D).
5. **Mudou**: fraco-primeiro nos tiers abertos + paridade de preferência.
6. **Admission formula**: preservada; só o sinal nos tiers abertos.
7. **Bracket**: inalterado (24/8 do Masters, BYEs, grafo).
8. **Match formula**: inalterada.

## 9–21. Competição medida (Balanced × 5.26-D)

| Métrica | 5.26-D | Balanced |
|---|---|---|
| Easy WR | 7,9% | **19%** (n=102) |
| Medium WR | 22,2% | **21%** (n=95) |
| Hard WR | 15,6% | **38%** (n=16) |
| Bronze | 10,2 | 21 (n=62) |
| Silver | 4,3 | 15 (n=40) |
| Gold | 21,5 | 22 (n=46) |
| Platinum | 23,5 | 20 (n=49) |
| Masters | 11,5 | 43 (n=14) |
| Elite | 33,3 | 0 (n=2) |
| Crown | — | — |
| R1 | 10,8% | 15% (n=151) |
| R2 | 22,4% | 36% |
| QF | 31,8% | 62% |
| SF | 16,7% | 80% (n=5) |
| F | 0% | 50% (n=4) |

## 22–28. Progressão de ranking (Balanced)

| Perfil | @1y | @2y |
|---|---|---|
| casual | — | #118 |
| normal | #465 | #158 |
| otimizador | — | **#33** |

Normal 6m #753 → 1y #465 → 2y #158: **dentro do alvo @2y (#150–300)**. Top100
atingível (otimizador #33); Top50 ainda não rotina; Top10/#1 exigem 3+ anos
(não rodado).

## 29–30. Títulos

Balanced: casual 0 · normal 0 · otimizador **2**. Alvo Year1 0–1 / Year2 1–3:
o otimizador bate; o normal fica abaixo (0) — o ano 1 ainda é duro.

## 31–46. Economia

| Item | 5.26 / 5.26-D | Balanced |
|---|---|---|
| 1º sponsor | dia 0 | após 1 torneio |
| Valor Bronze | ~1.500/mês + ~1.875 | ×0,25 (~375 + ~450) |
| Sponsor share | 86–88% | **39–61%** (casual 52 · normal 61 · otim 39) |
| Prize share | 2–3% | **17–35%** |
| Staff | ×1,25 | medido em `staff.csv` |
| CDB | 3,5%/mês (~51% a.a.) | ×0,23 ≈ **0,8%/mês** |
| Outros investimentos | 2–15%/mês | ×0,23 (0,46–3,45%/mês) |
| Shop | — | preço ×1,2 |
| Fans/reputation | — | não alterados |

## 47. Severance trap

Não implementado nesta passada (declarado para a 5.28). `startingCoins` 900 +
sponsor após 1 torneio reduzem a chance de o jogador ficar sem caixa para
cortar custos; **casual ainda ficou insolvente** em algum ponto (ver §51).

## 48–53. Money-solved / insolvência

48–50. **Money-solved**: as carreiras terminaram com 678 / 2.006 / 3.024 moedas
— não "resolvido" cedo (compatível com o alvo ~mês 30–36), mas sem registro
explícito do ponto.
51. **Casual insolvente: sim** (hard gate é sobre o normal, mas casual deveria
    continuar jogável; jogou 46 partidas e terminou com 678 moedas).
52. **Normal insolvente: não.**
53. **Otimizador insolvente: não.**

## 54–57. Presets

54. **Conservative**: implementado, **não simulado** (`conservative.json`).
55. **Balanced**: simulado (3×1×2) — `balanced.json`.
56. **Hardcore**: implementado, **não simulado** (`hardcore.json`).
57. **Escolhido:** **Balanced** como default — melhor coerência medida
    (field fraco-primeiro, sponsor 39–61%, prize 17–35%, rank @2y no alvo),
    condicionado à validação completa 45×5 anos.

## 58. Bugs/pendências

- **Hard gates competitivos ainda falham**: Easy 19% (<40), Medium 21% (<30),
  R1 15% (<35). O ano 1 continua difícil: o jogador (OVR inicial ~22) só
  alcança a dupla mais fraca do mundo (~40) após meses; a curva R1 só destrava
  quando o rank/seeding melhora.
- **Normal sem título em 2 anos** (alvo Year2 1–3).
- **Casual insolvente em algum ponto.**
- **Validação muito abaixo do pedido** (3 carreiras vs 45; sem presets
  alternativos; sem long runs).
- **Severance trap** não resolvido.

## 59. Testes / lint / build / diff-check / commit / push

12 testes de integridade 5.26-D: **12/12**. `npm run lint` verde.
`npm run build` verde. `git diff --check` limpo. Sem commit, sem push.

## 60. VEREDITO

**B.** O rebalanceamento é real e centralizado, sem reverter a arquitetura
(integridade 12/12, fallback 0, OVR mismatch 0), e moveu o jogo na direção
certa: **prize share de 2–3% para 17–35%**, **sponsor share de 86–88% para
39–61%**, **CDB de ~51% para ~0,8%/mês**, **rank @2y do normal para #158
(alvo) e do otimizador para #33**, Hard WR dentro da faixa (38%) e títulos no
otimizador (2). Mas **não é A**: três hard gates competitivos continuam
falhando (Easy 19%, Medium 21%, R1 15%), o normal não titulou em 2 anos, o
casual ficou insolvente, e — sobretudo — a validação ficou muito abaixo do
pedido (3 carreiras × 2 anos; sem Conservative/Hardcore, sem 45×5, sem long
runs). Próximo passo (5.28): subir a competitividade do ano 1 (start/curva de
treino/banda de base), validar os 3 presets na matriz completa e resolver o
severance trap.
