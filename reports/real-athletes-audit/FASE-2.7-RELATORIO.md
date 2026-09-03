# Fase 2.7 — Fechamento pré-Fase 3

> Pré-requisito: Fase 2.6 entregue (vazão do mercado corrigida, diagnóstico
> do `livingWorld`, poda não-destrutiva). Ver
> [FASE-2.6-RELATORIO.md](FASE-2.6-RELATORIO.md).

## 1 — Editorial: consolidação + cadência (as duas, decisão tomada)

### 1.1 — Consolidar escritas do mesmo dia (aplicado)

`processLivingWorldDay` (`src/lib/livingWorldEngine.js`) reescrito: as
três gravações de `WorldEvent` do dia (eventos contextuais, editorial,
boletim semanal) — antes 3 chamadas separadas (`persistEvents` +
`generateWorldEvents` + `persistEvents` de novo dentro de
`createWeeklyWorldBulletin`) — agora se juntam num único array e passam
por UMA chamada de `persistEvents`. `createWeeklyWorldBulletin` foi
dividido em `buildWeeklyWorldBulletinPayload` (só monta o payload, ou
devolve o boletim já existente — preserva a checagem de idempotência
original) e um wrapper público fino que mantém a assinatura antiga
(sem outros consumidores no código, mas mantido por estabilidade de API).
Decisão do conteúdo (quais eventos existem, quando o boletim é devido)
não mudou — só onde a persistência acontece.

### 1.2 — Reduzir a cadência do editorial (dado antes da decisão)

Antes de escolher um número, medi o que o jogador realmente vê:

| Superfície | Onde | Itens exibidos | Itens buscados | Frequência de acesso |
|---|---|---|---|---|
| Widget "Mundo" (CareerHub) | `WorldHighlights`, `src/pages/CareerHub.jsx:803` — "Só o essencial" | **3** | 8 (`getLivingWorldSnapshot(p, 8)`) | Hub principal — visitado toda sessão/todo avanço de dia |
| Feed "Mundo" (Journal) | `WorldFeed.jsx`, aba secundária de `Journal.jsx` | 10/página (`PAGE_SIZE=10`) | até 40 (`getRecentWorldEvents(40)`) | Opt-in — jogador precisa abrir Journal E clicar na aba "Mundo" |
| Página "Mundo/Notícias" | `WorldEvents.jsx` | 12/página (`PAGE_SIZE=12`) | até 50 (`getRecentWorldEvents(50)`) | Página dedicada, navegação direta |
| Resumo semanal (notificação) | `getWeeklyRelevantHighlights(date, {limit:2})`, `gameStateLifecycle.js` | 2 | — | Automático, semanal — **filtra por `tier==='destaque'`, e eventos editoriais NUNCA têm tier ('normal' sempre) — editorial não aparece aqui, em nenhuma cadência** |

Editorial gerava **1 evento/dia, 2 na sexta-feira** (~1,14/dia em média),
**incondicionalmente**, a partir de só **3 templates** fixos
(`AMBIENT_WORLD_EVENTS`, `src/lib/world.js`). A categorização do próprio
`getLivingWorldSnapshot` (`circuito`/`mercado`/`saude`) nem reconhece os
`event_type`s do editorial (`noticia`/`social`) — editorial não entra em
NENHUMA categoria, só polui a lista bruta (`events`/`breaking`) que
alimenta o widget de 3 itens do hub principal. Com outras fontes
gerando um volume comparável de eventos por dia (parcerias formadas/
dissolvidas — que dispararam de ~1/mês pra ~39/mês na Fase 2.6 — lesões,
marcos de ranking, torneios, prospects, macroeventos), editorial
competia por uma fatia desproporcional de uma janela que já é fina por
natureza: **o widget mais visto do jogo mostra só 3 itens, e um deles
podia ser rotineiramente "Academias intensificam a preparação para a
temporada" em vez de qualquer coisa que o jogador causou ou decidiu.**

**Decisão**: 1 evento a cada 3 dias (`EDITORIAL_CADENCE_DAYS = 3`,
`isEditorialDay`, dia absoluto do calendário módulo 3 — determinístico,
sem estado), sem o dobro de sexta-feira (simplificação incidental — a
assimetria não tinha justificativa de design registrada em lugar
nenhum). Corte de ~71% na geração (de ~417/temporada pra ~122/temporada).
Ainda garante ambientação várias vezes por semana sem dominar um widget
de 3 itens.

### Custo

_[preenchido após o regime-check em background — mesma rodada usada pra
congelar a nova referência, item 4]_

---

## 2 — Clone-por-transação: achado próprio, 6 ocorrências

Registrado como **achado #18** na tabela de classificação consolidada —
ver
[AUDITORIA-ATLETAS-REAIS-VS-BOTS.md](AUDITORIA-ATLETAS-REAIS-VS-BOTS.md#classifica%C3%A7%C3%A3o-consolidada):

> **#18** — `CareerEntityRepository`/`ActiveCareerAdapter.mutateActiveCareer`
> faz `structuredClone` do save INTEIRO a cada transação de escrita,
> independente de quantos itens aquela chamada grava. Seis sistemas
> bateram nesse mesmo teto e foram corrigidos um a um pelo mesmo padrão
> (acumular e gravar numa única chamada), sem que o padrão em si fosse
> nomeado até agora: **(1)** `dissolvePartnerships` (Fase 1.5); **(2)**
> `generateProspects` (Fase 2.5); **(3)** eventos de lesão em
> `simulateWorldDay` (Fase 2.5); **(4)** `persistEvents` (Fase 2.5);
> **(5)** `formNewPartnerships` (Fase 2.6); **(6)** editorial + boletim
> semanal (Fase 2.7, a MAIOR ocorrência medida — 50,9% do custo de
> `livingWorld` inteiro). Explica também o crescimento de custo de 7,5×
> dentro de uma temporada — o save cresce ao longo do ano, então toda
> escrita (corrigida ou não) fica mais cara com o tempo. Produção, não
> harness. **Não corrigido na raiz** — registrado como investigação
> dedicada, agendada pra ANTES da Fase 4 (ranking rolling de 52 semanas
> vai adicionar escritas semanais sobre a população inteira — é lá que
> vira problema de verdade, não só ruído de perfilamento).

Não investiguei NEM proponho correção da causa raiz nesta entrega — por
pedido explícito ("não corrija agora"). O que fica pronto para a
investigação futura: a lista das 6 ocorrências já corrigidas (não
precisam ser redescobertas), a hipótese mais provável (uma camada de
"transação lógica" que acumula várias operações heterogêneas — já existe
como `localGame.batch`, usado por 4 das 6 correções — mas cada SISTEMA
ainda abre sua própria transação; o próximo passo seria um número menor
de transações POR DIA/MÊS, não por sistema), e o gatilho de quando isso
deixa de ser tolerável (Fase 4, ranking rolling semanal).

---

## 3 — Guarda no `MARKET_FORMATION_FRACTION` + justificativa do 0,14

### Guarda

Trocado `let` exportado + setter por **injeção de parâmetro**. A
constante voltou a ser `const` de verdade
(`src/game-core/aiPartnershipLifecycle.js`); `processAiPartnershipMarket`
ganhou um `options.formationFraction` opcional, repassado a
`formNewPartnerships`, que usa `MARKET_FORMATION_FRACTION` como valor
PADRÃO do parâmetro (`formationFraction = MARKET_FORMATION_FRACTION`) —
nunca lido de um estado de módulo mutável. `scripts/diag-market-formation-calibration.mjs`
atualizado para passar `{ formationFraction: fraction }` em vez de chamar
um setter. **Não sobrou nenhum caminho de código, em lugar nenhum do
repositório, capaz de mudar o comportamento de uma carreira em produção
a partir de um script de diagnóstico** — a classe inteira de "mutação
acidental" deixou de existir, não foi só bloqueada por uma checagem de
ambiente (que exigiria confiar em alguma heurística de "é teste ou não" —
a injeção de parâmetro não precisa de heurística nenhuma).

### Justificativa do 0,14 — corrigida

A justificativa original (Fase 2.6) citava DOIS argumentos: o cotovelo da
curva (0,10→0,16 com retorno decrescente forte) e o desempate "reais
saem melhor em 0,14 (84%) do que em 0,16 (81%)". **O segundo argumento
foi removido.** Com n=100 reais, uma diferença de 3 pontos percentuais
entre duas frações vizinhas na mesma curva é exatamente do tamanho que
ruído de amostra produz — citá-lo como razão teria criado precedente de
decidir calibrações futuras por diferenças dentro da margem, sem medir
se a diferença é estatisticamente real. **O cotovelo sozinho já sustenta
o valor**: 0,14 é o ponto em que o ganho marginal de subir mais fração
já caiu para menos de 1 ponto percentual de cobertura por 0,02 adicional
de fração (0,14→0,16: +0,6pp; contra 0,08→0,10: +8,8pp) — critério
objetivo, sem depender de qual dos dois lados do n=100 caiu mais alto
numa rodada específica. [FASE-2.6-RELATORIO.md](FASE-2.6-RELATORIO.md)
mantido como está (registro histórico do que foi escrito então); esta
seção é a correção oficial da justificativa daqui em diante.

---

## 4 — Nova referência congelada

Feito. Detalhes completos em
[BASELINE-PRE-FASE3-CONGELADA.md](BASELINE-PRE-FASE3-CONGELADA.md) —
resumo:

- **1 temporada** (não 5 — ver item 5 abaixo pra por quê), seed
  `official-900-100-s1`, 900 procedurais + 100 reais, congelada em
  [docs/baseline-pre-fase3.json](../../docs/baseline-pre-fase3.json) /
  [-season-tier.md](../../docs/baseline-pre-fase3-season-tier.md).
- **Baseline antiga arquivada, não sobrescrita**:
  `docs/baseline-pre-refactor.json` (970 bots + 24 reais) ganhou uma nota
  (`_archived_note` no JSON + aviso no `.md`) explicando que é o registro
  do estado pré-Fase-2 e não é comparável numericamente à nova.
- **Números de partida pra Fase 3**: 13/32 (40,6%) chaves incompletas ·
  31/32 campeões 100%-reais, 1 misto · 19/20 reais no top 20 · 13/100
  reais nunca jogaram na temporada · #1000 elegível para 13/32 torneios,
  maior intervalo 42 dias.

---

## 5 — Regime-check de 5 temporadas: adiado, não executado

**Tentativa real, não pulada por precaução**: rodei o regime-check de 5
temporadas (mesma seed `official-900-100-s1`, 900 procedurais + 100
reais) antes de decidir qualquer coisa. A temporada 1 fechou normalmente
(13/100 reais não jogaram nela, 19/20 no top 20, 13/32 chaves
incompletas) — mas o processo **travou durante a temporada 2** com
`FATAL ERROR: Reached heap limit — JavaScript heap out of memory`.
Como o harness só grava `summary.json`/`tournament-results.csv`/
`season-tier-table.md` no disco UMA VEZ, ao final de TODAS as temporadas
(`writeFileSync`, só depois do laço completo) — o crash no meio da
temporada 2 significa que **nada desta rodada de 5 temporadas foi
persistido**; os números de temporada 1 só existem no log de console,
não em arquivo.

O harness já documentava (comentário "Fase 0.1, achado C") que o mesmo
tipo de crash acontece "~3 temporadas" por acúmulo de `WorldEvent`/
`CareerMessage`/`TeamRanking`/`Partnership` sem poda — e já tem uma
mitigação parcial (poda essas 4 coleções todo mês). **Desta vez travou
na temporada 2, mais cedo que o já documentado** — explicado pela própria
Fase 2.6: a vazão de mercado corrigida forma/dissolve dezenas de pares
por mês (antes: ~1), e a Fase 2.6 também introduziu `AthleteCareerLegacy`,
uma coleção que cresce pra sempre por design (é o registro permanente —
podá-la destruiria o propósito do item). Mais dado por temporada,
antecipa o limite de memória.

**Decisão (do usuário, durante a execução): não insistir agora.** O
argumento é o próprio achado #18 desta fase: cada escrita clona o save
inteiro, e é exatamente esse mecanismo que faz 5 temporadas custarem
desproporcionalmente mais que 5× uma. Rodar o regime-check completo AGORA
seria pagar o preço máximo (a medição mais cara desta auditoria inteira)
sobre um comportamento que a correção do #18 vai mudar de qualquer jeito —
e ainda por cima sem sequer completar, dado o crash de memória. **Depois
da correção do #18 (agendada para antes da Fase 4), a mesma rodada tende
a custar uma fração do que custaria agora, e a medição passa a valer o
esforço.**

**Fica registrado, pronto pra quando fizer sentido**: a instrumentação de
rotatividade (item 5 do pedido — lista nominal de reais que não jogaram
EM CADA temporada + interseção entre temporadas, pra distinguir
rotatividade normal de exclusão permanente) já está implementada no
harness (`scripts/audit-real-athletes-simulation.mjs`,
`realAthletesNeverPlayedThisSeason` por temporada +
`cumulative.realAthletesNeverPlayedRotation` com união/interseção) —
não precisa ser escrita de novo, só rodada quando o regime-check
acontecer.

---

## 6 — Suíte, lint, build

_[preenchido ao final]_

---

## Entrega

_[resumo final ao término da rodada em background]_
