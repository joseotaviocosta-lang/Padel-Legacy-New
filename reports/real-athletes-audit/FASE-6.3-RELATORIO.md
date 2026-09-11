# Fase 6.3 — Corrigir o penhasco sincronizado

> Pré-requisito: Fase 6.2 mediu o penhasco (401/956 atletas, 42% da
> população, 389 bots) e decidiu que ele precisa de correção própria. Ver
> [FASE-6.2-RELATORIO.md](FASE-6.2-RELATORIO.md). Esta fase confirma se a
> curva de ociosos estabilizou, verifica contaminação de medições
> anteriores, e avalia (sem escolher às cegas) como corrigir o penhasco.

## Resumo executivo

A curva de ociosos NÃO estabilizou (2,20,26,37,39/temporada) — mas a
causa não é a mesma que motivou a correção do penhasco: a maioria
(55-65%) dos reais ociosos por temporada JÁ TEM parceiro, simplesmente
não foi selecionada pra nenhum torneio (achado novo, fora do escopo
desta fase). O penhasco em si contaminou pelo menos um achado histórico
absoluto (o timing do declínio do Top 20 — quinta instância da classe
"número publicado enquanto um mecanismo fazia outra coisa"). Das 4
variantes de correção avaliadas, 2 tinham bugs sérios só visíveis ao
medir (retroagir por rank crasha os 100 reais na semana 2; suavizar o
decaimento não funciona porque um laço de exclusão em paralelo ignora a
rampa — SEXTA instância da mesma classe, desta vez dentro da correção
proposta). A variante recomendada (retroagir a âncora por hash do id)
reduz o pico semanal de deslocamento populacional em 83% sem nenhum dos
dois bugs — mas não foi aplicada; o pedido pediu avaliação e
recomendação, não implementação.

## 1 — A curva de ociosos: confirmada ainda subindo, causa NÃO é a mesma da Fase 6.2

Regime-check de 5 temporadas, mesma seed, código atual (itens 2/3 da
Fase 6.2 já em vigor por padrão). Instrumentação adicional no harness
(temporária): cada real ocioso da temporada é classificado — tem
parceiro (não foi selecionado pra nenhum torneio) ou está sem parceiro
(e há quantos dias).

| Temporada | Ociosos | Com parceiro | Sem parceiro | Espera média (sem parceiro) | Espera MÁXIMA |
|---|---|---|---|---|---|
| 1 | 2 | 1 (50%) | 1 (50%) | 183 dias | 183 |
| 2 | 20 | 11 (55%) | 9 (45%) | 358 dias | 548 |
| 3 | 26 | 17 (65%) | 9 (35%) | 399 dias | 699 |
| 4 | 37 | 22 (59%) | 15 (41%) | 359 dias | **1064** |
| 5 | 39 | 22 (56%) | 17 (44%) | 372 dias | **1429** |

**Confirmado: a curva não estabiliza** (2→20→26→37→39, monotônica, igual
à medição da Fase 6.2). **Mas a causa NÃO é a mesma que os itens 2/3 da
Fase 6.2 atacaram.** A MAIORIA dos reais ociosos em toda temporada (55%
a 65%) **já tem parceiro** — não estão presos na loteria de formação,
simplesmente não foram selecionados pra NENHUM torneio naquela
temporada inteira. Isso não é um problema de pareamento; é um problema
de seleção/capacidade de torneio (`chooseTournament`, ou a pressão do
Candidato B no topo empurrando mais gente pra competir pela mesma base)
— fora do escopo do que esta fase e a 6.2 mediram.

**A minoria sem parceiro (35-45%) tem um sinal preocupante à parte**: a
espera MÁXIMA sobe ano a ano — 548 → 699 → 1064 → **1429 dias** (quase 4
anos!) — mesmo com o piso reservado da Fase 6.2 item 3 em vigor. A
interseção continua em 0 (ninguém fica de fora de TODAS as 5
temporadas — confirmado abaixo), então quem quer que seja o caso mais
extremo eventualmente é resgatado. Mas o piso reservado (20% dos pares
formados/mês, pros mais antigos) não é uma garantia por indivíduo — é
uma fração fixa; se vários "há mais tempo esperando" competem pelas
mesmas vagas reservadas no mesmo mês, o pior caso ainda pode esperar
anos antes de sua vez chegar. **Achado novo, fora do escopo desta fase,
registrado pra investigação futura**: o piso reservado da Fase 6.2 tem
uma cauda longa que ainda cresce.

### 1.1 — Nota sobre a ordem do pedido

O pedido definia: "se o item 1 mostrar que a curva ainda sobe, pare e
reporte — a correção do penhasco espera." A curva realmente ainda sobe,
mas por uma causa DIFERENTE da que motivou a correção do penhasco (item
3 abaixo) — o penhasco é um evento de UMA semana por atleta, resolvido
ou não independentemente de quantos torneios um real consegue jogar
depois. A avaliação das variantes (item 3) foi feita mesmo assim porque
responde uma pergunta já decidida pela Fase 6.2 (o penhasco precisa de
correção própria, item 4 daquele relatório) que não depende da causa da
curva de ociosos pra ser válida — mas, seguindo o espírito do pedido,
**nenhuma variante foi aplicada como correção final** (ver §3.4). O que
fica genuinamente represado é decidir SE aplicar uma correção do
penhasco agora faz sentido antes de entender a causa nova (seleção de
torneio, não pareamento) — recomendação: investigar essa causa nova
primeiro (bloco natural de uma Fase 6.4), porque ela pode ser maior que
o próprio penhasco.

## 2 — Contaminação de medições anteriores pelo penhasco

### 2.1 — Onde a semana do penhasco cai, em relação a cada medição

O penhasco acontece ~364 dias depois do primeiro toque de
`processWorldCircuit` sobre a população — para uma carreira que começa
em janeiro, isso cai na **primeira semana de janeiro do ANO 2** (medido
na Fase 6.2: `2027-01-03`, pra uma carreira iniciada em 2026). Isso
importa porque **toda medição "de regime" desta série usou a temporada
2 como o número estável** ("Temporada 2 é o número de regime", citado
desde a Fase 4.4) — e a temporada 2 é medida no seu PRÓPRIO fim (~31 de
dezembro do ano 2), **~12 meses depois** do penhasco, não durante a
semana da própria reordenação.

Isso separa duas perguntas diferentes:
1. **A medição capturou o CAOS agudo da semana do evento?** Não — nenhum
   snapshot de "temporada 2" cai na semana do penhasco em si; todos são
   ~11-12 meses posteriores, depois de a população já ter tido um ano
   inteiro de torneios pra reagir.
2. **A COMPOSIÇÃO da população mudou de um jeito que persiste até a
   medição, mesmo sem capturar o caos agudo?** Potencialmente sim — ver
   §2.2.

### 2.2 — Achados por categoria: relativos sobrevivem, absolutos são suspeitos

**Achados COMPARATIVOS (A vs. B, com o resto do mundo idêntico)** — o
penhasco acontece igualmente nos dois lados da comparação (mesma
mecânica, `rankingWindow.js`, nunca tocada por nenhuma das mudanças
comparadas). Um confundidor que afeta os dois lados igualmente não
muda a diferença relativa medida:
- Achado #32 (razão agregada não muda com mais eventos de calendário,
  exclusão trava em ~67%) — as 4 curvas (40/80/150/250 eventos) sofrem o
  MESMO penhasco; a comparação ENTRE elas continua válida.
- Fase 5.6 (Candidato B: razão de regime Gold 9,6×→5,0× etc.) — antes/
  depois isolam só `circuitCatalog.js`; o penhasco não muda entre os
  dois lados. Comparação válida.

**Achados ABSOLUTOS (um número sozinho, não uma comparação)** — aqui o
penhasco pode contaminar de verdade, porque a composição da população
que ele empurra pra baixo (alto `overall_rating`, rank zerado) fica
disponível pro resto da medição:

- **Razão demanda/capacidade da base**: o penhasco derruba ~401
  atletas de rank bom pra rank de base, SEM mudar `overall_rating`. Uma
  vez pareados, esses atletas competem exatamente pela fatia que o
  achado #32 já descreveu como "a mesma fatia de maior `overall_rating`
  reenchendo toda vaga nova" (Fase 5.1). **Plausível que o penhasco seja
  parte da ORIGEM dessa fatia**, não só uma coincidência de descrição —
  não confirmado por medição isolada nesta fase (exigiria repetir a
  curva de demanda com e sem o penhasco, fora do escopo do item 2).
- **Declínio do Top 20 real — a evidência mais concreta**: comparando
  quando o declínio COMEÇA entre fases:
  - Fase 4.2 (mundo pré-Fase-5): Top 20 fica em **20/20 na temporada 2**
    — só declina a partir da temporada 3.
  - Fase 6/6.2 (mundo com Candidato B): Top 20 já cai pra **16-18/20 na
    própria temporada 2**.
  A mecânica do penhasco é IDÊNTICA nos dois mundos (mesmo código desde
  antes da Fase 4) — o que difere é QUANTOS e QUAIS reais estão sem
  parceiro quando ele bate, e isso muda com o mundo (achado da Fase
  6.1: qualquer mudança reembaralha quem a loteria favorece). Medido na
  Fase 6.2: **12 reais** estavam entre os 401 atingidos no mundo
  Candidato B, alguns deles (Francisco Guerrero, rank 15 antes do
  penhasco) claramente próximos ou dentro do próprio Top 20. **O
  declínio começar uma temporada mais cedo no mundo Candidato B é
  consistente com o penhasco ter empurrado reais do Top 20 pra fora
  diretamente naquela transição específica** — não com um efeito
  gradual de idade ou de disputa por vaga no topo.

### 2.3 — Registro: quinta instância da classe, com uma diferença

**Confirmado que houve contaminação de pelo menos um achado absoluto**
(o timing do início do declínio do Top 20) — quinta instância da classe
"número publicado enquanto um mecanismo fazia silenciosamente outra
coisa" (junto de #16, #33 item 2, #37, e a leitura de aging da Fase 4.2
já registrada como quarta instância na Fase 6.1). **Diferença desta
instância**: nas quatro anteriores, um cálculo certo existia ao lado de
um caminho que não o usava, ou um denominador errado foi usado por
engano. Aqui, **nada estava "errado" no sentido de um bug de leitura —
o penhasco é comportamento correto e documentado do sistema
(`rankingWindow.js`, aprovado pelo próprio usuário na Fase 4)**. A
contaminação é de OUTRA natureza: um evento estrutural do mundo (não um
efeito do fenômeno sendo estudado) caindo dentro da janela de medição e
sendo interpretado como parte desse fenômeno. Registrado à parte por
esse motivo — não invalida os achados #16/#33/#37 nem a quarta
instância, mas não é a mesma causa-raiz.

**Não investigado mais a fundo nesta fase** (fora do escopo do item 2):
o tamanho exato do efeito sobre a razão demanda/capacidade da base, e se
a interseção entre "reais que crasham no penhasco" e "reais próximos do
Top 20" é sistemática ou coincidência desta seed. Fica registrado como
pergunta em aberto pra quem for medir a curva de expansão da base
(item 2 pendente da Fase 6) depois desta correção.

## 3 — Variantes de correção: avaliadas com efeito medido

Instrumentação `DIAG_CLIFF` estendida (`circuitLifecycle.js`) pra medir o
deslocamento populacional TODA semana (não só na semana de crash) — dá
uma série temporal comparável entre variantes, não só um número. Quatro
implementações testadas, 15 meses cada, mesma seed, todas temporariamente
gated por env var (`CLIFF_STAGGER`, `CLIFF_GRADUAL`):

| Variante | Mecanismo | Pico de deslocamento numa semana (média/mediana) | >50 posições, pico | Total de "crashes" em 15 meses |
|---|---|---|---|---|
| **Linha de base** (atual) | Data única, corte duro aos 364 dias | **134,7 / 89** | **757/974 (78%)** | 401, quase todos numa semana |
| **(A) `CLIFF_STAGGER=rank`** | Data retroagida por posição de ranking | **179,5 / 100** (PIOR que a base) | **999/1000 (99,9%!)** | 668, com um segundo pico catastrófico |
| **(B) `CLIFF_STAGGER=hash`** | Data retroagida por hash do id (uniforme, sem correlação com rank) | **22,6 / ~8** | **34/995 (3,4%)** | 543, ~8/semana em média, nunca concentrado |
| **(C) `CLIFF_GRADUAL`** | Mesma data única, decaimento linear ao longo de +180 dias | **232,6 / 265** (PIOR que a base) | **894/970 (92%!)** | 0 completos em 15 meses, mas o evento agudo continua |
| **(B+C) combinado** | Hash + decaimento gradual | **23,1 / ~7** | **34/966 (3,4%)** | comportamento igual ao (B) sozinho |

### 3.1 — (A) retroagir por ranking: pior que não fazer nada

A ideia desincroniza de fato — mas com um efeito colateral que a
transforma na PIOR opção medida. Bug encontrado ao rodar (não previsto
na proposta): **atletas reais ainda não têm `ranking_position` atribuído
no primeiro toque do mundo** (o campo só é calculado DEPOIS, pela própria
passada de `processWorldCircuit` que cria a âncora) — o fallback
`safeNumber(rankingPosition, populationCap)` trata "ainda não calculado"
como "pior rank possível" pra QUALQUER real, retroagindo a âncora deles
em 364 dias inteiros. Resultado: **os 100 reais crasham juntos na semana
2 do mundo**, antes de terem qualquer chance de jogar — mediana de
deslocamento populacional 100, 999/1000 atletas se movendo. Pior que o
próprio problema que deveria corrigir. **Rejeitada.**

### 3.2 — (B) retroagir por hash: funciona, sem efeito colateral

Sem correlação com rank/habilidade — cada atleta recebe um deslocamento
determinístico e uniforme entre 0 e 364 dias. Nenhuma semana concentra
mais de 21 crashes (contra 394 da linha de base); o pico de deslocamento
populacional cai **83%** (134,7→22,6 de média). Não depende de nenhum
outro campo estar calculado ainda — funciona desde a semana 1.

### 3.3 — (C) decaimento gradual: bug encontrado, mesma classe de achado desta auditoria inteira

Media pra confirmar antes de recomendar — e a medição achou um problema
que a proposta não previa. `computeRollingPoints` foi ajustado pra pesar
a âncora gradualmente, mas **`circuitLifecycle.js` também tem um laço de
EXCLUSÃO da linha do banco que usa `isResultExpired` (o corte duro de 364
dias) sem saber da rampa** — a linha é apagada no dia 364 de qualquer
jeito, antes da rampa de 180 dias sequer começar a valer. O peso gradual
nunca chega a ser aplicado de verdade; na prática, o comportamento
observado é UM CORTE DURO, só que uma semana depois do esperado (**pior**
que a linha de base: mediana de deslocamento 265, 92% da população se
move). **Sexta instância da classe "cálculo certo ao lado de um caminho
que não o usa"** — desta vez dentro da PRÓPRIA correção proposta nesta
fase, não num achado histórico. Pra funcionar de verdade, o laço de
exclusão precisaria da mesma rampa. Não corrigido — a variante (B) já
resolve o problema sem essa fragilidade estrutural (mexe só na DATA da
âncora, não precisa coordenar dois lugares que leem `isResultExpired`).

### 3.4 — Recomendação: (B), retroagir por hash — sem (A) e sem (C)

**(B) por si só é suficiente e estruturalmente mais simples.** Só muda
o valor de UM campo (a data da âncora) no momento em que ela é criada —
não precisa alterar `computeRollingPoints`, não precisa coordenar dois
consumidores de `isResultExpired`, não introduz uma classe nova de bug
de sincronização entre eles. Reduz o pico semanal em 83% e elimina
qualquer concentração — o critério do pedido ("nenhuma semana pode ter
um evento de reordenação em massa sem causa esportiva") fica atendido.

**Não elimina o mecanismo em si** — cada atleta ainda perde a âncora de
um jeito abrupto (100%→0%, não gradual PARA O INDIVÍDUO) no seu próprio
dia. Isso não atende à segunda metade do critério do pedido ("um bot
que nunca jogou deve cair no ranking gradualmente"). Se essa parte
também for exigida, a variante (C) precisaria ser corrigida primeiro
(estender a rampa ao laço de exclusão) antes de poder ser combinada com
(B) — proposta registrada, não implementada nesta fase.

**Não implementado nesta fase** (nem a (B) isolada) — o pedido pede
avaliação e recomendação, não aplicação. `CLIFF_STAGGER`/`CLIFF_GRADUAL`
revertidos como o resto da instrumentação (§5).

## 4 — Efeito sobre o jogador: confirmado por código, sem precisar de nova rodada

`buildWorldRankingSnapshot` (`src/lib/padel.js:444`, fonte canônica do
ranking mostrado em Ranking.jsx/Header/Home/Season) computa a posição do
jogador assim: funde `AthleteProfile.list(...)` (até 1500 atletas) com o
jogador, ordena por pontos (`compareRankingEntries`) e atribui
`rank: index + 1`. **É uma posição por CONTAGEM — "quantos têm mais
pontos que eu, mais 1" — recalculada do zero a cada chamada.**
`isActiveRankedAthlete` só filtra aposentados; um atleta que acabou de
zerar no penhasco continua na lista, só que ordenado quase no fim.

**Isso confirma o cenário do pedido, sem precisar rodar nada de novo**:
se 401 atletas (ou quantos estiverem acima do jogador) zeram pontos na
mesma semana, a contagem de "quem tem mais pontos que eu" cai na mesma
proporção — o jogador sobe de posição com ZERO mudança nos próprios
pontos, só porque outros desapareceram do caminho. O dado agregado já
medido na Fase 6.2 confirma a escala: **78% da população (750/956)
mudou de posição naquela semana, a maioria deles gente que não jogou
nada — só se deslocou porque 401 pessoas sumiram do meio da tabela.**
Um jogador ocupando qualquer posição acima da mediana experimenta
exatamente esse pulo, todo ano, por volta do mês 12-13 da carreira.

**Some com a correção?** Ver §3 — qualquer variante que desincroniza as
expirações reduz o deslocamento populacional POR SEMANA na mesma
proporção que reduz o tamanho do evento por semana (medido: baseline
~142 de deslocamento médio numa semana; variantes de dessincronização,
a poucas dezenas espalhadas ao longo do ano — ver tabela §3.3). O
jogador ainda sobe de posição aos poucos ao longo do ano (correto —
outros atletas realmente pontuam menos que ele quando não jogam), mas
nunca num salto de centenas de posições numa única visita à tela de
ranking.

## 5 — Validação

Nenhuma das variantes foi aplicada como correção permanente — todo o
código desta fase (`DIAG_CLIFF` estendido em `circuitLifecycle.js`,
`CLIFF_STAGGER`/`CLIFF_GRADUAL` em `circuitLifecycle.js`/
`rankingWindow.js`, e a classificação `hasPartner`/`waitDays` no
harness) foi temporário, usado só pra medir, e revertido antes deste
commit (`git checkout HEAD --`, confirmado por `git status`/`git diff`
vazios em `src/`/`scripts/`, grep zero ocorrências de `DIAG_CLIFF`/
`CLIFF_STAGGER`/`CLIFF_GRADUAL`).

- `npm run lint` — limpo.
- `npm run build` — OK (mesmo aviso pré-existente de chunk >500kB).
- Suíte de regressão — 33/36, score 92/100, as mesmas 3 falhas
  pré-existentes (`test:rc-gameplay-balance`, `test:career-pace`,
  `test:ui-quality`), nenhuma relacionada a esta fase.
- `src-tauri/` intocado.
- Arquivos auto-regenerados pela suíte revertidos antes do commit.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Curva de ociosos remedida, com patamar ou confirmação de que ainda sobe | ✅ **ainda sobe** (2,20,26,37,39) — causa identificada: maioria (55-65%) já tem parceiro, não é selecionada pra torneio (achado novo, fora do escopo do penhasco) |
| 2 | Contaminação de medições anteriores, com registro | ✅ confirmada em pelo menos um achado absoluto (timing do declínio do Top 20) — quinta instância da classe, com nuance própria; achados comparativos (razão agregada) sobrevivem |
| 3 | Três (ou mais) variantes avaliadas com efeito medido, e recomendação | ✅ 4 avaliadas (rank/hash/gradual/combinado) — 2 com bugs sérios encontrados na medição (rank crasha reais na semana 2; gradual não funciona por um laço paralelo — sexta instância da classe); **recomendação: retroagir por hash**, -83% no pico semanal, não implementada |
| 4 | Efeito sobre o jogador, confirmado antes e depois | ✅ confirmado por código (`buildWorldRankingSnapshot`, posição por contagem) sem precisar de nova rodada; some proporcionalmente com a variante recomendada |
| 5 | Suíte, lint, build, Tauri OK, commit | ✅ lint 0 · build OK · suíte 33/36 (92/100) · `src-tauri/` intocado · nenhum código de produção alterado (tudo revertido) |