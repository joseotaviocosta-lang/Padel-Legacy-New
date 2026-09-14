# Fase 7 — Encontrar o mecanismo antes de dimensionar qualquer coisa

> Pré-requisito: Fase 6.7 mediu que a exclusão sobrevive a prioridade
> por espera (6.2), prioridade de entrada (6.5), fallback de tier
> (6.5), dobrar o topo e até quase triplicar o topo — mesmo no cenário
> mais generoso, metade dos reais fica ociosa e a sobreposição entre
> temporadas converge a 74%. Ver
> [FASE-6.7-RELATORIO.md](FASE-6.7-RELATORIO.md). Esta fase é
> diagnóstico puro (como a 6.4 e a 6.6) — nenhum parâmetro de circuito
> muda até o mecanismo estar identificado.

## 1 — Comparação direta das duas populações: RANK separa de forma quase perfeita

Instrumentação nova (`DIAG_POPULATION`, no harness): ao final de cada
rodada, classifica cada dupla real como `nucleo_ocioso` (ociosa nas 2
últimas temporadas — a mesma definição de sobreposição da Fase 6.6) ou
`ativo`, e despeja rank (`ranking_position`), OVR, idade, país,
`current_region` e dias como dupla (`ai_partnership_start_date` até a
data atual). Rodado nas 3 rodadas de 5 temporadas completas da Fase
6.7 (atual/40, topo 76, topo 120) — mesma seed, população oficial.

### 1.1 — Um único limiar de rank classifica quem joga com 98,8% de acerto, nos 3 cenários

| Cenário | Núcleo ocioso: rank médio | Ativo: rank médio | Melhor limiar de rank | Acurácia |
|---|---|---|---|---|
| Atual (40/38) | 789,8 | 193,0 | 600 | **98,8%** |
| Topo 76 | 801,3 | 250,3 | 650 | **98,8%** |
| Topo 120 | 799,9 | 167,9 | 670 | **98,8%** |

Em TODOS os 3 cenários, um único limiar de rank (na faixa 600-670)
classifica corretamente 85 de 86 duplas reais (98,8%) como
"núcleo ocioso" ou "ativa" — **nenhum outro eixo testado chega perto
dessa limpeza**:

| Eixo | Núcleo ocioso vs. ativo (média, 3 cenários) | Separa de forma limpa? |
|---|---|---|
| **Rank** | ~797 vs. ~204 | **Sim — 98,8% de acerto com 1 limiar** |
| Dias como dupla | ~584 vs. ~983 | Parcial — ativo tem parcerias ~70% mais antigas, mas a distribuição se sobrepõe bastante |
| OVR | ~80,9 vs. ~85,3 | Fraco — diferença real (4-5 pontos) mas pequena demais pra separar sozinha |
| Idade | ~30,3 vs. ~29,7 | Não separa — praticamente idêntico |
| `current_region` setado (fim de rodada) | ~97% vs. ~99% | **Não separa** — quase todo mundo acumula ALGUM top-8 em 5 anos, setado ou não; ver §2.2 sobre por que isso não refuta a suspeita de região por completo |
| País/nacionalidade | Espanha/Argentina dominam os dois grupos, proporcionalmente | Não separa — mesma distribuição nos dois grupos |

### 1.2 — O mecanismo: um espiral que se auto-reforça, inteiramente com código já conhecido

Não precisa de um caminho de código novo — a combinação de três peças
JÁ documentadas nesta auditoria produz o espiral sozinha:

1. **Pontos de ranking só vêm de jogar** — uma dupla que não entra em
   nenhuma chave não ganha pontos, mas TAMBÉM não perde (não existe
   decaimento por inatividade neste sistema). O rank é uma POSIÇÃO
   RELATIVA — enquanto uma dupla parada não perde pontos, TODO MUNDO
   QUE CONTINUA JOGANDO ganha, e a posição relativa de quem não joga
   piora mecanicamente, temporada após temporada, mesmo sem nada
   "acontecer" com ela.
2. **`applyEntryPriority` (Fase 6.5) prioriza `openSlots` por rank** —
   quem já tem rank pior tem menos chance de ganhar a fatia principal
   das vagas quando o tier está lotado (a fatia reservada por
   menos-torneios-jogados, 25%, existe mas é pequena).
3. **`pairScore` (inalterado desde antes da Fase 5) decide quem
   sobrevive DENTRO da chave, dominado por `overall_rating`** — mesmo
   quando uma dupla de rank baixo consegue uma vaga (pela fatia
   reservada), a chance de ir longe o bastante pra ganhar pontos
   significativos é menor, porque `overall_rating` tende a acompanhar
   rank baixo.

**O resultado é um ciclo que se fecha sozinho**: rank pior → menos
chance de entrar → não ganha pontos → rank relativo piora mais (porque
o resto do mundo continua jogando e pontuando) → menos chance ainda no
próximo ciclo. Nenhuma das correções medidas até agora (prioridade por
espera, prioridade de entrada, fallback de tier, expandir a base,
expandir o topo) ataca a CAUSA RAIZ do espiral — todas mexem em QUEM
tem prioridade dentro de uma competição que continua sendo decidida
por rank/skill, e nenhuma dá à dupla presa uma forma de RECUPERAR
pontos sem primeiro vencer essa mesma competição.

### 1.3 — Por que a capacidade não resgata quem já está preso: o bucket `rank>300`

Confirma diretamente por que dobrar/triplicar o topo (Fase 6.7) não
resolveu: em TODAS as 3 rodadas, duplas com rank>300 praticamente NUNCA
jogam, independente do tamanho do calendário —

| Cenário | "jogou" no bucket rank>300 (total, 5 temporadas) | Total de decisões nesse bucket |
|---|---|---|
| Atual (40/38) | 5 | 3.986 (0,13%) |
| Topo 76 | 0 | 8.890 (0,00%) |
| Topo 120 | 6 | 6.507 (0,09%) |

**Triplicar o calendário do topo não move essa taxa de 0% pra algo
mensurável.** Isso confirma que a barreira não é volume de vagas — é
que, uma vez que o rank relativo cai o bastante, a dupla nunca mais
GANHA a disputa por uma vaga (nem a fatia principal, por rank, nem
sobrevive bem o bastante na fatia reservada), não importa quantas vagas
novas existam. É o retrato mais direto até agora de por que capacidade
sozinha não resolve — o gargalo não é "vagas disponíveis", é "nunca
vence a disputa pela vaga".

## 2 — Achado de código: `eventRegion` lê campos que `Tournament` nunca tem

Confirmado por leitura de código, ANTES de qualquer medição — exatamente
a suspeita do item 1.3 do pedido, mas com uma complicação que muda a
leitura.

### 2.1 — O bug confirmado

```js
// WorldTourLifecycle.js:163-165
function eventRegion(tournament) {
  return tournament.region || tournament.continent || tournament.country || tournament.location || 'global';
}
```

`Tournament` (criado em `circuitCatalog.js:453-456`/`531-534`) NUNCA
tem `region` nem `continent` — só `country: city.country` (ex.
"Marrocos") e `world_region: city.region` (ex. "África", uma de 8
categorias: Europa, América do Sul, Ásia, América do Norte, África,
Oriente Médio, Oceania, Europa/Ásia). `eventRegion` cai direto em
`tournament.country`, NUNCA em `world_region`.

`currentRegion` é setado com esse valor quando uma dupla termina
top-8 (`WorldTourLifecycle.js:537`: `athlete.currentRegion =
eventRegion(tournament)`) — ou seja, vira um nome de PAÍS ("Marrocos"),
não a REGIÃO ("África"). Mas quem CONSOME esse valor
(`TournamentSelectionAI.js:28`) compara contra `world_region`:

```js
const travelLoad = tournament?.world_region && context.currentRegion &&
  tournament.world_region !== context.currentRegion ? 7 : 2;
```

**País nunca é igual a região** ("Marrocos" ≠ "África", "Portugal" ≠
"Europa") — então a comparação `tournament.world_region !==
context.currentRegion` é **estruturalmente quase sempre verdadeira**,
disparando o penalty MÁXIMO (7, contra 2 de "bateu a região") pra
QUALQUER dupla que já tenha um `currentRegion` setado, em QUALQUER
torneio. Somado a `normalizeAthlete` (`WorldTourLifecycle.js:177`)
default pra `'global'` quando `current_region` nunca foi setado
(também nunca igual a nenhum `world_region` real) — **o caso
"região bate, penalty baixo" pode nunca disparar pra NINGUÉM, real ou
bot, tenha ou não sucesso prévio.** Isso é uma quinta ocorrência da
classe de achado desta auditoria "cálculo certo, consumidor que lê o
campo errado" (a Fase 5.6, §3, já tinha listado 3: `pairRepresentative`
único, `TeamRanking` de IA não lido, "força = média" implementado 3×) —
mas com uma torção: aqui não é que o consumidor ignora um dado certo,
é que PRODUTOR e CONSUMIDOR concordam em usar o campo `currentRegion`,
só que um escreve na granularidade errada (país) pro que o outro lê
(região).

### 2.2 — Por que isso NÃO explica sozinho quem fica no núcleo ocioso

Se o penalty de viagem é (quase) sempre 7 pra todo mundo, ele é
**uniforme na população, não seletivo** — não explica por que ESTAS
68 duplas especificamente ficam de fora e não outras. A hipótese
crua do pedido ("duplas sem região setada ficam mais excluídas")
precisa ser refinada: `currentRegion` só fica setado depois de um
top-8 — então "ter região setada" é, em grande parte, um PROXY de
"já teve sucesso antes" (rank/OVR), não uma causa independente. Medir
isso exige cruzar região com rank (feito na instrumentação desta
fase, §1) pra saber se sobra algum efeito de região DEPOIS de
controlar por rank, ou se o "achado" inicial é só o próprio rank
disfarçado.

## 3 — Teste da hipótese da dispersão sem sucesso: NÃO se sustenta na forma simples

Agregando as 4 categorias (jogou/cortada/sem-opção/descanso) de TODA
dupla real, nas 3 rodadas de 5 temporadas:

| Cenário | Jogou | Cortada | Sem opção | Descanso |
|---|---|---|---|---|
| Atual (40/38) | 13,9% | 26,3% | 45,5% | 14,2% |
| Topo 76 | 17,5% | 27,3% | 41,5% | 13,8% |
| Topo 120 | **25,7%** | 23,4% | 35,1% | 15,8% |

**A hipótese, na forma literal do pedido, não se sustenta**: "jogou"
SOBE de forma real e consistente com o volume (13,9%→17,5%→25,7%,
quase dobrando do atual pro topo 120) — não é só uma redistribuição
entre "cortada" e "sem opção" sem conversão em sucesso. Mais volume
converte, sim, uma fração real de tentativas fracassadas em jogos de
verdade.

**Mas essa melhora não é uniforme — ela é inteiramente filtrada por
rank.** O §1.3 já mostrou que o bucket rank>300 fica em ~0% de "jogou"
nos 3 cenários, não importa o volume. Cruzando os dois achados: o
ganho agregado de "jogou" (13,9%→25,7%) vem INTEIRAMENTE das duplas
que ainda estão dentro da faixa competitiva (rank≤300) — mais volume
dá a ELAS mais chances reais de jogar. Pra quem já caiu pra rank>300,
mais volume não muda nada, porque o mecanismo de entrada continua
sendo decidido por rank relativo, e a demanda de quem AINDA compete
(rank baixo, meio, alto até 300) cresce junto com a oferta — cada vaga
nova é disputada por gente que, em média, ainda tem chance de vencer
essa disputa. **A dispersão sem sucesso não é o mecanismo — o
mecanismo é um filtro de rank que praticamente nenhuma quantidade de
volume atravessa**, uma vez que uma dupla já caiu do lado errado dele.

## 4 — Cruzamento das duas hipóteses: rank é a causa, região é um achado real mas secundário

**As duas hipóteses do pedido não têm o mesmo peso na explicação.**

- **Rank (espiral auto-reforçado, §1.2)**: explica quem fica no núcleo
  ocioso com 98,8% de acerto, nos 3 cenários independentes, com um
  mecanismo inteiramente rastreável em código já conhecido (nenhuma
  peça nova) — este é o achado principal da fase.
- **`currentRegion`/`eventRegion` (§2)**: o bug de código é REAL e
  fica registrado (granularidade errada — país setado, região
  comparada) — mas na comparação de população por fim de rodada, "ter
  uma região setada" NÃO separa núcleo ocioso de ativo (95-100% dos
  dois grupos, nos 3 cenários) porque quase toda dupla acumula algum
  top-8 em 5 anos, ativa ou não. O efeito que a análise por DECISÃO
  (controlando por rank) mostrou — cortada mais frequente com região
  não-setada — é bem menor que o efeito de rank sozinho, e boa parte
  dele provavelmente é o PRÓPRIO rank aparecendo de novo (quem tem
  região setada tende a ser quem jogou bem recentemente, que tende a
  ser quem tem rank melhor). **Não fechamos se sobra algum efeito de
  região independente de rank** — precisaria de um controle mais fino
  (rank contínuo, não só 2 faixas) que fica fora do escopo desta fase
  diagnóstica. Registrado como bug de código confirmado e como
  contribuinte plausível mas SECUNDÁRIO, não como a causa principal.

**Resposta final, com a honestidade que o pedido pediu**: o mecanismo
NÃO ficou sem explicação — rank (posição relativa no ranking mundial,
que só sobe pra quem joga, nunca decai por inatividade) é uma causa
identificada, medida, e reproduzida de forma independente em 3
cenários diferentes com uma limpeza (98,8%) rara nesta auditoria. A
região é um bug de código real, com efeito medido mas provavelmente
menor e parcialmente confundido com o próprio rank.

### Fechamento da linha de investigação (Fase 7.4)

O espiral auto-reforçado identificado em §1.2 acima ficou fechado por
uma cadeia de 3 fases subsequentes, todas partindo diretamente deste
diagnóstico:

- **Fase 7.1** deu à dupla presa uma segunda porta de entrada
  (qualifying) — quebrou a espiral em 32-67% dos casos, mas uma
  vitória pontual não rendia rank suficiente pra sair do bucket
  `rank>300` antes da rodada seguinte.
- **Fase 7.2** mediu essa reincidência em 90-100% — o resgate era real,
  mas não durava.
- **Fase 7.3** implementou e mediu a correção: uma JANELA de entrada
  garantida por `N` torneios seguidos depois de vencer o qualifying
  (em vez de uma vitória isolada). `N=4` com o fator de escala do
  qualifying fixo (política "rate") zerou a reincidência (0% em T4 e
  T5, contra 90,9% com `N=2` e 40% com o fator escalando pelo tamanho
  do grupo em vez de fixo) — ver
  [FASE-7.3-RELATORIO.md](FASE-7.3-RELATORIO.md) §3.3.
- **Fase 7.4** promoveu o mecanismo de diagnóstico (`DIAG_WINDOW_N`/
  `DIAG_WINDOW_SCALE`, variáveis de ambiente) a comportamento
  permanente de produção em `WorldTourLifecycle.js`
  (`PRIORITY_WINDOW_N=4`, `QUALIFYING_SCALE_FACTOR=1,4`, sempre ativos,
  sem flag) — e corrigiu, no caminho, o estado da janela pra sobreviver
  a reinício de app/`--resumeFrom` (persistido em
  `Partnership.priority_window_remaining`, não mais um Map em memória
  como na medição original). Regime-check de 5 temporadas sem
  variáveis de ambiente confirmou paridade com os números medidos em
  modo diagnóstico — ver FASE-7.4-RELATORIO.md.

**A causa raiz (rank como posição relativa que só sobe pra quem joga)
continua existindo por design** — a janela não elimina o mecanismo,
dá à dupla presa tempo suficiente pra escapar dele antes que a posição
relativa volte a cair. Linha de investigação aberta nesta fase:
**fechada**.

## 5 — Validação

Fase puramente diagnóstica, como pedido — nenhuma correção
implementada. Instrumentação temporária removida antes do commit:
`DIAG_MECHANISM`/`getDiagMechanismSnapshot` (`WorldTourLifecycle.js` +
import no harness), `DIAG_POPULATION` (harness), `DIAG_TOP_EVENTS`
(`circuitCatalog.js`) — `grep` confirma zero ocorrências restantes; os
3 arquivos de código voltaram a ficar byte-idênticos ao HEAD
(confirmado por ausência no `git diff --stat`).

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
| 1 | Comparação das duas populações, eixo que separa (se houver) | ✅ feito — rank separa núcleo ocioso de ativo com **98,8% de acurácia** (limiar ~600-670), reproduzido de forma independente em 3 cenários; OVR/idade/nacionalidade/região não separam de forma comparável |
| 2 | Resultado do teste de dispersão sem sucesso | ✅ feito — não se sustenta na forma literal (jogou sobe de verdade com volume, 13,9%→25,7%); refinado: o ganho é inteiramente filtrado por rank, o bucket rank>300 fica em ~0% de jogou nos 3 cenários |
| 3 | Caminho de código exato da ponderação de região (se for a causa) | ✅ feito — `eventRegion` (`WorldTourLifecycle.js:163-165`) vs. `travelLoad` (`TournamentSelectionAI.js:28`), granularidades incompatíveis (país vs. região); bug real, mas região não é a causa principal (§4) |
| 4 | Registro honesto se nenhuma hipótese fechar | ✅ feito — mas não foi preciso: rank fechou como causa principal, com evidência forte e reproduzida; região registrada como bug real e contribuinte secundário/parcialmente confundido, não como causa isolada |
| 5 | Suíte, lint, build OK, instrumentação revertida, commit | ✅ feito — 33/36 (92/100), mesmas 3 falhas pré-existentes; `src-tauri/` intocado; nenhuma mudança de código permanente |
