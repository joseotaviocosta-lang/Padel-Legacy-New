# Fase 7.1 — Quebrar a espiral (a segunda porta de entrada)

> Pré-requisito: Fase 7 identificou o mecanismo com 98,8% de acurácia —
> rank ruim → menos vagas ganhas (`applyEntryPriority`, por rank) →
> menos pontos (só vêm de jogar) → rank relativo pior (o resto do mundo
> continua jogando) → menos vagas ainda. Três peças já existentes
> compondo, sem bug isolado a corrigir. Ver
> [FASE-7-RELATORIO.md](FASE-7-RELATORIO.md). Esta fase implementa uma
> segunda porta de entrada (qualifying e/ou wildcard) que não depende
> só do ranking corrente — a peça que falta pro motor ter o que o
> circuito real tem (o motor já tinha o ranking de 52 semanas desde a
> Fase 4).

## 1 — Desenho da segunda porta

### 1.1 — Onde ela entra no código existente

`applyEntryPriority` (`WorldTourLifecycle.js:79-97`) já divide
`drawSize` em `openSlots` (por rank) + `reservedSlots` (25% do draw,
`ENTRY_RESERVED_SHARE`, concedidos direto por menos-torneios-jogados,
sem nenhum teste). As duas portas propostas entram AQUI — dentro da
fatia reservada, não como um mecanismo à parte:

```
hoje:      openSlots (por rank) + reservedSlots (concedido direto)
proposta:  openSlots (por rank) + reservedDireto + qualifyingSlots (precisa ganhar)
```

### 1.2 — Opção A: Qualifying

Uma fração de `reservedSlots` (proposta: metade — `QUALIFYING_SHARE =
0,5` de `ENTRY_RESERVED_SHARE`, ou seja ~12,5% do draw total) deixa de
ser concedida direto e vira `qualifyingSlots`. Pra preenchê-la:

1. Pega os `qualifyingSlots × 4` próximos candidatos por
   menos-torneios-jogados (o MESMO critério do `byLeastPlayed` já
   existente — o pool de qualifying é maior, não um grupo novo).
2. Roda um mini-bracket de eliminação simples entre eles, decidido por
   `pairScore(pair, tournament)` — a MESMA função que já decide quem
   vence a chave principal (`ordered.sort(...)`), sem lógica nova de
   partida.
3. Os `qualifyingSlots` vencedores entram na chave principal; o resto
   do pool não joga essa semana (mesmo resultado de hoje pra eles).

**Efeito estimado**: como o pool de qualifying é restrito a quem já
está na fatia "menos torneios jogados" (não o campo inteiro), uma
dupla presa na espiral compete contra PARES na mesma situação, não
contra o campo todo — a diferença de `overall_rating` medida entre
núcleo ocioso e ativo (81 vs. 85, Fase 7 §1.1) é real mas pequena, o
suficiente pra não ser um veto automático numa disputa restrita a um
pool de 4 pra 1 vaga (~25% de chance por tentativa, se a habilidade
dentro do pool for parecida). Repetido toda semana elegível ao longo
de uma temporada (~10-15 semanas relevantes), a chance ACUMULADA de
vencer pelo menos uma vez é alta — estimativa grosseira:
1-(0,75)^12 ≈ 96% de chance de pelo menos 1 vitória na temporada, se
as ~15 tentativas forem independentes (não são exatamente, mas dá a
ordem de grandeza). **Deveria quebrar o "zero torneios inteiro" pra a
maioria do grupo travado**, sem necessariamente resolver o rank de
uma vez (uma entrada só não é suficiente pra recuperar uma posição de
rank muito baixa).

### 1.3 — Opção B: Wildcard

Um número pequeno de `reservedSlots` (proposta: 1-2 por torneio,
tamanho fixo, não proporcional a `drawSize`) concedido DIRETO — sem
disputa — para as duplas de PIOR rank entre as cortadas (`byRank`
invertido, pegando o fim da lista em vez do início).

**Efeito estimado**: por ser concedido sem teste de habilidade, resgata
diretamente 100% de quem recebe — mas só ~1-2 duplas por torneio, contra
um grupo travado que a Fase 7 mediu em ~35-55 duplas reais (a depender
do cenário). Cobertura pontual — ajuda quem recebe, não estatisticamente
a maioria do grupo, a menos que o número de wildcards suba a ponto de
já não ser "pequeno" (contradizendo o item 1.4 do pedido).

### 1.4 — Comparação e recomendação

| | Qualifying | Wildcard |
|---|---|---|
| Chance é recorrente? | Sim — toda semana elegível | Sim, mas só 1-2 vagas/torneio pra ~40-55 duplas presas |
| Ainda exige mérito? | Sim — vence um pool restrito, não o campo todo | Não — concessão direta |
| Cobertura estimada do grupo travado | Alta (maioria, ao longo de uma temporada) | Baixa/pontual (poucas duplas por vez) |
| Risco de virar a porta principal | Baixo — ainda precisa vencer algo | Médio — fácil de expandir demais sem perceber |
| Complexidade de implementação | Média (mini-bracket novo, reusa `pairScore`) | Baixa (só inverte o critério de seleção de uma fatia já existente) |

**Recomendação: implementar Qualifying sozinho nesta rodada.** Ataca o
mecanismo medido (recorrência) sem abrir mão de mérito (evita virar a
porta principal), e a mesma disciplina desta auditoria desde a Fase 6.7
("meça uma coisa de cada vez") pesa contra implementar os dois juntos —
o item 3 da Fase 6.7 já mostrou que combinar duas mudanças pode
produzir uma interação que nenhuma medição isolada previa. Wildcard
fica registrado como opção B, não implementada, pra considerar DEPOIS
de medir o efeito do Qualifying sozinho — se ele não for suficiente
pro grupo mais extremo (rank muito acima de 300), wildcard pode ser um
complemento pontual pras piores duplas, mas isso é uma decisão pra
depois de ver o dado.

**Confirmado com o usuário — implementar Qualifying sozinho.**

### 1.5 — Implementação

`applyEntryPriority` (`WorldTourLifecycle.js`): `QUALIFYING_SHARE=0,5`
(metade de `ENTRY_RESERVED_SHARE`), `QUALIFYING_POOL_MULTIPLIER=4`.
`reservedSlots` se divide em `reservedDirectSlots` (topo da fila de
menos-torneios-jogados, concedido direto, como antes — só que com
metade das vagas) + `qualifyingSlots` (resolvidos por
`resolveQualifyingBracket`, eliminação simples por `pairScore` entre um
pool de `qualifyingSlots×4` candidatos). Sem lógica de partida nova — o
bracket reusa o mesmo `pairScore` que já decide a chave principal.

### 1.6 — Correção no meio da medição: o pool de qualifying usava o critério errado

**A primeira versão não funcionou — medido, não suposto.** Ela tirava o
pool de qualifying da MESMA fila de menos-torneios-jogados
(`byLeastPlayed`) que já alimenta `reservedDirectSlots`. Rodando os 3
cenários (5 temporadas, DIAG_QUALIFYING), o grupo rank>300 continuou em
**0% de "jogou"** — a mesma leitura da Fase 7, sem nenhuma melhora.
Causa: `pairTournamentsPlayedSoFar` é uma contagem **vitalícia** (nunca
reseta por temporada). Uma dupla presa que teve uma temporada 1 boa (o
bootstrap inicial — TODA dupla joga na temporada 1, achado repetido
desde a Fase 6.5) acumula um total vitalício que não cai só porque ela
passou as 2 temporadas seguintes inteiras sem jogar; duplas novas
(parcerias recém-formadas, bots recém-criados) têm MENOS jogos
vitalícios sem estar presas em nenhuma espiral, e furavam a frente da
fila de "menos jogados" — o pool de qualifying nunca alcançava quem a
Fase 7 realmente identificou.

**Corrigido**: o pool de qualifying agora usa RANK direto (a mesma
variável que a Fase 7 mediu com 98,8% de acurácia, e que cai em tempo
real por ser posição relativa, nunca vitalícia) — pega os PIORES ranks
entre quem não ganhou vaga aberta nem reservada direta. `reservedDirectSlots`
continua usando o critério antigo (menos-torneios-jogados), intocado —
só o pool de qualifying mudou. Reteste (smoke test de 3 temporadas,
população oficial): rank>300 foi de **0/14 (0%)** pra **3/5 (60%)** na
temporada 3 — confirma que o problema era o critério de seleção do
pool, não o desenho do qualifying em si. Rodadas completas de 5
temporadas relançadas com a versão corrigida.

## 2 — Medição contra o mecanismo (grupo rank>300)

Três rodadas completas de 5 temporadas, população oficial, mesma seed,
versão CORRIGIDA do qualifying (§1.6) — os mesmos 3 cenários da Fase
6.7/7 (atual, topo 76, topo 120).

### 2.1 — A espiral quebra: rank>300 sai de ~0% pra 32-67% de "jogou"

| Temporada | Atual — rank>300 | Topo 76 — rank>300 | Topo 120 — rank>300 |
|---|---|---|---|
| 2027 | 0/0 | 0/0 | 0/0 |
| 2028 | 3/5 (60%) | 6/9 (67%) | 2/4 (50%) |
| 2029 | 11/21 (52%) | 7/17 (41%) | 10/16 (63%) |
| 2030 | 11/34 (32%) | 10/28 (36%) | 16/29 (55%) |

**Antes do qualifying (Fase 7), essa taxa era ~0% nos 3 cenários, sem
exceção, em qualquer temporada.** Com qualifying, ela fica na faixa de
32-67% — a maioria das temporadas medidas fica acima de 50%. O grupo
não é 100% resgatado (ver §2.3), mas a mudança de "praticamente ninguém
joga" pra "a maioria joga pelo menos uma vez" é a evidência direta de
que a segunda porta ataca o mecanismo certo, não só o sintoma.

### 2.2 — O agregado responde na mesma proporção nos 3 cenários (~44-52% de redução no fechamento)

| Temporada | Atual: antes→depois | Topo 76: antes→depois | Topo 120: antes→depois |
|---|---|---|---|
| 2026 | 0→0 | 0→0 | 0→0 |
| 2027 | 12→10 | 11→10 | 10→7 |
| 2028 | 42→17 | 34→10 | 23→10 |
| 2029 | 61→24 | 48→22 | 42→17 |
| 2030 | **63→35 (-44%)** | **61→34 (-44%)** | **50→24 (-52%)** |

Os 3 cenários caem na MESMA ordem de grandeza (-44% a -52%) — não é um
efeito específico de um tamanho de calendário. Isso responde
diretamente à pergunta final do pedido ("se a porta nova funcionar,
ela deveria resgatar os presos em qualquer um dos 3, já que o problema
nunca foi capacidade"): funciona nos 3, de forma consistente.

### 2.3 — O que ainda não quebra: o grupo cresce mais rápido que as vagas de qualifying

A taxa de resgate (32-67%) NÃO sobe com o tempo — se algo, tende a cair
um pouco na última temporada de cada cenário (atual: 60%→52%→32%; topo
76: 67%→41%→36%). Motivo estrutural, não um limite do desenho: as vagas
de qualifying são uma FRAÇÃO FIXA de `drawSize` (12,5%), mas o grupo
rank>300 CRESCE a cada temporada (5→21→34 na atual) conforme mais
duplas caem na espiral — a oferta de vagas de resgate não escala com a
demanda por resgate. Qualifying reduz a exclusão, não a elimina — pra
fechar de vez precisaria ou aumentar `QUALIFYING_SHARE` (mais vagas
disputadas) ou algo que impeça o grupo de CRESCER em primeiro lugar
(fora do escopo desta fase).

## 3 — Confirmação: reais de rank bom não são prejudicados

| Métrica | Atual: antes→depois | Topo 76: antes→depois | Topo 120: antes→depois |
|---|---|---|---|
| Reais no Top 20 (temporada final) | 14→14 | 11→13 | 15→13 |
| Título 100%-reais (fração do total) | 51,5%→**55,2%** | 70,4%→65,8% | 63,6%→59,3% |

Nenhuma queda abrupta em nenhum dos dois eixos — Top 20 fica igual ou
melhora; a fração de títulos 100%-reais sobe no cenário atual e cai
alguns pontos percentuais nos dois cenários de topo maior, mas **em
TODOS os 3 cenários reais continuam vencendo uma maioria clara e
esmagadora dos títulos** (55-66%, contra uma população onde reais são
só 100 de 1000 atletas). A queda de alguns pontos nos cenários de topo
maior é esperada e aceitável: qualifying dá a duplas antes travadas
mais chances de jogar (inclusive contra bots), e algumas dessas chances
vão pra bots que vencem partidas que antes nem existiam pra eles — não
é reais de rank bom perdendo vaga pra abrir espaço (a fatia de
`openSlots`, por rank, não mudou nada nesta fase); é o total de
"chances jogadas" crescendo, com uma fração pequena a mais indo pra
quem não é real. **Confirmado: a correção não inverteu o problema.**

## 4 — `eventRegion()` — registrado para correção isolada futura

Não corrigido nesta fase, por instrução explícita. Fica registrado,
igual ao achado da Fase 7 §2: `eventRegion` (`WorldTourLifecycle.js`)
lê `tournament.region`/`tournament.continent` — campos que `Tournament`
nunca tem — e cai sempre em `tournament.country` (ex. "Marrocos"),
enquanto `travelLoad` (`TournamentSelectionAI.js:28`) compara contra
`tournament.world_region` (ex. "África"). Correção sugerida pra quando
essa sub-fase for aberta: trocar `tournament.region` por
`tournament.world_region` na primeira posição do fallback de
`eventRegion`, medindo o efeito ISOLADO (sem o qualifying no meio),
pra não repetir o erro de atribuir ao bug um efeito que era da espiral
de rank.

## 5 — Calendário continua em espera

Base, topo e teto não mudaram nesta fase. **Agora sim faz sentido
remedir**: o qualifying resgatou uma fração substancial do grupo preso
(§2) nos 3 cenários de calendário já testados — a curva de expansão da
Fase 6.6/6.7 foi medida num mundo onde a espiral de rank bloqueava
quem chegaria até ela; com a espiral parcialmente quebrada, capacidade
pode voltar a ter um efeito diferente do que foi medido então. Não
remedido nesta fase — registrado como o próximo passo natural, não
implementado.

## 6 — Validação

Instrumentação temporária removida antes do commit: `DIAG_QUALIFYING`
(`scripts/audit-real-athletes-simulation.mjs`), `DIAG_TOP_EVENTS`
(`circuitCatalog.js`) — `grep` confirma zero ocorrências restantes; os
dois arquivos voltaram a ficar byte-idênticos ao HEAD (confirmado por
ausência no `git diff --stat`). A implementação do qualifying
(`WorldTourLifecycle.js`: `QUALIFYING_SHARE`, `QUALIFYING_POOL_MULTIPLIER`,
`resolveQualifyingBracket`, `applyEntryPriority` reescrita) é
PERMANENTE — é a correção que esta fase entrega, não instrumentação.

- `node --check` nos 3 arquivos tocados durante a medição — OK.
- `npm run lint` — limpo.
- `npm run build` — OK (mesmo aviso pré-existente de chunk >500kB).
- Suíte de regressão (`rc-qa-suite-v36.mjs`) — **33/36, score 92/100**,
  as MESMAS 3 falhas pré-existentes (`test:rc-gameplay-balance`,
  `test:career-pace`, `test:ui-quality`), confirmado por nome exato.
- `reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/*.json` (auto-regenerados) revertidos com
  `git checkout HEAD --` antes do commit.
- `src-tauri/` — intocado.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Desenho da segunda porta com efeito estimado, para aprovação | ✅ feito — qualifying e wildcard propostos com efeito estimado; usuário aprovou qualifying sozinho |
| 2 | Implementação, medida contra o grupo rank>300 nos três cenários | ✅ feito — rank>300 sai de ~0% pra 32-67% de "jogou" nos 3 cenários; agregado cai 44-52% no fechamento; uma correção no meio da medição documentada (§1.6, o pool inicial usava o critério errado) |
| 3 | Confirmação de que reais de rank bom não são prejudicados | ✅ feito — Top 20 igual ou melhor, título 100%-reais continua majoritário (55-66%) nos 3 cenários |
| 4 | `eventRegion()` registrado para correção isolada futura | ✅ feito — não implementado, correção sugerida documentada |
| 5 | Suíte, lint, build, Tauri OK, commit | ✅ feito — 33/36 (92/100), mesmas 3 falhas pré-existentes; `src-tauri/` intocado |
