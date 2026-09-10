# Fase 5.3 — Corrigir o vazamento antes de escolher o teto

> Pré-requisito: Fase 5.2 entregue (teto separado do piso do Gold,
> hipótese do `rank>0` refutada, mecanismo real do vazamento
> identificado — o preenchimento de reserva ignora elegibilidade e busca
> as duplas mais fortes quando o pool elegível esgota). Ver
> [FASE-5.2-RELATORIO.md](FASE-5.2-RELATORIO.md). A curva do teto medida lá
> não era utilizável: cada ponto misturava o parâmetro com o preenchimento
> em proporção diferente (20% até 350, 41,6% em 800). Esta fase corrige o
> mecanismo e remede a curva sem contaminação.

## Ordem de execução

1. Baseline "antes" (teto=800, comportamento atual) — re-confirma o
   vazamento (176 entradas) e mede a participação de bots **por escolha
   própria** sob o mecanismo atual.
2. Correção implementada (itens 1 e 2).
3. Curva remedida em 5 pontos (item 3).
4. Participação de bots por escolha própria, depois (item 4).

Instrumentação temporária: `DIAG_CAP53` (demanda/capacidade, exclusão,
preenchimento, vazamento, tamanho de chave, participação por escolha
própria) + `DIAG_CEILING` (varre a curva em processos paralelos sem
editar a constante). Revertidas antes do commit (§5).

---

## 1 — O preenchimento de reserva: removido, não "consertado"

### 1.1 — O que foi feito

O pedido (item 1) descreve um preenchimento MODIFICADO — "inverta o
critério", "quem está mais próximo de elegível", "uma dupla barrada pelo
teto nunca volta". O item 2 aprova o terceiro desenho da Fase 5.2:
**"permitir chave menor que `drawSize` ... roda com quem se inscreveu ...
sem preenchimento, não há como um par inelegível aparecer pra fechar
vaga"**.

Os dois se encontram num ponto só: **o preenchimento que completava a
chave até `drawSize` foi removido inteiro.** O campo de cada torneio da
simulação de fundo agora é exatamente quem ESCOLHEU o torneio
(`chooseTournament`, que já filtra por elegibilidade). Quando os inscritos
não enchem a chave, ela roda menor.

Com isso:

- **item 1.1 ("inverta o critério") fica sem objeto** — não há mais
  critério de preenchimento a inverter;
- **item 1.2 ("dupla barrada nunca volta") é estrutural** — sem
  preenchimento, não existe porta dos fundos;
- **item 1.3 ("as 176 entradas de vazamento → zero") é exatamente zero**
  — medido, `overqualified via reserva = 0` em todos os 5 tetos (§3.1).

A flag `overqualified` foi adicionada a `evaluateTournamentEntry`
(`EntryManager.js`) mesmo assim — marca o motivo "barrado por já estar
acima do teto" (distinto de "abaixo do corte"), é barata (`eligible` já
era `false`), e blinda contra qualquer reintrodução futura de
preenchimento que volte a ignorar o teto.

### 1.2 — `MIN_VIABLE_DRAW_SIZE` (item 2, mínimo viável)

`MIN_VIABLE_DRAW_SIZE = 8` — a menor chave real da escada de tiers
(Circuit/Legacy Finals, Exibição), uma chave de eliminação com estrutura
de verdade (quartas/semi/final). Para os tiers cuja chave-padrão já é 8, o
mínimo cede para `ceil(drawSize/2) = 4`, para não cancelar uma final de
acesso restrito porque uma dupla elegível descansou naquela semana.
Concretamente: Bronze/Silver (16), Gold/Masters (24) e
Platinum/Elite/Crown (32) → **8**; Circuit/Legacy Finals e Exibição (8) →
**4**.

Abaixo disso o torneio **não acontece**: marcado
`world_tour_resolved: true` + `world_tour_cancelled: true` (sai da fila de
pendentes), sem campeão, sem distribuir pontos. Antes o gatilho era `< 2`
— qualquer par de duplas "resolvia" o evento porque o preenchimento
forçado sempre completava o resto.

---

## 2 — Chave de tamanho variável: a distribuição de pontos por rodada (item 2, verificação obrigatória)

**Resolução: pontos do campeão fixos, rodadas intermediárias ajustadas ao
tamanho real do campo.** (Não "potências de 2 com byes".)

### Por quê

A simulação de fundo (`resolveCompletedWorldTourEvents`) **nunca simula
partida a partida nem modela byes** — ela ordena os inscritos por
`pairScore` e atribui o posto final de cada um pela profundidade binária a
partir do campeão (`Math.floor(log2(index)) + 1`). `resolveFinish` lia
`config.roundCount`/`roundPoints`/`roundLabels`, todos derivados do
`mainDrawSize` CONFIGURADO do tier. Com um campo menor que `mainDrawSize`,
os piores colocados recebiam os pontos de uma rodada que não aconteceu
(ex.: um campo de 9 duplas numa chave de 32 de Platinum: o `index 8`
mapeava para pontos de "quartas de final").

`getRoundOutcomeTable(tier, entrantCount)` (`circuitCatalog.js`, função
nova) recalcula a tabela para o número de rodadas que o campo REAL produz
(`roundCountForDrawSize(entrantCount)`), mantendo o valor do campeão fixo
no `rankPoints` canônico do tier — `buildRoundTable` sempre mapeia a razão
1,0 para o valor do campeão, seja qual for o `roundCount`. **Um Bronze de
9 duplas paga o mesmo título (10 pts) que um de 16; quem perde na estreia
recebe pontos de estreia, não de quartas.**

A tabela só encolhe abaixo de 9 entrantes (≤8 → 3 rodadas); campos de 9-16
mantêm as 4 rodadas da chave de 16 (`ceil(log2(12)) = 4`), 17+ mantêm 5. O
valor do campeão nunca muda com o tamanho do campo — a comparabilidade de
ranking entre um título de Bronze cheio e um de Bronze magro é preservada.

### Por que não "potências de 2 com byes"

Byes só teriam efeito num motor que simula rodada a rodada. Este não
simula — o `index` já é a classificação final por força, e a profundidade
binária já é a única topologia que existe. Byes seriam um no-op na
pontuação e cosmética pura. A opção (a) é ao mesmo tempo mais simples e o
modelo honesto para um campo ordenado por índice.

---

## 3 — Curva do teto, remedida sem contaminação

Mesma seed/escala oficial (900+100, `official-900-100-s1`), 2 temporadas,
`TIER_EVENTS_PER_YEAR` intocado, para cada valor de teto.

### 3.1 — Tabela

| Teto | Razão BS S1 → S2 | Razão Gold+ S2 | Fração escolheu-mas-não-jogou S2 | Reais s/ jogar S1, S2 | Interseção 2t | **Dominância real Bronze/Silver (títulos)** | Preench. reserva | Vazamento |
|---|---|---|---|---|---|---|---|---|
| 50  | 9,35× → 13,97× | 3,88× | 45,8% | 15, 27 | 7 (20,0%)  | **20/64 = 31,2%** | 0 % | **0** |
| 100 | 8,75× → 13,34× | 3,98× | 43,3% | 15, 21 | 8 (28,6%)  | **6/64 = 9,4%**   | 0 % | **0** |
| 150 | 8,37× → 12,60× | 3,85× | 43,3% | 16, 18 | 5 (17,2%)  | **1/64 = 1,6%**   | 0 % | **0** |
| 350 | 6,65× → 9,19×  | 3,98× | 38,0% | 15, 17 | 7 (28,0%)  | **1/64 = 1,6%**   | 0 % | **0** |
| 800 | 1,46× → 0,60×  | 4,01× | 31,5% | 12, 28 | 7 (21,2%)  | **0/50 = 0,0%**   | 0 % | **0** |

Referência — teto=800, **preenchimento forçado ainda no lugar** (= estado
final da Fase 5.1): razão BS 1,57× → 0,75×; Gold+ 2,72× → 4,08×;
**dominância real Bronze/Silver 23/80 = 28,8%** (Bronze 14/48 = 29,2%,
Silver 9/32 = 28,1% — bate com a Fase 5.1); preenchimento 23,0% → 41,6%;
**vazamento 32 + 144 = 176** (idêntico ao medido na Fase 5.2 — a
instrumentação desta fase reproduz o número exato).

### 3.2 — Chaves rodando abaixo de `drawSize` e canceladas

| Teto | Bronze finalizados (2 temp.) | Silver | Circuit Finals | Chaves BS abaixo de `drawSize` S2 (tam. médio) | Canceladas S1, S2 |
|---|---|---|---|---|---|
| 50  | 32 (de 48) | 32 | 1 (de 2) | 0/40 | 9, 8 |
| 100 | 32 | 32 | 1 | 0/40 | 9, 8 |
| 150 | 32 | 32 | 0 | 0/40 | 9, 9 |
| 350 | 32 | 32 | 0 | 0/40 | 9, 9 |
| 800 | **24** | **26** | 0 | **10/40 (9,7)** | 9, **23** |

Todo tier de Gold para cima é **idêntico em todos os 5 tetos** (Gold 16,
Platinum 12, Masters 20, Elite 20, Crown 8, Legacy Finals 1) — o teto
continua cirurgicamente localizado em Bronze/Silver, como na Fase 5.1/5.2.

### 3.3 — Leitura

**A razão demanda/capacidade não muda com a correção — nunca foi o
número certo pra decidir o teto.** Ela sempre mediu escolhas contra
vagas, e a correção não muda nem as escolhas nem o número de vagas
(compare a linha do teto=800 acima com a referência: 0,60× vs. 0,75×,
diferença de ruído). O que a razão continua mostrando é a mesma curva da
Fase 5.2 — platô de dois dígitos até 150, queda a partir de 350, colapso
perto de 800 — e a mesma leitura: **não há cotovelo único**.

**O sinal limpo que a Fase 5.2 não tinha está na dominância real de
Bronze/Silver, agora que o vazamento sumiu de TODOS os tetos:**

```
teto     50      100     150     350     800
real BS  31,2%   9,4%    1,6%    1,6%    0,0%
         └── reais ainda ──┘ └──── reais fora ────┘
             disputam
```

**Abaixo de ~150 o teto não cumpre o objetivo declarado** (tirar os reais
de Bronze/Silver): em teto=50 só o top 50 é barrado, e reais rankeados de
51 a 1000 escolhem e vencem Bronze/Silver **legitimamente** — 31,2% dos
títulos. Em teto=100 ainda 9,4%. **Só a partir de 150 os reais somem de
Bronze/Silver** (1,6%, e o único título é ruído de uma dupla real recém-
rebaixada). Isto **confirma a previsão do pedido** — "depois da correção o
valor certo pode ser outro, e provavelmente mais baixo, já que era o
vazamento que fazia tetos estritos parecerem ineficazes": o 350 não é
mais especial (a Fase 5.2 dava 45,3% ali só porque era onde o vazamento
não disparava); com o vazamento zerado em todo lugar, 150 e 350 são
equivalentes no que importa.

**Acima de ~350 o circuito começa a não conseguir montar Bronze/Silver.**
Em teto=800 a razão de regime cai pra 0,60× (demanda abaixo da
capacidade), 30 chaves de Bronze/Silver (de 80) são canceladas ou rodam a
~10 duplas ao longo das 2 temporadas, e a exclusão de reais numa
temporada específica sobe pra 28/100 (funil pro Gold+, que é o único tier
que sobra pra ~80% da população). Não é "capacidade resolvida" — é
**subutilização**: a base do circuito fica vazia.

**A faixa utilizável é ~150-350**: objetivo cumprido (reais fora de
Bronze/Silver), sem colapso da base, Gold+ oversubscrito mas estável
(~3,9×), participação de reais numa temporada relativamente estável
(17-18 de fora). Dentro dessa faixa as diferenças medidas são pequenas e
majoritariamente ruído de seed único. **Nenhum número está sendo
escolhido** — a decisão de onde exatamente dentro de 150-350 (ou se
150 vs. um pouco acima) é sua, com o mesmo critério das calibrações
anteriores.

### 3.4 — Achado colateral: ~16 Bronze/2-temporadas cancelam em QUALQUER teto — e não é o teto

Bronze finaliza 32 de 48 em todos os tetos de 50 a 350 (Silver finaliza
32 de 32). **A diferença não é o teto** — é que Bronze tem 24 eventos/ano
(contra 16 de Silver) e frequentemente 2+ na mesma semana; `chooseTournament`
não distribui as duplas entre eventos concorrentes do MESMO tier, **manda
todo mundo pra um só**, e o outro fica sem campo. O preenchimento forçado
mascarava isso enchendo o Bronze esvaziado com duplas que não o
escolheram — exatamente o tipo de problema que o pedido queria que
parasse de ser mascarado. **É um problema de IA de seleção, separado do
teto**, agora visível; registrado aqui para uma rodada futura, não
corrigido nesta (fora do escopo: itens 1 e 2 são o preenchimento e a
chave variável, não a distribuição de escolhas).

---

## 4 — Mediana de bots: a melhora da Fase 5.1 era ~metade preenchimento forçado

### Antes (teto=800, preenchimento forçado — estado da Fase 5.1)

| | Bots — mediana | Bots — média |
|---|---|---|
| `tournaments_played` (o que a Fase 5.1 reportou: **0 → 2**) | 2 | 4,25 |
| **Só escolha própria** (`DIAG_CAP53`) | **~1** (S1: 0 · S2: 1) | ~1,86 |

### Depois (preenchimento removido — escolha própria ≡ participação total)

| Teto | Bots — mediana (cum. 2 temp.) | Bots — média |
|---|---|---|
| 50  | 1 | 3,17 |
| 100 | 1 | 3,47 |
| 150 | 1 | 3,77 |
| 350 | 1 | 3,88 |
| 800 | 1 | 3,42 |

Confirmado por medição direta em todos os 5 tetos: **`escolha própria` e
`tournaments_played` batem byte a byte** depois da remoção (sem
preenchimento, não há participação que não seja escolha).

**Resposta ao item 4** ("se o número desabar, a Fase 5.1 melhorou menos
do que pareceu"): a Fase 5.1 reportou a mediana de bots subindo de 0 para
2. **Contando só escolha própria, ela subiu de 0 para 1** — o outro "+1"
era preenchimento forçado. Depois da Fase 5.3, a mediana medida É 1,
batendo com o número de escolha própria. **A agenda de tier da Fase 5.1
melhorou a participação de bots, mas cerca de metade da melhora reportada
era o mecanismo de fechar chave, não demanda genuína** — precisa constar
no registro, como pedido. (A média cai de 4,25 para ~3,5 pelo mesmo
motivo. A mediana continuar em 1, e não voltar a 0, é o efeito real da
agenda de tier: sem o teto, os mesmos bots de sempre encheriam tudo.)

---

## 5 — Validação final

- **Instrumentação temporária revertida integralmente.** `DIAG_CAP53` e
  `DIAG_CEILING` removidos de `WorldTourLifecycle.js`, `EntryManager.js` e
  `audit-real-athletes-simulation.mjs` — confirmado por `grep` (zero
  ocorrências de `DIAG_CAP53`/`__cap53`/`DIAG_CEILING`/`reportAndResetCap53`/
  `cap53` em `src/`/`scripts/`); `git diff` de
  `audit-real-athletes-simulation.mjs` **vazio**.
- `npx eslint . --quiet` — limpo, sem avisos.
- `npm run build` — OK (`vite build`, 1m11s; único aviso é o já existente
  de chunk >500kB, não relacionado).
- Suíte de regressão completa (`node scripts/rc-qa-suite-v36.mjs`, perfil
  `core`, 36 suítes) — **33/36, score 92/100 — idêntico ao estado final
  da Fase 5.1 e 5.2.** As mesmas 3 falhas pré-existentes e já datadas
  (`test:rc-gameplay-balance`, `test:career-pace`, `test:ui-quality` —
  ver [FASE-5.1-RELATORIO.md](FASE-5.1-RELATORIO.md) §3.1, todas de
  commits meses anteriores a esta auditoria). **Zero regressão nova.**
- `git status --short -- src-tauri/` — **vazio**, nenhum arquivo tocado.
- Relatórios auto-regenerados pela suíte revertidos (`git checkout`) antes
  do commit.

### Mudanças permanentes

| Arquivo | Mudança |
|---|---|
| `src/lib/circuitCatalog.js` | `getRoundOutcomeTable(tier, entrantCount)` — tabela de pontos/rótulos por rodada para um campo menor que `mainDrawSize` |
| `src/gameplay/worldTour/WorldTourLifecycle.js` | preenchimento de reserva removido; `MIN_VIABLE_DRAW_SIZE`/`minViableDraw`; torneio abaixo do mínimo → `world_tour_cancelled`; `resolveFinish` recebe `entrantCount` e usa `getRoundOutcomeTable` |
| `src/gameplay/worldTour/EntryManager.js` | flag `overqualified` no resultado do teto (`result(...)` aceita `extra`) |

`OPEN_TIER_CEILING` **mantido em 800** — nenhum número escolhido nesta
entrega, conforme instruído.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Vazamento corrigido, 176 entradas → zero | ✅ preenchimento de reserva REMOVIDO (não "consertado") — o campo é 100% escolha própria; vazamento medido = **0** nos 5 tetos; flag `overqualified` adicionada como blindagem |
| 2 | Chave variável + resolução do conflito de pontos por rodada | ✅ `getRoundOutcomeTable` — **pontos do campeão fixos no `rankPoints` canônico, rodadas intermediárias recalculadas pro campo real**; não "byes" (o motor não simula rodada a rodada); `MIN_VIABLE_DRAW_SIZE = 8` (4 pros tiers de chave 8), abaixo disso o torneio é cancelado |
| 3 | Curva remedida nos 5 pontos, sem escolher o número | ✅ medida; **o sinal limpo é a dominância real de Bronze/Silver: 31,2% (50) → 9,4% (100) → 1,6% (150) → 1,6% (350) → 0,0% (800)** — abaixo de ~150 o teto não cumpre o objetivo, acima de ~350 a base do circuito colapsa; faixa utilizável **150-350**; razão demanda/capacidade não muda com a correção e continua sem cotovelo único |
| 4 | Participação de bots por escolha própria, antes e depois | ✅ a mediana da Fase 5.1 "0→2" era **0→1** contando só escolha própria; o outro "+1" era preenchimento forçado; depois da remoção a mediana medida é **1** em todos os tetos, batendo com escolha própria |
| 5 | Suíte, lint, build, Tauri, commit | ✅ lint limpo; build OK (1m11s); suíte 33/36 (score 92/100, idêntico à Fase 5.1/5.2 — 3 falhas pré-existentes, zero regressão nova); `src-tauri/` intocado; instrumentação temporária revertida (`git diff` do harness vazio) |

**Resumo executivo**: o preenchimento de reserva não foi "consertado" —
foi removido. O campo de cada torneio da simulação de fundo agora é
exatamente quem se inscreveu; quando não enche, a chave roda menor, e
abaixo de um mínimo viável (8 duplas) o torneio não acontece. Isso zera o
vazamento por construção (medido: 0 nos 5 tetos, contra 176 em teto=800
antes) e revela o que ele escondia. **Com a curva limpa, o número que
decide o teto não é a razão demanda/capacidade (não muda com a correção,
não tem cotovelo) — é a dominância real de Bronze/Silver, que agora cai de
forma limpa e monotônica: 31% em teto=50, ~0% a partir de 150.** Abaixo de
~150 os reais rankeados 51+ disputam a base legitimamente; acima de ~350 o
circuito não consegue mais montar Bronze/Silver (razão 0,60×, 30 chaves
canceladas ou minúsculas em 2 temporadas a teto=800). A faixa utilizável é
150-350; a escolha dentro dela é sua. A chave de tamanho variável não
quebra a pontuação da Fase 3A: o campeão sempre vale o `rankPoints` do
tier, só as rodadas intermediárias encolhem com o campo. Achado colateral,
antes mascarado pelo preenchimento: ~16 Bronze por 2 temporadas cancelam
em qualquer teto porque `chooseTournament` não distribui as duplas entre
eventos concorrentes do mesmo tier — problema de IA de seleção, registrado
para depois. A melhora de participação de bots da Fase 5.1 (mediana 0→2)
era cerca de metade preenchimento forçado: contada só por escolha própria,
foi 0→1.
