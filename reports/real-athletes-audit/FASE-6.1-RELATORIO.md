# Fase 6.1 — Por que os reais estão drenando do circuito

> Pré-requisito: Fase 6, item 1 (cláusula de parada acionada — interseção de
> reais permanentemente ausentes subiu de 0 para 2 num regime-check de 5
> temporadas). Ver [FASE-6-RELATORIO.md](FASE-6-RELATORIO.md). Item 2 da
> Fase 6 (curva de expansão da base) segue suspenso até este relatório
> fechar.

## 0 — As duas hipóteses do pedido, refutadas por leitura de código

Antes de qualquer medição: as hipóteses (A) e (B) do pedido têm resposta
estrutural direta, sem precisar rodar nada.

### (A) — "O portão de parceria (`calculatePartnershipInterest`) barra reais entre si" — **refutada**

Grep de todos os importadores de `calculatePartnershipInterest`
(`src/players/teamCompatibility.js`): `career.js` (`isInterestGated`,
caminho do jogador), `partnerOfferRules.js`, `marketNegotiationLifecycle.js`
(`getNegotiationPreview`/`submitPartnerOffer`, ambos com `profile` — o
JOGADOR — como primeiro argumento), `PartnerSearch.jsx`,
`PartnerOffersPanel.jsx`. **Nenhum destes é `aiPartnershipLifecycle.js`.** O
mercado de IA-IA (`formNewPartnerships`/`selectPair`, mesmo arquivo) usa uma
função LOCAL e completamente separada, `compatibility(a, b)` (linha ~112):
`tacticalScore×0,6 + rankingScore×0,25 + personalityScore×0,15` — sem
`T_low`, sem reputação, sem `calculatePartnershipInterest` em lugar nenhum
da cadeia de chamadas. **O portão nunca é avaliado para pares IA-IA.**

### (B) — "O teto de 150 fecha a saída para quem caiu" — **refutada, e na direção oposta à do pedido**

Duas razões independentes, cada uma suficiente:

1. **Um real sem parceiro não é avaliado por NENHUM teto, de nenhum tier.**
   `WorldTourLifecycle.js:buildCanonicalPairs` monta os "pares" do World
   Tour em segundo plano estritamente a partir de `Partnership` com
   `status:'ativa'`. Um atleta com `ai_partner_id: null` não gera uma
   entrada em `pairs` — não existe objeto para `chooseTournament`/
   `evaluateTournamentEntry` avaliarem. Não é "barrado pelo teto"; é
   "nunca chega a ser considerado", em Bronze, Silver, ou qualquer tier
   acima. Grep confirma: não existe caminho de entrada avulsa/sem-dupla em
   `src/gameplay/worldTour/` — todo o pipeline de elegibilidade pressupõe
   um par já formado.
2. **Mesmo se tivesse dupla, um rank caído NÃO seria barrado pelo teto —
   seria liberado por ele.** `OPEN_TIER_CEILING=150` barra da base quem tem
   `pairEntryRank <= 150` (bom demais pra base). Um real que "caiu pra rank
   200" tem `pairEntryRank=200 > 150` — cai exatamente no caso
   `directLimit===0 || (hasRanking && rank<=directLimit)` → **elegível**
   para Bronze/Silver. O teto protege a base de quem é forte demais; não
   tranca a porta de quem ficou fraco. A leitura do pedido inverteu a
   direção do mecanismo.

**A pergunta do item 2.4 do pedido** ("existe algum tier onde um real rank
200 sem dupla possa entrar?") **tem resposta única: nenhum tier tem entrada
sem dupla, independente de rank — não é uma particularidade do teto, é uma
pré-condição de todo o sistema de torneios em segundo plano.** A saída está
fechada por construção, mas pela ausência de parceiro, não pelo teto.

## 1 — O mecanismo real: loteria de reformação, não gate nem teto

### 1.1 — 46 dos 100 reais nunca tiveram parceiro seedado

`saveFoundation.js:ensureWorldSeed2025` só semeia `ai_partner_id` para
atletas cobertos por `getConfirmedRealPairs()` (6 pares) +
`getProbableRealPairs()` (21 pares) = 27 pares, **54 dos 100 reais**. Os
outros **46 começam o mundo sem parceiro** — dependem inteiramente do
mercado genérico de IA (`formNewPartnerships`), exatamente como qualquer
um dos ~894 bots. `real_alvaro_montiel_caruso` e `real_maximiliano_sanchez`
(os 2 confirmados permanentemente ausentes na Fase 6) **não aparecem em
nenhum dos 27 pares históricos** — confirmado contra
`regime5/summary.json:cumulative.historicalDuplasOverall`. Não é coincidência
de menção — nenhuma das duas linhas de código que atribuem parceiro na
semeadura os alcança.

### 1.2 — Por que a loteria pode nunca sortear alguém

`selectPair` (`aiPartnershipLifecycle.js:165`) sorteia UM `first` por
iteração (ordenação por hash `${month}:${pairIndex}:${id}` — uniforme,
sem viés de espécie real/bot) e então sorteia o `second` num LEILÃO
PONDERADO sobre todo o resto do pool livre, peso =
`compatibility × rankGapWeight`. `rankGapWeight = exp(-gap × 0,01)`
(`RANKING_PROXIMITY_STRENGTH`) — decaimento exponencial: um gap de 300
posições já reduz o peso a `e⁻³ ≈ 5%` do que seria a gap zero; um gap de
600, a `e⁻⁶ ≈ 0,25%`. Um real que nunca jogou tem rank próximo do fundo da
população (~900-1000 de 1000) — **a única forma consistente de ser
pareado é ser sorteado como `first`** (chance ≈ `targetPairs / free.length`
por mês, contra centenas de outros livres); como candidato a `second`, o
peso cai a quase zero toda vez que o `first` sorteado tem rank distante —
o que, para um outlier de rank, é a maioria das vezes.

## 2 — Medição: rastreio semana a semana — o mecanismo de dois estágios

Instrumentação temporária `DIAG_MARKET`/`DIAG_MARKET_IDS`
(`aiPartnershipLifecycle.js`) rastreando 7 reais mês a mês: se estão no
pool livre, se foram sorteados como `first`, o `share` de peso que
alcançaram como candidato a `second`, e quando pareiam/dissolvem. Dois
runs de 2 temporadas, mesma seed (`official-900-100-s1`), única diferença
`circuitCatalog.js` (atual/Candidato B vs. Fase 5.5/pré-Candidato-B) —
ver §3. **Nota de método**: os dois runs usam `--seasons=2` (não 5, como o
regime-check da Fase 6) — a mesma seed NÃO reproduz byte-a-byte a
trajetória do regime-check de 5 temporadas (a contagem de temporadas e
outras flags do harness alimentam o gerador determinístico), então este
não é um replay dos 2 reais confirmados na Fase 6 especificamente — é uma
comparação controlada A/B isolando o efeito do Candidato B, com um
conjunto de 7 reais observados em paralelo nos dois mundos.

### 2.1 — O mecanismo tem DOIS estágios, não um

**Estágio 1 — a loteria de formação** (confirma a hipótese original da
Fase 6). Rank inicial de quem nunca jogou não é necessariamente ruim —
Álvaro Montiel Caruso começa em rank 73, Francisco Guerrero em rank 13.
Mesmo assim, o `melhorShare` (melhor fatia de peso conseguida como
candidato a `second`, em qualquer das ~20-65 iterações do mês) nunca
passa de ~1-4% — a chance de ser sorteado é baixa mesmo com rank bom,
porque o pool inicial é gigantesco (941 livres no mês 1, quase o mundo
inteiro — quase nada está pareado ainda na largada). A única rota
confiável é ser sorteado como `first` (`firstPicks`), o que só acontece
por sorte pura, proporcional à fração do pool.

**Estágio 2 — o penhasco do `legacy_seed` (364 dias), que transforma
atraso em armadilha.** `rankingWindow.js:buildLegacySeedRow` dá a
QUALQUER atleta sem resultado datado uma única linha sintética, datada
no primeiro toque do mundo, valendo `world_ranking_points` (o real
recebe seu valor de partida vindo do ranking FIP). Essa linha expira
**364 dias depois da própria data** (`isResultExpired`,
`RANKING_WINDOW_DAYS=364`) — pra quem JOGOU nesse ano, isso não importa
(resultados reais já dominam a soma dos 22 melhores). **Para quem nunca
jogou, a âncora sintética É o ranking inteiro — quando ela expira, o
total vira ~0 de uma vez, não aos poucos.** Medido diretamente (run
atual/Candidato B): Maximiliano Sánchez rank 77→87→89→92→93→98→100→103→
105→103→**579** (o salto acontece entre jan/2027 e fev/2027, quase
exatamente 12 meses depois do início do mundo); Francisco Guerrero
13→13→13→14→14→15→15→15→**573** (mesmo salto, mesmo mês); José Jiménez
Casas 33→35→36→38→38→**138**. **A "idade" que a Fase 4.2 leu como causa
não é a idade do atleta — é a idade do PRÓPRIO MUNDO batendo 364 dias
sobre quem não jogou.**

### 2.2 — Os dois estágios em série formam a armadilha

Uma vez que o rank cai pro fundo (500+), o Estágio 1 fica ainda mais
hostil — `rankGapWeight = exp(-gap×0,01)` penaliza exponencialmente a
distância de rank contra o pool ainda ativo (concentrado nos ranks
melhores, porque quem joga ganha pontos), então a chance de ser
sorteado como `second` cai ainda mais perto de zero do que já estava. O
atraso de formação (Estágio 1) empurra o atleta pro penhasco dos 364
dias (Estágio 2); o penhasco reduz ainda mais a chance de sair do
Estágio 1. **Não é dissolução que não reforma — é loteria de formação
lenta demais alimentando um relógio de 12 meses que, uma vez estourado,
quase fecha a porta de vez.**

### 2.3 — Comparação direta: quem passa pelo Estágio 1 a tempo, sobrevive

| Real (target) | Run atual (Candidato B) | Run antes (pré-Candidato B) |
|---|---|---|
| Álvaro Montiel Caruso | Pareado mês 8 (dentro do prazo) | Pareado mês 6 |
| Maximiliano Sánchez | **Ainda livre no mês 13 — rank já caiu pra 579** | Pareado mês 4 |
| Francisco Guerrero | **Ainda livre no mês 13 — rank já caiu pra 573** | Pareado mês 3 |
| José Jiménez Casas | Dissolve mês 9 (do par original), **ainda livre no mês 14 — rank já caiu pra 138** | Dissolve mês 9, repareado mês 12 |
| Leonel Daniel Aguirre | Dissolve mês 9, pareado mês 11 (dentro do prazo, por pouco) | Dissolve mês 9, pareado mês 10 |

No mundo pré-Candidato-B, **todos os 5 alvos com histórico suficiente
pareiam (ou repareiam) dentro dos primeiros 12 meses** — ninguém bate no
penhasco. No mundo atual, 2 dos 5 (Sánchez, Guerrero) já cruzaram o
penhasco antes mesmo do fim da temporada 1, e um terceiro (Jiménez
Casas) está a caminho. A diferença não é "o Candidato B corta uma
dupla" diretamente — é um atraso de alguns meses na loteria de formação
inicial, exatamente o suficiente pra alguns nomes perderem a janela dos
364 dias que no mundo antigo eles cruzavam com folga.

## 3 — Taxa de dissolução: praticamente idêntica — não é a causa

Mesma seed, 2 temporadas, única diferença `circuitCatalog.js` (atual vs.
`git checkout d307b75` — estado da Fase 5.5, antes do Candidato B):

| | Atual (Candidato B) | Antes (pré-Candidato B) |
|---|---|---|
| Dissoluções reais/mês (média, 23 meses) | 1,91 | 1,83 |
| Dissoluções bots/mês (média) | 10,87 | 11,30 |
| Formações reais/mês (média, 24 meses) | 2,96 | 3,17 |
| Formações bots/mês (média) | 23,67 | 23,38 |

**Estatisticamente indistinguível.** O Candidato B NÃO aumenta a taxa de
dissolução de duplas reais — a hipótese "menos torneio → forma pior →
mais dissolução → mercado sobrecarregado" (aventada no fechamento da
Fase 6) **não se sustenta**: a vazão do mercado (quantos pares se
formam/dissolvem por mês, reais e bots) é a mesma nos dois mundos.

**O que muda não é a taxa — é a SORTE de quem especificamente passa pela
janela dos 365 dias a tempo.** `circuitCatalog.js` determina quem ganha
cada torneio, o que muda `world_ranking_points`/rank de centenas de
atletas de forma diferente entre os dois mundos — e `selectPair` ordena
o pool livre por hash sobre o CONJUNTO de quem está livre naquele mês,
não sobre cada indivíduo isoladamente. Mudar QUALQUER coisa que afete
quem joga e quem ganha (não só cortes/chaves — em princípio qualquer
mudança de circuito) reembaralha quem o sorteio favorece, sem precisar
mudar a taxa agregada. Por isso a comparação individual (§2.3) mostra
uma diferença real (2-3 dos 5 alvos caem no penhasco num mundo e não no
outro) mesmo com taxas agregadas praticamente iguais — **o mecanismo é
sensível à ordem de sorte, não ao volume de dissolução**.

## 4 — Reavaliação do registro da Fase 4: correção necessária

**Confirmado por `git log`**: `aiPartnershipLifecycle.js` (o mercado —
loteria de formação, dissolução) não muda desde `8ff09f2` ("Fase 4:
ranking rolling de 52 semanas") — a ÚLTIMA vez que mudou foi quando o
próprio penhasco de 364 dias foi CRIADO. O registro de atletas reais
(`realAthletesRegistry.json`, os 46 desemparceirados) não muda desde
`v97`, bem antes disso. **Os dois mecanismos que compõem a armadilha —
a loteria e o penhasco — já existiam, intactos, no exato estado em que
a Fase 4.2 mediu intersecção=0 (0 reais excluídos em 5 temporadas).**

Isso não significa que a Fase 4.2 tenha inventado um número errado — o
regime-check daquela fase rodou de verdade e mediu 0 de verdade. O que
a Fase 4.2 **não fez foi checar a variável certa**: se registrasse o
status de parceria (pareado quando? há quanto tempo livre?) de cada
real ausente por temporada, teria descoberto o mesmo mecanismo de dois
estágios que esta fase descobriu — e o padrão "topo persiste, meio da
tabela rotaciona, atribuído a envelhecimento" teria uma explicação
alternativa direta: duplas que se desfazem e não repareiam a tempo do
penhasco de 364 dias caem do ranking de um jeito que PARECE
envelhecimento (queda suave, então precipício) mas não tem nada a ver
com idade biológica — é o relógio do MUNDO, não do atleta. A comparação
§2.3 mostra que, no mundo pré-Candidato-B (mais parecido ao medido na
Fase 4.2), a mesma amostra de reais atravessa a loteria a tempo — 0 caem
no penhasco — o que é consistente com (embora não prove
retroativamente) a leitura de que a Fase 4.2 não viu o mecanismo porque,
naquele mundo específico, ele não tinha disparado ainda, não porque não
existisse.

**Classificação**: quarta instância confirmada da classe "número
publicado enquanto um mecanismo fazia silenciosamente outra coisa"
(junto de #16, #33 item 2, #37) — mas com uma nuance que a diferencia
das outras três: ali, um cálculo CORRETO existia ao lado de um caminho
que não o usava (o mesmo dado, mal lido). Aqui, os dois mecanismos
(loteria + penhasco) SÃO o comportamento correto e documentado do
sistema — o achado não é um bug de leitura, é uma INTERAÇÃO não
antecipada entre dois sistemas corretos isoladamente (o mercado de
parceria e a janela rolling de ranking), cada um projetado e medido sem
o outro em mente. **Correção ao texto da Fase 4.2**: a frase "não
confirmado como causal" sobre a queda do Top 20 permanece
tecnicamente verdadeira, mas o relatório não registrava sequer a
possibilidade alternativa — esta fase fecha essa lacuna.

## 5 — Correção proposta (não implementada)

Dois estágios, duas correções independentes possíveis — não são
mutuamente exclusivas, e não escolho entre elas aqui.

**(i) — Suavizar o penhasco do `legacy_seed`.** Hoje: 364 dias, expiração
total, tudo ou nada. Alternativas: (a) expiração GRADUAL em vez de
degrau (decair a âncora linear ou exponencialmente ao longo da janela,
em vez de valer 100% até o dia 364 e 0% no 365); (b) não semear a âncora
para quem nunca jogou UMA partida sequer (tratar "sem histórico" como
"sem ranking ainda", não como "ranking que vai zerar" — mas isso muda o
que `ranking_position` significa pra recém-chegados em geral, não só
pra quem está preso na loteria); (c) estender a janela especificamente
para quem está sem parceiro (a âncora não devia contar um "relógio" que
o atleta não tem como parar de rodar — ele não pode jogar sem dupla).
**Risco de cada uma**: (a) suaviza mas não resolve — ainda cai a zero
eventualmente; (b)/(c) mudam uma regra usada pela população inteira
(bots incluídos) para consertar um problema que afeta uma fatia
pequena — precisa medir se não abre uma folga que a IA em geral explora
(ex.: um bot recém-criado "sem histórico" nunca cair de posição
enquanto não joga).

**(ii) — Dar prioridade a quem espera há mais tempo na loteria de
formação.** Hoje: `selectPair` pesa só compatibilidade + proximidade de
rank — nenhum termo de "há quanto tempo está livre". Um piso/prioridade
por tempo de espera (mesmo padrão do `OPEN_TIER_RESERVED_SHARE` da Fase
5.1, aplicado aqui em vez de na entrada de torneio) resolveria
diretamente a causa raiz medida em §2 (atraso na loteria, não a
loteria em si). **Risco**: precisa registrar "desde quando" cada atleta
está livre (campo que hoje não existe — `market_status:'livre'` não tem
timestamp) e decidir o que "espera" significa pra quem dissolveu e
reformou várias vezes.

**Nenhuma das duas implementada.** Ambas mudam comportamento da
população inteira (bots incluídos), não só de reais — pedem medição de
impacto antes de aplicar, no mesmo padrão da Fase 5.

## Entrega

| # | Item | Status |
|---|---|---|
| 0 | Hipóteses (A) e (B) do pedido | ✅ ambas refutadas por leitura de código, com o caminho exato |
| 1 | Rastreio semana a semana | ✅ 7 reais, 2 runs de 2 temporadas (atual vs. pré-Candidato-B), mesma seed |
| 2 | Hipótese confirmada, com caminho de código | ✅ mecanismo de DOIS estágios: loteria de formação (`selectPair`) + penhasco do `legacy_seed` aos 364 dias (`rankingWindow.js`) |
| 3 | Taxa de dissolução antes/depois da Fase 5 | ✅ **praticamente idêntica** (1,91 vs 1,83 reais/mês) — não é a causa; o que muda é a sorte individual na loteria, não o volume |
| 4 | Reavaliação do registro da Fase 4 | ✅ mecanismo já existia intacto na Fase 4.2 (código inalterado, git log confirma); ela não checou status de parceria — quarta instância da classe, com nuance própria (interação entre dois sistemas corretos, não erro de leitura) |
| 5 | Correção proposta, não implementada | ✅ duas frentes independentes propostas (suavizar o penhasco / priorizar espera na loteria), riscos de cada uma registrados |
| 6 | Suíte, lint, build OK | ✅ lint 0 · build OK · suíte 33/36 (92/100, mesmas 3 falhas pré-existentes) · `src/` sem diferença contra HEAD (instrumentação `DIAG_MARKET` revertida, grep confirma zero ocorrências) |

## Validação

Nenhuma correção foi implementada nesta fase (item 5 é proposta, não
código) — o único código tocado foi a instrumentação temporária
`DIAG_MARKET`/`DIAG_MARKET_IDS` em `aiPartnershipLifecycle.js`,
totalmente revertida (`git diff -- src/` vazio, grep de `DIAG_MARKET`
zero ocorrências) antes deste commit. `circuitCatalog.js` foi trocado
temporariamente para o estado da Fase 5.5 (comparação isolada do
Candidato B, §3) e restaurado ao HEAD logo após o segundo run carregar
o módulo — confirmado sem diferença no commit final.

- `npm run lint` — limpo.
- `npm run build` — OK (mesmo aviso pré-existente de chunk >500kB).
- Suíte de regressão — 33/36, score 92/100, as mesmas 3 falhas
  pré-existentes (`test:rc-gameplay-balance`, `test:career-pace`,
  `test:ui-quality`), nenhuma relacionada a este achado.
- `src-tauri/` intocado.
- Arquivos auto-regenerados pela suíte revertidos antes do commit.
