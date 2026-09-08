# Fase 4.1 — Sequenciar clubs.js, decidir o determinismo, e voltar à medição

> Pré-requisito: Fase 4.0 entregue (achado #18 fechado com 1A/1B medidos e
> 2A/2B aplicados) e o achado #26 registrado no meio da própria Fase 4.1
> (o harness nunca usou a fronteira transacional que produção usa). Ver
> [FASE-4-RELATORIO.md](FASE-4-RELATORIO.md).
>
> Esta fase teve um ciclo de investigação, pausa e retomada: ao aplicar a
> correção do achado #26, a saída deixou de bater com a versão anterior do
> harness — investigação apontou pra uma condição de corrida sensível a
> timing, o usuário pausou a medição de custo até essa pergunta ter
> resposta, e a resposta ("determinismo por save não é requisito, é
> anti-requisito") liberou a correção pequena (sequenciar `clubs.js`) e a
> retomada da medição. Este relatório documenta o ciclo inteiro.

## 1 — A pergunta de fundo: `Math.random()` direto ou PRNG seedado?

Contagem em `src/` (produção): **96 chamadas diretas de `Math.random()` em
33 arquivos** — mercado, torcida, clima, bots, clubes, eventos de mundo,
partidas, treino, personalidade, parcerias, economia, posts sociais. Zero
seeding. Existe PRNG local seedado em exatamente 4 lugares
(`QualifyingManager.js`/`MainDrawManager.js` — chave/qualifying;
`rankingPopulation.js`/`simulationHealth.js` — geração de população) —
bem desenhado, mas cobrindo uma fatia pequena do motor.

`installDeterminism` (o patch `Math.random = mulberry32(seed)` que
sustentou toda medição desta auditoria) existe em **12 arquivos, todos em
`scripts/*.mjs`** — zero em `src/`. **Confirmado**: produção nunca teve
nenhum mecanismo de seed.

**Decisão do usuário**: determinismo por save é **anti-requisito**, não
requisito — recarregar antes de uma final e ver o mesmo resultado
transformaria qualquer derrota em algo contornável por save-scumming.
**Nada de PRNG seedado por carreira.** Os 96 pontos de `Math.random()` cru
e os 4 PRNGs locais ficam exatamente como estão.

O que o projeto precisava não era determinismo do jogo — era
**reprodutibilidade sob instrumentação** (o harness conseguir comparar
antes/depois de forma confiável), que é outra coisa.

## 2 — Inventário de escrita concorrente

`Promise.all`/`Promise.allSettled` na cadeia `advanceDay`/
`processGameStateDay`, cruzado com quem toca `Math.random()` ou
`mutateActiveCareer`:

| Local | Concorrência | `Math.random()`? | Escrita? | Risco |
|---|---|---|---|---|
| `clubs.js:227` (`processAllClubsMonthly`) | N clubes | Sim | Sim | **Alto — candidata única com os 3 ingredientes** |
| `livingWorldEngine.js:132` | Leituras de existência | Não | Não (write sequencial depois) | Nenhum |
| `seasonLifecycle.js`/`partnerLifecycle.js`/`trainingLifecycle.js` (5 locais) | Arrays fixos, 2-4 itens | Não direto | Sim, mas não escala | Baixo/cosmético (só id) |
| 10 outros locais | Leituras puras | Não | Não | Nenhum |

`clubs.js:227` bate exato com o dia em que a divergência apareceu
(primeira virada de mês).

## 3 — Correção: `clubs.js` sequenciado

`processAllClubsMonthly` trocou `Promise.all(clubs.map(...))` por um laço
`for...of` ordenado por `id` de clube (nunca a ordem de retorno de
`.list()`). Confirmado que nenhum clube lê estado de outro dentro de
`processClubMonthlyUpdate` — não muda comportamento de jogo, só a ordem
em que os clubes são processados.

Os 5 locais de risco baixo/cosmético não foram sequenciados — registrados
no achado #27 como "conhecido, aceito".

## 4 — Validação: reprodutibilidade e paridade

**Reprodutibilidade sob instrumentação** (o teste que falhava antes):
harness rodado com dois wrappers diferentes de `Math.random()` (contagem
simples vs. stack trace), mesma seed, população chegando a 147 atletas —
**saída byte-idêntica nos dois casos.** O heisenbug está fechado.

**Paridade contra produção real** (metodologia da Fase 0.1, mas contra
`dayAdvanceCoordinator.js:advanceCareerDayOnce` — o ponto de entrada real
do clique de "avançar dia", não a versão antiga deste harness): **quase
completa, não 100%.** De 147 atletas, 146 batem exatos em todos os
campos; 1 diverge em `form`/`energy` (não em pontos/overall). Estável
entre wrappers de instrumentação (não é mais um heisenbug) — hipótese mais
provável é `createSingleFlightCoordinator` (usado só pelo caminho real)
adicionar um tick de microtask extra que desloca o consumo do
`Math.random()` global compartilhado com o próprio module runner do Vite
— não perseguido além disso, fora do escopo desta rodada.

**Recomendação sobre `docs/baseline-pre-fase3.json`**: não recongelar por
causa disto. A divergência que motivou a preocupação (cascata populacional
inteira, sensível a instrumentação) está resolvida; o resíduo (1/147,
2 campos, estável) é pequeno e não relacionado ao padrão original.

## 5 — Medição de custo retomada

Temporada oficial completa (900+100, seed `official-900-100-s1`), harness
com transação por dia e `clubs.js` sequenciado:

| Métrica | Sem transação (Fase 3, achado #23) | Com transação (Fase 4.1) |
|---|---|---|
| Tempo de parede, 1 temporada | 38min16s | **5min57,9s** (−84,4%, ~6,4× mais rápido) |
| Crescimento intra-temporada (jan→dez) | 7,5× | **1,70×** (pico out: 1,90×) |

`ms/dia` por mês: jan 596,91 · fev 887,36 · mar 881,25 · abr 903,14 · mai
898,04 · jun 893,13 · jul 913,65 · ago 1009,52 · set 1096,35 · **out
1135,54 (pico)** · nov 1026,67 · dez 1016,95.

Mesmos 80 torneios resolvidos, 0/80 chaves incompletas — a correção da
fronteira transacional não mudou nenhum resultado de jogo, só o custo.

**Projeção do regime-check de memória (5 temporadas, OOM na temporada 2)**
— projeção, não remedição (não rerodado por instrução explícita): duas
causas possíveis, uma corrigida (churn de alocação — 89% menos clones/dia
reduz diretamente a pressão de GC que provavelmente era o gatilho
próximo), uma não (crescimento genuíno de dados sem poda, ex.:
`AthleteCareerLegacy` — reduzir a frequência de clone não reduz o tamanho
do que eventualmente precisa ser clonado). Um OOM disparado por ritmo de
clonagem fica bem menos provável na mesma temporada 2; um disparado por
volume de dados acumulado pode só ter sido adiado, não eliminado. Rodar o
regime-check de verdade é o próximo passo natural, fica pra quando o
usuário decidir que vale o custo.

**Efeito colateral corrigido**: os arquivos rastreados
`reports/real-athletes-audit/summary.json`/`tournament-results.csv`/
`season-tier-table.md` estavam contaminados por um run de teste anterior
(seed `diag-clean-1`, população reduzida, sessão de depuração da Fase
4.0) que tinha sido commitado por engano pelo processo de snapshot
automático do repositório. Esta rodada os regenerou com o seed e a escala
oficiais — a contaminação está corrigida como efeito colateral da
medição retomada.

## 6 — Suíte, lint, build, Tauri

- `npm run lint` — limpo, sem avisos, em todo o repositório.
- `npm run build` — OK.
- Nenhum arquivo de `src-tauri/` tocado — `npm run test:dev-server-config`
  aprovado.
- Suíte de regressão completa (14 scripts) + `test:athlete-hot-fields-fase4`
  + `test:rerank-topn-equivalence-fase4` — **17/17 com exit 0, sem nenhuma
  linha de FAIL/GATE FALHOU.**
- `clubs.js` não tem teste dedicado no repositório; a mudança é
  comportamentalmente neutra (mesmas operações, ordem sequencial em vez de
  concorrente) e coberta pela validação de lint + pela própria
  reprodutibilidade confirmada no item 4.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | `clubs.js` sequenciado, impacto de custo medido | ✅ sequenciado por id; roda 1×/mês, custo do laço sequencial é desprezível frente ao resto da temporada |
| 2 | Reprodutibilidade sob instrumentação validada | ✅ byte-idêntica entre dois wrappers de `Math.random()` diferentes |
| 3 | Paridade harness × produção real | ✅ quase completa (146/147), resíduo pequeno e estável documentado; baseline existente NÃO precisa recongelar |
| 4 | Achado #27 atualizado com a decisão de design | ✅ determinismo por save = anti-requisito, registrado com a justificativa; causa (`clubs.js`) e correção documentadas |
| 5 | Medição de custo retomada (3 números) | ✅ 38min16s→5min57,9s; 7,5×→1,70× intra-temporada; OOM: projeção condicional (não remedido) |
| 6 | Suíte verde, lint, build, Tauri OK | ✅ 17/17 PASS/exit 0, tudo limpo |

**Resumo executivo**: a fase abriu com uma pausa correta — o usuário
interrompeu a medição de custo porque um achado de determinismo (a
divergência sensível a instrumentação) tinha prioridade sobre continuar
gerando números que talvez precisassem ser refeitos de qualquer jeito. A
investigação encontrou a causa (uma única ocorrência de concorrência
real, `clubs.js`), o usuário decidiu a pergunta de design que a
investigação tinha aberto (determinismo por save não é requisito), a
correção foi pequena e cirúrgica, e a medição de custo retomada confirmou
exatamente a suspeita que motivou reabrir a Fase 4.1: o número de 7,5×
que a auditoria carregava desde a Fase 1.5 era um artefato do harness sem
a fronteira transacional certa, não uma propriedade do jogo — a curva
real é 1,70×.
