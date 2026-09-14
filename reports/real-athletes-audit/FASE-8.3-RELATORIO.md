# Fase 8.3 — Composição de força: por que os bots não competem em Gold/Platinum/Masters

> **COMPLETA — diagnóstico e proposta, nada implementado**, conforme pedido.
> A hipótese da Fase 8.2 §3.4 está **confirmada**: a dominância real não é
> calendário nem seleção (já refutado na Fase 8.2) — é que os CAMPOS de
> Gold/Platinum/Masters/Elite/Crown são estruturalmente mais fracos do que
> os reais que os disputam, porque os bots nascem com um teto de OVR baixo
> (~85 no máximo, por construção da fórmula de ranking) e um teto de
> crescimento (`potential`) estreito demais pra fechar essa distância numa
> carreira simulada. O cap de evolução da Fase 1.5 **não regrediu** — está
> corrigido e cobre toda a população. A correção óbvia (alargar o
> `potential` inicial pra bater com a fórmula já usada em `generateProspects`)
> foi medida numa simulação de 5 temporadas: reduz o gap médio de OVR
> parcialmente nas primeiras temporadas, mas **estabiliza (plateau) já na
> T3-T4** com um gap residual de 13-20 pontos — e, mais importante, **o
> risco inverso se confirma**: bots passam a vencer títulos em Elite,
> Masters e Crown, tiers onde nunca venciam nenhum na produção atual (0/50,
> 0/50, 0/20 ao longo de 5 temporadas). Nenhuma correção é recomendada só
> com base nesta medição pontual — ver §4.

## 1 — Distribuição de OVR por tier: campo efetivo, reais vs. bots

### 1.1 — Metodologia

Instrumentação temporária (revertida) capturou, para CADA torneio resolvido
pela IA mundial, o `overall_rating` de TODOS os atletas do campo efetivo
(não só o campeão), separados real/bot pela convenção de id (`real_*`).
Medido em duas rodadas:

- **Baseline** (`f83-baseline-clean`): fórmula de produção, sem alteração,
  1 temporada — dá o retrato ATUAL do jogo.
- **Proposta testada** (`f83-wide-potential`): mesma seed/população, com
  `potential` inicial alargado (§3), 5 temporadas — mede a evolução do gap
  ao longo de uma carreira simulada.

Mesma seed (`official-900-100-s1`) nas duas, garantindo que a T1 de ambas
seja comparável (a mudança testada só afeta crescimento futuro, não o
`overall_rating` de geração).

### 1.2 — T1 (2026), produção atual — o retrato de hoje

| Tier | Reais (n / méd / máx) | Bots (n / méd / máx) | Gap médio |
|---|---|---|---|
| Gold | 218 / 84,5 / 97 | 166 / 60,0 / 90 | **24,5** |
| Platinum | 242 / 84,1 / 97 | 142 / 67,9 / 90 | **16,2** |
| Masters | 344 / 85,4 / 97 | 136 / 72,3 / 89 | **13,1** |
| Elite | 303 / 86,2 / 97 | 97 / 76,9 / 90 | **9,3** |
| Crown | 138 / 86,1 / 97 | 22 / 75,8 / 85 | **10,3** |
| Silver | 2 / 80,0 / 82 | 510 / 61,5 / 90 | 18,5 |
| Bronze | 1 / 82,0 / 82 | 767 / 60,4 / 89 | 21,6 |

**Resposta direta ao pedido (bot mais forte em Platinum/Masters vs. OVR
real)**: já na T1, o bot mais forte de Platinum tem 90 e o de Masters tem
89 — próximo do teto absoluto de geração de bot (~90-91, ver §2), mas ainda
7-8 pontos abaixo do teto real (97). **O gap não está no topo do campo — um
outlier de bot já chega perto do nível real desde o início.** Está na
MÉDIA: o bot típico de Gold está 24,5 pontos abaixo do real típico, e
mesmo em Elite/Crown (onde o gap é menor) ainda sobra ~9-10 pontos —
suficiente pra que qualquer confronto real-vs-bot tenha um viés estrutural
grande a favor do real, tornando os tiers médios/altos um "passeio"
exatamente como o pedido descreveu.

## 2 — Confirmação do cap da Fase 1.5 + causa estrutural composta

### 2.1 — O cap está corrigido, não regrediu

```js
// src/lib/athleteBehavior.js:233
const EVOLUTION_POPULATION_CAP = WORLD_RANKING_TARGET + 50; // = 1050
```

Cobre TODA a população de 1000 atletas (100 reais + até 900 bots) — o
achado original da Fase 1.5 (`list('-overall_rating', 200)`, ~794/994
atletas nunca evoluindo) está corrigido desde a "Fase 2E.1" e permanece
correto na produção atual. **Não é regressão.**

### 2.2 — Mas existe uma causa estrutural diferente, nunca revisitada: o teto de geração

`src/lib/rankingPopulation.js:147`:

```js
const overall = Math.max(35, Math.min(96, Math.round(
  96 - Math.pow(absoluteRank / WORLD_RANKING_TARGET, 0.72) * 57
)));
```

`absoluteRank` é calculado como `existingAthletes.length + i + 1`
(`rankingPopulation.js:141`) — como os 100 reais SEMPRE existem primeiro no
elenco, **o primeiro bot nasce, por construção, no rank absoluto 101**, e:

```
overall(rank=100, último real coberto pela curva) = 85
overall(rank=101, primeiro bot)                   = 85
overall(rank=1)                                    = 96
```

Ou seja: **nenhum bot pode nascer com OVR acima de ~85** — não porque
exista uma regra explícita reservando OVR alto pros reais, mas porque a
MESMA curva contínua que atribui OVR por posição no ranking mundial
simplesmente nunca é avaliada abaixo do rank 101 pra um bot (os 100
primeiros pontos da curva, os únicos acima de 85, são estruturalmente
ocupados pelos reais). É um efeito colateral do offset `absoluteRank`, não
uma reserva deliberada.

Isso sozinho já explicaria um teto na GERAÇÃO — mas o campo observado no
§1.2 mostra bots até OVR 90, ACIMA desse teto de 85. Isso só é possível por
CRESCIMENTO pós-geração (`evolveAthletesMonthly`), que é limitado pelo
`potential` de cada bot:

```js
// src/lib/rankingPopulation.js:172 (formato atual, população inicial)
potential: Math.min(99, overall + 2 + (seed % 10)), // teto de +2 a +11
```

Contra a faixa MUITO mais larga já usada para prospects de reposição
(`src/game-core/worldSimulationLifecycle.js:254`):

```js
const potential = integer(seed, Math.max(70, overall + 8), 96); // teto de +8 até 96
```

**Os bots iniciais (a maioria do elenco, gerados uma única vez no início do
mundo) têm uma margem de crescimento de só 2 a 11 pontos — 3 a 5 vezes
menor que os prospects gerados depois pra substituir aposentados.** Isso
não parece intencional: nenhum comentário ou histórico de achado justifica
a discrepância como decisão de design (reservar OVR alto pros reais); tudo
indica que é um efeito colateral não revisitado de duas fórmulas escritas
em momentos diferentes do projeto, sem harmonização.

**Confirmação**: item 2 do pedido — SIM, é uma causa relacionada mas
DIFERENTE da Fase 1.5. O cap populacional (quem evolui) está corrigido; o
teto de geração + margem de crescimento estreita (quanto cada bot PODE
evoluir) é uma limitação estrutural separada, não revisitada até agora, e
não intencional.

## 3 — Proposta testada: alargar o `potential` inicial — efeito parcial, risco inverso confirmado

### 3.1 — O que foi medido

Reaproveitando a MESMA faixa já usada em `generateProspects` (nenhuma
fórmula nova): `potential = min(96, max(70, overall+8, overall+(seed%20)))`
aplicada aos bots da população INICIAL (não só aos prospects de
reposição). Medição de 5 temporadas completas, mesma seed/população da
Fase 8 (`official-900-100-s1`, 900 bots), comparada linha a linha contra o
regime-check de produção da própria Fase 8 (`f8-regime-check`, mesma seed,
mesmas 5 temporadas, fórmula não alterada).

### 3.2 — Efeito no gap médio de OVR: fecha parcialmente, depois estabiliza

| Tier | T1 gap | T2 gap | T3 gap | T4 gap | T5 gap |
|---|---|---|---|---|---|
| Gold | 23,8 | 23,0 | 18,7 | 19,7 | **15,5** |
| Platinum | 15,2 | 22,5 | 18,6 | 18,5 | **14,5** |
| Masters | 12,6 | 20,6 | 16,5 | 14,9 | **14,5** |
| Elite | 9,2 | 16,4 | 15,2 | 14,1 | **13,5** |
| Crown | 7,6 | 19,1 | 14,3 | 13,2 | **12,5** |

(T1 já difere levemente do baseline limpo do §1.2 porque o `potential`
alargado já influencia o primeiro ano de evolução mensal simulada; a
diferença é pequena, como esperado.)

O gap médio cai de fato entre T1/T2 e T5 em quase todos os tiers, mas
**para de cair — ou até oscila pra cima — entre T3 e T4** antes de
recuperar levemente na T5 (ex.: Gold 18,7→19,7→15,5). O bot MÁXIMO de cada
tier sobe rápido e consistentemente (Platinum e Masters chegam a OVR 96 —
o teto absoluto do jogo — já na T3), mas a MÉDIA do campo não acompanha:
a maioria dos bots continua muito atrás mesmo com mais margem de
crescimento disponível. **A causa provável**: alargar só o `potential`
ataca o SEGUNDO fator do problema (crescimento), mas não o PRIMEIRO (o
teto de ~85 na geração, §2.2) — um bot com potential=96 mas overall
inicial=45 ainda precisa de anos de evolução mensal (±1 ponto,
probabilística) pra se aproximar do teto, e a maior parte da população
gerada nasce com overall bem abaixo de 85.

### 3.3 — Risco inverso: CONFIRMADO — bots passam a vencer no topo

Comparação cumulativa de títulos ao longo das mesmas 5 temporadas,
produção atual vs. proposta testada:

| Tier | Produção — títulos 100% bots (5 temporadas) | Proposta — títulos 100% bots (5 temporadas) |
|---|---|---|
| Elite (50 títulos) | **0** | **4** (8%) |
| Masters (50 títulos) | **0** | **3** (6%) |
| Crown (20 títulos) | **0** | **1** (5%) |
| Platinum (30 títulos) | 4 (13,3%) | **7 (23,3%)** |
| Gold (40 títulos) | 4 (10%) | 4 (10%) |

Em Elite, Masters e Crown — os três tiers onde a produção atual **nunca**
deixa um bot vencer em 5 temporadas inteiras simuladas (0/50, 0/50, 0/20)
— a proposta introduz vitórias de bot em TODOS os três. Platinum quase
dobra sua taxa de dominância de bot (13,3%→23,3%). Isso é precisamente o
"risco inverso" que o pedido pediu para verificar: **o efeito colateral já
aparece de forma mensurável antes mesmo do gap médio terminar de fechar**,
o que sugere que a proposta, se implementada como está, tende a piorar
(não resolver) o equilíbrio que a Fase 5/5.6 já validou como correto no
topo.

Presença de reais no Top 20 (produção vs. proposta, mesmas 5 temporadas):
20/18/17/12/14 vs. 20/18/13/12/13 — leve queda adicional na T3 (17→13),
convergindo de volta na T4-T5. Não é um colapso, mas está na mesma direção
do achado de títulos: o topo fica mensuravelmente mais disputado por bots,
não mais fácil pros reais.

### 3.4 — Por que nenhuma correção é recomendada ainda

A proposta testada (alargar só `potential`) é insuficiente sozinha (gap
residual de 13-20 pontos mesmo depois de 5 temporadas) E já mostra o
risco inverso se manifestando (§3.3) antes de resolver o problema
original. Implementá-la como está trocaria "tiers médios fáceis demais
pro real" por "topo ocasionalmente vencido por bot" sem necessariamente
consertar o meio — a pior combinação possível dado o objetivo declarado
("bots competitivos o suficiente pros tiers intermediários, não bots
dominando").

**O que uma correção completa provavelmente precisaria** (não medido,
proposta pra próxima fase, não implementar agora):
- Revisitar o teto de GERAÇÃO (§2.2), não só o de crescimento — por
  exemplo, gerar uma fração dos bots iniciais com `absoluteRank` amostrado
  de uma faixa mais alta (sem realocar os reais), ou recalibrar a curva
  pra não depender do offset de 100 posições reais.
- Se o `potential` for alargado, fazer isso ATRELADO a uma faixa de tier
  (por exemplo, só para bots cujo rank de geração já cai historicamente em
  Gold-Masters), não pra população inteira de uma vez — reduzindo a chance
  de um outlier alargado acabar competindo (e vencendo) em Elite/Crown.
- Qualquer nova rodada precisa medir os DOIS lados simultaneamente (gap
  médio E títulos de bot no topo) desde a primeira medição pontual, não
  só depois — a Fase 8.3 só percebeu o risco inverso porque mediu os dois
  juntos.

## 4 — Validação

- Nenhum código de produção alterado. Instrumentação temporária em 3
  arquivos (`WorldTourLifecycle.js`: snapshot de OVR de campo por tier;
  `rankingPopulation.js`: `DIAG_WIDE_POTENTIAL`; `audit-real-athletes-simulation.mjs`:
  import/impressão do snapshot) revertida antes do commit — `git diff`
  dos três arquivos fica vazio contra o commit da Fase 8.2.
- `npm run lint` — limpo.
- `npm run build` — limpo.
- `node scripts/rc-qa-suite-v36.mjs` — mesmas 3 falhas pré-existentes
  (`test:rc-gameplay-balance`, `test:career-pace`, `test:ui-quality`), sem
  regressão nova.
- Scratch descartado: `resume-state.json` (43MB, `f83-wide-potential`) e os
  `run.log` verbosos (ignorados por `*.log` no `.gitignore`, então nunca
  seriam commitados de qualquer forma); mantidos `summary.json`/
  `tournament-results.csv`/`season-tier-table.md` em
  `reports/real-athletes-audit/{f83-field-ovr,f83-wide-potential,f83-baseline-clean}/`
  como evidência das tabelas acima. Como a distribuição de OVR de campo por
  tier (`[DIAG_FIELD_OVR]`) não é persistida em `summary.json` e só existia
  no `run.log` (gitignorado), as linhas relevantes de `f83-baseline-clean`
  e `f83-wide-potential` foram copiadas para
  `field-ovr-diagnostic-output.md` em cada diretório, preservando a fonte
  bruta das tabelas do §1.2 e §3.2/§3.3.
- `reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/*.json` revertidos via `git checkout --`
  (regenerados pela suíte, sem relação com o escopo desta fase).
- `src-tauri/` — sem alterações.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Distribuição de OVR por tier, reais vs. bots, gap do bot mais forte | ✅ medido — gap médio de 9 a 25 pontos dependendo do tier; bot mais forte de Platinum/Masters já chega a 89-90 (perto do teto de geração, ~7-8 abaixo do teto real) desde a T1 |
| 2 | Cap da Fase 1.5: regrediu? | ✅ NÃO regrediu — `EVOLUTION_POPULATION_CAP=1050` cobre toda a população; causa real é DIFERENTE — teto de geração (~85, efeito colateral do offset `absoluteRank`) + margem de crescimento (`potential`) 3-5× mais estreita que a usada em prospects de reposição, não intencional |
| 3 | Proposta de correção com efeito estimado | ⚠️ alargar `potential` inicial testado (5 temporadas): fecha o gap parcialmente, mas estabiliza em 13-20 pontos residuais, E confirma o risco inverso — bots passam a vencer títulos em Elite/Masters/Crown (0 casos na produção atual, 4/3/1 na proposta) e quase dobram a dominância em Platinum. **Nenhuma correção recomendada com base só nesta medição** — precisa atacar também o teto de geração, e medir os dois lados (gap + títulos de topo) juntos desde o início. |

**Aguardo decisão de design antes de qualquer implementação em escala**,
conforme pedido.
