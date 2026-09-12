# Fase 6.7 — O experimento simétrico: expandir o topo

> Pré-requisito: Fase 6.6 mediu que a base responde fortemente à
> expansão de calendário (exclusão real no Silver: 69%→46%→22%), mas
> os tiers fechados (Gold-Crown) não respondem — porque
> `OPEN_TIER_CEILING=150` tranca a maioria das duplas reais
> estabelecidas fora da base (só 34 de ~76 tentam Bronze) e a
> capacidade desses tiers nunca mudou no experimento. Ver
> [FASE-6.6-RELATORIO.md](FASE-6.6-RELATORIO.md). Esta fase roda o
> espelho exato — expande o TOPO com a base fixa em 40 — pra decidir se
> o gargalo é capacidade do topo ou o próprio teto de acesso.

## 1 — A assimetria de desenho, e a correção do registro da Fase 5.6

### 1.1 — A assimetria

`OPEN_TIER_CEILING=150` (Fase 5.2/5.4/5.5) tira qualquer dupla já
ranqueada no top-150 da base — ela SÓ pode competir em Gold-Crown. A
Fase 5.6 (Candidato B), na MESMA janela de decisões, apertou os cortes
do topo (`minRanking` Gold 800→450, Platinum 500→320, Masters
300→230) — reduzindo a razão demanda/capacidade de 9,6-1,3× pra
5,0-2,0×, mas mantendo Gold como o tier de razão mais alta do circuito
inteiro. **As duas decisões empurram na MESMA direção — mais gente
saindo da base, capacidade do topo que não cresce na mesma proporção —
e nenhuma das duas foi medida em conjunto com a outra.** A Fase 5.5
fixou o teto olhando só pra composição da base (quem entra em
Bronze/Silver); a Fase 5.6 recalibrou o topo olhando só pra
títulos/presença de curto prazo em Elite/Crown. Nenhuma das duas
mediu o que acontece com uma dupla real que o teto tira da base e
que a escada do topo, ao mesmo tempo, torna mais difícil de entrar.

### 1.2 — Correção do registro: `Gold ~5×` não é mais "de propósito, sem problema"

A Fase 5.6 (§1.1, §4.3, Resumo executivo) classificou `Gold ~5×` como
aceitável "de propósito", apoiada numa checagem de títulos/presença de
curto prazo em Elite/Crown (títulos idênticos antes/depois, fração
real do campo subindo). **Essa classificação não se sustenta mais.**
A Fase 6.6 mediu, com instrumentação que não existia na Fase 5.6, que
a sobreposição de ociosos reais entre temporadas adjacentes sobe de 0%
pra 84% até a temporada 5, e que 68 de 100 reais ficam sem jogar NENHUM
torneio inteiro na temporada final. Títulos idênticos e fração real em
alta são inteiramente compatíveis com uma MINORIA pequena e estável de
duplas reais concentrando toda a presença enquanto a MAIORIA fica de
fora ano após ano — a checagem da Fase 5.6 não tinha como distinguir
essas duas situações, porque olhava só pra um retrato (títulos,
presença), nunca pra sobreposição longitudinal entre temporadas
(instrumentação que só nasceu na Fase 6.5). **Não é um erro de cálculo
da Fase 5.6 — é uma lacuna de instrumentação da época, preenchida
tarde.** Registrado como correção formal no próprio
[FASE-5.6-RELATORIO.md](FASE-5.6-RELATORIO.md) (banner no topo do
arquivo). A pergunta que fica em aberto — e que o item 2 abaixo decide
— é se Gold ~5× é sintoma de capacidade insuficiente no topo (resolvido
por mais eventos) ou do teto de 150 em si (não resolvido só por mais
eventos).

## 2 — O experimento simétrico: expandir o topo, base fixa em 40

Duas rodadas completas de 5 temporadas, população oficial, mesma seed,
mundo limpo (item 2/3 da Fase 6.5 permanentes). `TIER_EVENTS_PER_YEAR`
sobrescrito só em Gold/Platinum/Masters, proporção 4:3:5 preservada
(ver §4). Elite/Crown intocados nos dois cenários.

### 2.1 — Ociosos reais por temporada: melhora, mas só acima de um certo tamanho

| Temporada | Atual (topo 38) | Topo ~76 | Topo ~120 |
|---|---|---|---|
| 2026 | 0 | 0 | 0 |
| 2027 | 12 | 11 | 10 |
| 2028 | 42 | 34 | 23 |
| 2029 | 61 | 48 | 42 |
| 2030 | **63** | **61** | **50** |
| Incrementos | 12,30,19,2 | 11,23,14,13 | 10,13,19,8 |

**Achado que não esperava**: dobrar o topo (38→76) produz uma melhora
GRANDE nas temporadas intermediárias (temporada 3: 42→34, -19%;
temporada 4: 61→48, -21%) que **quase desaparece no fechamento**
(temporada 5: 63→61, -3%, dentro do ruído). Quase TRIPLICAR o topo
(38→120) produz uma melhora que SE MANTÉM até o fim (63→50, **-21%
durável**). A diferença não é de grau, é de tipo — 76 atrasa a subida;
120 genuinamente reduz o nível final. Isso contraria a leitura
"quanto mais, melhor, com retornos decrescentes" que a Fase 6.6 sugeriu
pra base — aqui existe algo mais parecido com um LIMIAR: uma expansão
pequena não é suficiente pra superar o que quer que trave os reais no
topo (o teto, se a pergunta do item 4 apontar pra ele), só uma expansão
grande consegue.

### 2.2 — Por tier: Gold, Platinum e Masters respondem — mas olhe pra fração REAL, não só a agregada

| Tier | Exclusão real: atual/76/120 |
|---|---|
| Gold | 45,1% / 35,2% / **21,0%** |
| Platinum | 37,1% / 25,9% / **19,7%** |
| Masters | 29,8% / 21,6% / **9,3%** |
| Elite (intocado) | 31,3% / 28,9% / 0%* |
| Crown (intocado) | 51,9% / 55,6% / 47,7% |

*Elite chegou a 0% de exclusão real no cenário 120 — mas com só 59
duplas reais distintas tentando (a demanda migrou pra Gold/Platinum/
Masters, que ficaram mais atraentes por terem mais vagas), não porque
Elite ficou mais fácil por si só.

Ao contrário do experimento da base (Fase 6.6, onde Gold-Crown ficavam
essencialmente PARADOS independente do tamanho da base), aqui os três
tiers que receberam mais capacidade (Gold, Platinum, Masters)
respondem de forma clara e monotônica — a exclusão real cai
consistentemente do cenário atual pro 76 pro 120. **Isso já é uma
diferença qualitativa importante em relação ao item 4 da Fase 6.6**:
lá, mexer na capacidade ERRADA (a base, quando a maioria dos reais está
trancada fora dela) não ajudava; aqui, mexer na capacidade CERTA (onde
os reais realmente competem) ajuda de verdade, pelo menos nos tiers
mexidos.

### 2.3 — Sobreposição entre temporadas: a mesma convergência, em todos os tamanhos

| Transição | Atual (topo 38) | Topo 76 | Topo 120 |
|---|---|---|---|
| 2027→2028 | 28,3% | 17,6% | 21,7% |
| 2028→2029 | 64,6% | 62,5% | 45,2% |
| 2029→2030 | 83,8% | 70,5% | **74,0%** |

**Mesmo no cenário que mais ajuda (120), a sobreposição entre as
últimas duas temporadas ainda chega a 74%** — o núcleo de exclusão
estável que a Fase 6.6 achou não é um artefato do tamanho atual do
calendário; ele aparece, em menor escala, mesmo com o topo quase
triplicado. Reduz o NÚMERO de reais presos nesse núcleo, não elimina o
padrão de convergência em si.

## 3 — O cenário combinado (base 80 + topo 76)

Rodada completa de 5 temporadas, mesma seed, `DIAG_BASE_EVENTS=80` +
`DIAG_TOP_EVENTS=76` simultâneos.

### 3.1 — Resultado inesperado: o combinado é PIOR que qualquer um dos dois isolados

| Temporada | Base 80 isolado (Fase 6.6) | Topo 76 isolado | **Combinado (80+76)** |
|---|---|---|---|
| 2026 | 0 | 0 | 0 |
| 2027 | 12 | 11 | 11 |
| 2028 | 27 | 34 | **24** (melhor que os dois!) |
| 2029 | 37 | 48 | **51** (pior que os dois) |
| 2030 | **51** | **61** | **62** (pior que os dois) |

Título 100%-reais (fração do total): base80 isolado 45,6% (Fase 6.6);
topo 76 isolado 70,4%; **combinado 55,6%** — mais baixo que o topo 76
isolado. Reais no Top 20 (temporada 5): base80=12, topo76=11,
**combinado=11**.

**Isto é exatamente o tipo de interação não-óbvia que o pedido avisou
que podia existir.** Na temporada 3, o combinado parecia somar os dois
benefícios (24, melhor que os 27 e 34 isolados) — mas a partir da
temporada 4 essa vantagem não só desaparece como INVERTE: o combinado
termina quase no nível do cenário SEM NENHUMA expansão (62 vs. 63
original), pior que expandir só a base (51) ou só o topo (61) sozinhos.
**Somar as duas expansões não somou os benefícios — apagou a maior
parte dos dois.**

### 3.2 — Por que? Hipótese, não conclusão fechada

Por tier, a fração de exclusão REAL do combinado não é dramaticamente
pior que dos isolados (Gold 36,4% combinado vs. 35,2%/21,0% dos
isolados de topo; Bronze 48,6% combinado vs. 46,1% do base80 isolado) —
o problema não aparece claramente em NENHUM tier isolado, só no
agregado "nunca jogou em lugar nenhum". Hipótese mais provável: com
MAIS calendário em TODOS os lados ao mesmo tempo, `chooseTournament`
tem mais opções simultaneamente elegíveis toda semana — o que deveria
ajudar, mas pode estar espalhando as escolhas de forma menos previsível
entre duplas reais específicas, fazendo mais duplas terem *alguma*
notada de exclusão em *algum* tier ao longo do ano, em vez de um número
menor de duplas concentrando toda a exclusão em tiers específicos.
**Não investigado a fundo — é uma hipótese plausível, não confirmada.**
Também não descarto que parte do efeito seja variância de seed única:
esta medição é UMA rodada por cenário, não uma média de várias seeds —
o achado é real (a direção da diferença é grande demais pra ser só
ruído: 62 vs. 50-51 é uma diferença de ~20%), mas o MECANISMO exato por
trás dele fica como pergunta em aberto.

### 3.3 — A lição prática

**Medir só os cenários isolados teria recomendado expandir os dois ao
mesmo tempo — e essa recomendação teria sido errada.** Confirma
exatamente a preocupação que motivou este item: a configuração que
"parece" melhor somando os dois eixos isoladamente não é a que
realmente rodaria melhor combinada. Qualquer decisão de dimensionamento
de calendário precisa medir a COMBINAÇÃO específica que vai pro
circuito real, não os eixos separados.

## 4 — Verificação do teto de código antes de rodar

Confirmado por leitura de código e por smoke test ANTES de lançar as
rodadas completas, como pedido (a Fase 5 só descobriu o teto DEPOIS de
rodar o cenário de 250 sem checar antes).

`TIER_EVENTS_PER_YEAR` atual: Bronze 24, Silver 16 (base=40); Gold 8,
Platinum 6, Masters 10 (topo de razão alta, soma 24), Elite 10, Crown 4
(intocados, soma 14, topo-fixo=38); + 2 finais únicos. Total atual:
40+38+2=**80** (bate com o "80 eventos/ano" já documentado).

| Cenário | O que muda | Total/temporada | Margem até o teto (~240) |
|---|---|---|---|
| Topo atual (38) | — (baseline, dado já existe da Fase 6.6) | 80 | folga ampla |
| Topo ~76 | Gold 8→21, Platinum 6→15, Masters 10→26 (soma 24→62, proporção 4:3:5 preservada); Elite/Crown intocados | **118** (confirmado por smoke test) | folga ampla |
| Topo ~120 | Gold 8→35, Platinum 6→27, Masters 10→44 (soma 24→106) | **162** | folga ampla (~78 de margem) |
| Combinado (base 80 + topo 76) | as duas sobreposições juntas (`DIAG_BASE_EVENTS=80 DIAG_TOP_EVENTS=76`) | **158** (confirmado por smoke test) | folga ampla |

Todos os 4 cenários (incluindo o combinado) ficam **confortavelmente
abaixo dos ~240 torneios/temporada** do teto de código
(`Tournament.list('-start_date', 300)` + horizonte de 15 meses,
achado #32) — a margem mais apertada (topo ~120, 162/240 = 67,5% do
teto) ainda sobra ~78 torneios/temporada de folga. Nenhum cenário desta
fase repete o erro da Fase 5 (cenário 250 rodado sem checar o teto
antes).

## 5 — Resposta explícita ao item 2.3, e preparação da reavaliação

### A pergunta binária do pedido não tem uma resposta binária

"Os reais ociosos caem?" — **depende de quanto se expande, e cai menos
do que se esperaria mesmo no melhor caso.** Não é "capacidade resolve"
nem "o teto é a causa única" — é as duas coisas, numa proporção que
esta medição não separa completamente:

- **Capacidade importa de verdade**: dobrar o topo não segura (a
  melhora quase desaparece até a temporada 5), mas quase triplicar
  segura uma queda de ~21% (63→50). Isso não seria possível se o teto
  fosse uma parede absoluta que nenhuma capacidade atravessa — então o
  teto sozinho não é "a causa única".
- **Mas o teto (ou algo ligado a ele) ainda limita o quanto a
  capacidade ajuda**: mesmo no cenário de maior capacidade (120,
  quase triplicando o topo), **50 de 100 reais ainda ficam sem jogar
  NENHUM torneio na temporada 5** — metade da população real, mesmo
  depois de quase triplicar onde ela compete. E a sobreposição entre
  temporadas ainda sobe a 74% nesse mesmo cenário (§2.3) — o núcleo de
  exclusão estável persiste, só menor. Se fosse só falta de vagas, mais
  vagas deveria dissolver esse núcleo, não só encolhê-lo.
- **E o cenário combinado (§3) mostra que simplesmente "dar mais
  capacidade em todo lugar" não é a resposta** — ele reverteu a maior
  parte do ganho dos dois isolados.

**Registrado como conclusão honesta**: capacidade do topo tem efeito
real e mensurável, mas não é suficiente sozinha pra resolver a
exclusão — mesmo na configuração mais generosa medida aqui. Isso torna
o `OPEN_TIER_CEILING=150` um suspeito que continua de pé, não
descartado pela medição de capacidade.

### O que uma reavaliação do teto exigiria (preparado, não implementado)

Por instrução explícita, nenhuma mudança em `OPEN_TIER_CEILING` nesta
rodada. Levantamento do que precisaria ser refeito:

1. **A Fase 5.5 escolheu 150 comparando com um teto de 100** ("100
   solta ~8 duplas reais de rank 100-150 (fortes) na base — 150 é
   claramente melhor"), num mundo onde o corte sem fila dos tiers
   fechados (achado da Fase 6.4, corrigido só na Fase 6.5), a
   prioridade por espera (Fase 6.2) e o fallback de tier (Fase 6.5)
   AINDA NÃO EXISTIAM. A comparação 100-vs-150 precisaria ser refeita
   no mundo atual — é possível que um teto diferente (mais alto? mais
   baixo?) produza um resultado diferente agora que os mecanismos que
   decidem QUEM ENTRA no topo já não são os mesmos de então.
2. **Valores a testar, se a reavaliação for aprovada**: um teto MENOR
   (ex. 100 ou 75) soltaria mais duplas reais de rank médio pra base,
   testando diretamente se isso reduz a exclusão agregada sem recriar o
   vazamento de elite que a Fase 5.2 documentou (Coello/Tapia
   entrando em Bronze com teto=800) — o risco a medir explicitamente
   seria esse vazamento, não só o efeito sobre ociosos. Um teto MAIOR
   testaria o oposto: aceitar mais concentração de força na base em
   troca de tirar pressão do topo.
3. **Medição obrigatória antes de qualquer mudança**: sobreposição de
   ociosos entre temporadas (a métrica que só existe desde a Fase 6.5)
   — a Fase 5.5 nunca teve essa lente; qualquer reavaliação do teto
   precisa medir com ela desde o primeiro cenário, não descobrir tarde
   como aconteceu aqui.
4. **Não descartar a combinação**: dado o achado do item 3, testar um
   teto diferente ISOLADO (só o teto, calendário atual) antes de testar
   teto + calendário maior juntos — a mesma lição de "meça a combinação
   que vai rodar de verdade" se aplica de novo.

## 6 — Validação

Instrumentação temporária desta fase removida antes do commit:
`DIAG_CAPACITY`/`getDiagCapacitySnapshot` (`WorldTourLifecycle.js` +
import no harness), `DIAG_TOP_EVENTS`/`DIAG_TOP_EVENTS_OVERRIDE`,
`DIAG_BASE_EVENTS`/`DIAG_BASE_EVENTS_OVERRIDE` (`circuitCatalog.js`) —
`grep` confirma zero ocorrências restantes; os 3 arquivos de código
tocados voltaram a ficar byte-idênticos ao HEAD (confirmado por
ausência no `git diff --stat`). Nenhuma correção permanente foi
implementada nesta fase (por instrução — `OPEN_TIER_CEILING` segue
`150`, nenhuma mudança em `circuitCatalog.js`/`EntryManager.js`); a
única mudança que sobrevive no código é nenhuma — só os dois relatórios
(`FASE-5.6-RELATORIO.md` com o banner de correção, `FASE-6.7-RELATORIO.md`
novo).

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
| 1 | Assimetria registrada e classificação do `Gold ~5×` corrigida | ✅ feito — banner de correção adicionado em `FASE-5.6-RELATORIO.md` |
| 2 | Curva de expansão do topo nos três cenários, sem escolher o número | ✅ feito — topo 76 (2×) apenas atrasa a subida (63→61, quase sem efeito no fechamento); topo 120 (~3,2×) segura uma queda durável de 21% (63→50), mas ainda deixa metade da população real ociosa |
| 3 | Cenário combinado medido | ✅ feito — achado principal da fase: base 80 + topo 76 juntos (62) termina PIOR que qualquer um dos dois isolados (51 e 61), quase no nível do cenário sem nenhuma expansão (63) — interação não-óbvia confirmada, mecanismo exato não totalmente explicado (hipótese registrada, não fechada) |
| 4 | Resposta explícita à pergunta do item 2.3 | ✅ feito — nem "só capacidade" nem "só o teto": capacidade do topo tem efeito real mas só acima de um limiar, e mesmo no melhor cenário medido metade dos reais continua ociosa e a sobreposição entre temporadas ainda chega a 74% — o teto continua sendo suspeito, reavaliação preparada (não implementada) |
| 5 | Suíte, lint, build, Tauri OK, commit | ✅ feito — 33/36 (92/100), mesmas 3 falhas pré-existentes; `src-tauri/` intocado |
