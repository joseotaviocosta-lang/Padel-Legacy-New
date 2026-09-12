# Fase 7.2 — Diagnosticar o afunilamento, depois remedir o calendário

> Pré-requisito: Fase 7.1 implementou qualifying (segunda porta de
> entrada) e mediu que rank>300 sai de ~0% pra 32-67% de "jogou", sem
> prejudicar reais de rank bom — mas a taxa de resgate afunila na
> temporada final de cada cenário (ex. atual: 60%→52%→32%). Ver
> [FASE-7.1-RELATORIO.md](FASE-7.1-RELATORIO.md). Esta fase diagnostica
> a CAUSA do afunilamento (duas hipóteses não excludentes) antes de
> propor qualquer ajuste de vagas, e remede a curva de calendário agora
> que o qualifying está em vigor.

## 1 — Diagnóstico do afunilamento

Rodadas de 5 temporadas, população oficial (900 procedurais, 100 reais),
com `DIAG_TAPER=1` instrumentando a identidade (não só a contagem) do
grupo rank>300 no início de cada temporada, nos 3 cenários de
calendário (atual, topo 76, topo 120), todos com o qualifying da Fase
7.1 em vigor.

### 1.1 — A métrica planejada pra hipótese (A) não funcionou — e por quê

O plano original testava (A) comparando o tamanho do grupo por
temporada contra o total de duplas DISTINTAS que já passaram por ele
desde o início (`cumulativeGT300Ids`, união). Essa métrica saturou
IMEDIATAMENTE em 100 (o total de reais) já na temporada 1, nos 3
cenários — porque antes de qualquer torneio ser disputado, TODAS as 100
duplas reais começam sem ranking (rank>300 por padrão). Não há como
essa união crescer além de 100, e ela não distingue "gente que caiu
uma vez e nunca mais" de "gente que está entrando e saindo o tempo
todo" — exatamente a contaminação do bootstrap da temporada 1 já
prevista antes de rodar. Essa parte do desenho não é aproveitável como
está.

Em vez disso, decompus o grupo de cada temporada usando os números
brutos que a instrumentação registrou (tamanho do grupo, resgatadas na
temporada anterior, quantas dessas caíram de volta): todo elemento do
grupo numa temporada X ou (i) já estava no grupo em X-1 e nunca foi
resgatado (**carryover não-resgatado** = tamanho do grupo em X-1 menos
resgatadas em X-1), ou (ii) foi resgatado em X-1 e caiu de volta
(**reincidente**), ou (iii) não estava no grupo em X-1 e passou a estar
agora (**caiu pela primeira vez**, só deduzível por resto: tamanho do
grupo em X menos as duas categorias anteriores).

### 1.2 — Decomposição temporada a temporada

| Cenário | Temporada | Grupo (início) | Carryover não-resgatado | Reincidente (resgatado antes, caiu de volta) | Caiu pela 1ª vez | % caiu pela 1ª vez |
|---|---|---|---|---|---|---|
| Atual | 2028 (T3) | 5 | — | — | — | — |
| Atual | 2029 (T4) | 21 | 2 | 3 | 16 | 76% |
| Atual | 2030 (T5) | 34 | 10 | 10 | 14 | 41% |
| Topo 76 | 2028 (T3) | 9 | — | — | — | — |
| Topo 76 | 2029 (T4) | 17 | 3 | 6 | 8 | 47% |
| Topo 76 | 2030 (T5) | 28 | 10 | 7 | 11 | 39% |
| Topo 120 | 2028 (T3) | 4 | — | — | — | — |
| Topo 120 | 2029 (T4) | 16 | 2 | 2 | 12 | 75% |
| Topo 120 | 2030 (T5) | 29 | 6 | 9 | 14 | 48% |

(Temporada 2026 é o bootstrap universal — 100/100 antes de qualquer
torneio. Temporada 2027 zera nos 3 cenários — todo mundo joga pelo
menos uma vez na temporada 1. O grupo só recomeça a existir a partir da
temporada 3, quando o primeiro ciclo completo de "não jogou" já
aconteceu.)

**Os dois mecanismos coexistem**: 39-76% do grupo em cada temporada é
gente caindo pela primeira vez (evidência a favor de A — o grupo tem
entrada nova constante, não é um núcleo fixo se realimentando sozinho).
Mas a fração restante — gente que JÁ tinha sido resgatada — quase
sempre volta: ver 1.3.

### 1.3 — O sinal dominante: reincidência de 90-100%

| Cenário | Transição | Resgatadas na temporada X | Ainda em rank>300 no início de X+1 | % |
|---|---|---|---|---|
| Atual | T3→T4 | 3 | 3 | **100%** |
| Atual | T4→T5 | 11 | 10 | **90,9%** |
| Topo 76 | T3→T4 | 6 | 6 | **100%** |
| Topo 76 | T4→T5 | 7 | 7 | **100%** |
| Topo 120 | T3→T4 | 2 | 2 | **100%** |
| Topo 120 | T4→T5 | 10 | 9 | **90%** |

**Seis transições medidas, três cenários de calendário completamente
diferentes (atual/76/120 torneios de topo), e o resultado não varia:
90-100% de reincidência, sempre.** De cada dupla resgatada pelo
qualifying numa temporada, praticamente nenhuma segue com rank<300 na
temporada seguinte. Uma vitória de qualifying (ou mesmo o torneio
principal subsequente) não rende ranking suficiente pra tirar a dupla
da faixa de risco por mais que um ciclo.

### 1.4 — Por que (A) não é suficiente sozinha: capacidade maior não muda a reincidência

Se a causa fosse só capacidade insuficiente de vagas de qualifying
(hipótese A pura), caberia esperar que o cenário topo 120 — com chaves
bem maiores e, proporcionalmente, mais vagas de qualifying em termos
absolutos — reduzisse a reincidência. Não reduz: 100%/90% em topo 120
contra 100%/90,9% no atual. O tamanho do grupo na T5 também não cai
proporcionalmente ao aumento de calendário (34 no atual → 28 no topo
76 → 29 no topo 120 — variação pequena e não-monotônica, dentro do
ruído de uma seed única). **Capacidade resolve limiar de entrada
inicial (Fase 7.1), mas não muda o quanto uma dupla resgatada consegue
segurar o ganho.**

### 1.5 — Qual domina, e por que isso importa pra ordem de qualquer correção futura

**(B) domina como causa raiz; (A) descreve um sintoma que se realimenta
de (B).** O raciocínio: mesmo que a fração "caiu pela primeira vez"
(1.2) seja grande, ela é constante ao longo do tempo — é o preço
estrutural de rank ser relativo (documentado na Fase 7: quem não joga
cai porque quem joga sobe, então sempre vai existir gente cruzando o
limiar pela primeira vez enquanto o sistema existir). O que MUDA a
trajetória do grupo — se ele estabiliza, encolhe ou continua crescendo
— é se quem já foi resgatado FICA fora. Hoje não fica: 90-100% volta.
Isso significa que aumentar só as vagas de qualifying (correção de A)
processaria mais gente pela porta, mas quase todo mundo que passasse
voltaria a cair — mais vagas = fila giratória maior, não menos gente
presa no final. Uma correção em (B) primeiro, por outro lado, reduz
diretamente a coluna "reincidente" da tabela 1.2 nas temporadas
seguintes, o que por sua vez reduz o tamanho do grupo a cada temporada
— inclusive tornando qualquer correção futura em (A) mais eficaz
(menos gente reincidindo = vagas de qualifying sobrando pra atender
gente nova, em vez de reprocessar quem já passou).

### 1.6 — Correções propostas (não implementadas) — efeito estimado

**Hipótese A — escalar `QUALIFYING_SHARE`/`QUALIFYING_POOL_MULTIPLIER`
com o tamanho do grupo rank>300.** Efeito estimado: baixo-médio e
decrescente. Ajudaria a fração "caiu pela primeira vez" (39-76% do
grupo) a ter acesso mais cedo, mas não muda a taxa de reincidência
observada (90-100%) — o resultado provável é mais gente ENTRANDO no
resgate por temporada sem mudar a proporção que volta a cair. Sem (B),
a expectativa é que o tamanho do grupo continue crescendo, só que
processando mais gente por ele.

**Hipótese B — tornar o resgate "valer mais". Duas variantes:**

- **(B1) Bônus de pontos de ranking pro vencedor da chave de
  qualifying** (ex.: pontuar como se tivesse alcançado uma fase real
  do torneio principal, não só "classificou"). Efeito estimado:
  incremento único, provavelmente insuficiente sozinho — se o problema
  é que UM torneio não rende pontos suficientes, um bônus pontual
  ajuda mas ainda é um evento isolado; a dupla volta a ficar parada
  logo depois se não emendar outro torneio.
- **(B2, recomendada) Janela de prioridade elevada por N semanas após
  vencer o qualifying** — em vez de (ou além de) pontos extras, a
  dupla ganha entrada garantida (nível `reservedDirectSlots`, sem
  precisar requalificar) por um número fixo de torneios/semanas
  seguintes. Efeito estimado: mais alto, porque ataca a causa
  mecânica direta — o problema não é só ganhar pouco rank de um único
  resultado, é não conseguir emendar aparições suficientes pra
  acumular rank antes de a prioridade normal (por rank) voltar a
  barrá-la. Dar 3-4 torneios seguidos de entrada garantida multiplica
  as chances de pontuar por 3-4x nesse intervalo, o que plausivelmente
  reduziria a reincidência de ~90-100% pra uma fração bem menor — mas
  isso é uma estimativa a validar com uma rodada de medição dedicada,
  não um resultado medido nesta fase.

**Recomendação de ordem**: implementar (B), preferencialmente (B2),
ANTES de qualquer ajuste de escala em (A) — corrigir (A) primeiro
arrisca medir/dimensionar capacidade sobre uma taxa de reincidência
que uma correção em (B) mudaria de qualquer forma, exigindo remedir
(exatamente o risco que esta fase foi desenhada pra evitar, ver ordem
dos itens no pedido original). Depois de (B) medido, reavaliar se (A)
ainda é necessária ou se a folga liberada pela queda de reincidência já
resolve o crescimento do grupo.

## 2 — Curva de calendário remedida com qualifying em vigor

**Não precisou de rodada nova.** A Fase 7.1, item 2, já rodou os MESMOS
3 cenários (atual, topo 76, topo 120) com o qualifying em vigor, pra
medir o resgate do grupo rank>300 — os números agregados de ociosos
por temporada são um subproduto direto dessa mesma medição, prontos
pra comparar com a Fase 6.7 sem precisar rodar de novo.

### 2.1 — Nível: -44% a -52% no fechamento, nos 3 cenários

| Cenário | Sem qualifying (Fase 6.7) | Com qualifying (Fase 7.1) | Redução no fechamento |
|---|---|---|---|
| Atual | 0,12,42,61,**63** | 0,10,17,24,**35** | **-44,4%** |
| Topo 76 | 0,11,34,48,**61** | 0,11,10,22,**34** | **-44,3%** |
| Topo 120 | 0,10,23,42,**50** | 0,7,10,17,**24** | **-52,0%** |

### 2.2 — Inclinação: finalmente muda de sinal num cenário

| Cenário | Incrementos sem qualifying | Incrementos com qualifying |
|---|---|---|
| Atual | 12, 30, 19, 2 | 10, 7, 7, 11 |
| Topo 76 | 11, 23, 14, 13 | 11, **-1**, 12, 12 |
| Topo 120 | 10, 13, 19, 8 | 7, 3, 7, 7 |

**Confirmado — a inclinação muda de sinal no cenário topo 76** (temporada
2→3: 11 pra **-1**, uma queda real no número absoluto de ociosos, não
só uma desaceleração). Nenhuma correção anterior (prioridade por espera,
prioridade de entrada, fallback de tier, dobrar/triplicar o calendário
sozinho) conseguiu isso — todas produziam incrementos sempre positivos,
só de magnitude variável. Nos outros 2 cenários a inclinação não vira
negativa, mas fica muito mais achatada e consistente (sem o pico-e-
queda dramático de antes, ex. atual: 12→30→19→2 vira 10→7→7→11 — sem o
salto de 30).

## 3 — Capacidade e qualifying se somam — e capacidade rende MAIS com o qualifying em vigor

**Respondido: somam, e de forma mais favorável do que antes.** Comparando
o efeito de ir do calendário atual pro topo 120:

| | Sem qualifying (Fase 6.7) | Com qualifying (Fase 7.1) |
|---|---|---|
| Atual → Topo 120 | 63 → 50 | 35 → 24 |
| Redução só por capacidade | 20,6% | **31,4%** |

**A capacidade rende uma redução MAIOR (31,4% vs. 20,6%) depois que o
qualifying já resolveu parte do problema.** Isso é o oposto do que a
Fase 6.7 (item 3, o cenário combinado saindo pior que os isolados)
fazia temer — lá, combinar duas correções de DISTRIBUIÇÃO (base
expandida + topo expandido) interagia mal. Aqui, combinar uma correção
de MECANISMO (qualifying, que muda QUEM disputa uma vaga) com uma
correção de VOLUME (capacidade, que muda QUANTAS vagas existem) não só
soma como POTENCIALIZA — faz sentido estruturalmente: qualifying dá
ao grupo preso uma chance de competir; mais capacidade dá mais chances
POR SEMANA pra essa mesma competição acontecer. As duas atacam
gargalos diferentes (quem pode competir vs. quantas vezes por semana
há uma disputa), e por isso não competem entre si pelo mesmo espaço de
melhoria — ao contrário de duas correções de distribuição que disputam
o MESMO espaço (vagas fixas, só reordenadas).

**Conclusão prática**: vale investir nos dois — calendário maior
continua valendo a pena, agora com um retorno até MELHOR do que antes
do qualifying existir. O dimensionamento de calendário NÃO se resolveu
sozinho com a porta certa no lugar certo (a leitura B do pedido) — as
duas frentes se reforçam (a leitura A).

## 4 — Validação

- 3 rodadas de 5 temporadas cada (população oficial: 900 procedurais,
  100 reais; mesma seed `official-900-100-s1` usada desde a Fase 6.5),
  cenários atual/topo 76/topo 120, `DIAG_TAPER=1` (mais `DIAG_TOP_EVENTS`
  nos dois cenários de topo) — todas concluídas 5/5 sem erro.
- `DIAG_TAPER` revertido de `scripts/audit-real-athletes-simulation.mjs`
  e `DIAG_TOP_EVENTS_OVERRIDE` revertido de `src/lib/circuitCatalog.js`;
  confirmado por `grep` (zero ocorrências) e `git diff --stat` (os dois
  arquivos idênticos ao HEAD). Código permanente das fases anteriores
  (retomada de checkpoint da Fase 6.5, qualifying da Fase 7.1)
  preservado sem alteração.
- `npm run lint` — limpo.
- `npm run build` — sucesso.
- `node scripts/rc-qa-suite-v36.mjs` — 33/36, score 92/100, as mesmas 3
  falhas pré-existentes (`test:rc-gameplay-balance`, `test:career-pace`,
  `test:ui-quality`), sem relação com este trabalho — mesma baseline
  desde a Fase 6.5.
- `src-tauri/` sem alterações.
- Arquivos de relatório auto-regenerados pela suíte
  (`reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/RC-SPRINT-1-GAMEPLAY-BALANCE.json`,
  `reports/rc-sprint-1/career-simulation.json`) revertidos para o
  HEAD.
- Diretório de scratch (`scratchpad/f72/`) removido.
- Árvore limpa ao final, exceto por este relatório.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Diagnóstico do afunilamento, (A)/(B) separados, efeito estimado | ✅ feito — (B) domina, reincidência de 90-100% em 6/6 transições medidas |
| 2 | Curva de calendário remedida, comparada às Fases 6.7 e 7.1 | ✅ feito — reusou dados da Fase 7.1, sem rodada nova |
| 3 | Resposta sobre soma ou dominância | ✅ feito — capacidade e qualifying se somam (31,4% vs. 20,6%) |
| 4 | Suíte, lint, build, Tauri OK, commit | ✅ feito |
