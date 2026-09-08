# Fase 4.3 — Fechar a armadilha de ranking e o crescimento da coleção

> Pré-requisito: Fase 4 entregue (ranking rolling de 52 semanas,
> commit `8ff09f2`). Ver [FASE-4-RANKING-ROLLING-RELATORIO.md](FASE-4-RANKING-ROLLING-RELATORIO.md).
> Esta fase fecha dois diagnósticos pendentes antes da Fase 5 — o
> primeiro pode mudar o desenho dela, por isso vem primeiro.

## Método

Instrumentação temporária (`DIAG_TRACE_ATHLETES`, ids separados por
vírgula) adicionada a `circuitLifecycle.js` (posição/pontos/tier/parceria,
semanal) e `WorldTourLifecycle.js` (presença em dupla canônica e decisão
de `chooseTournament`, por semana) — revertida integralmente depois de
extrair os achados (confirmado por grep, zero ocorrências restantes).
Rodada de 5 temporadas oficiais (`official-900-100-s1`, 900+100),
rastreando Pablo García e Eduardo Agustín Torre — os 2 reais que o achado
#29 (Fase 4) encontrou na interseção de "nunca jogaram em nenhuma das 5
temporadas".

## 1 — Diagnóstico da armadilha: nem hipótese 1, nem hipótese 2 sozinha

**Hipótese 1 (retroalimentação — ranking baixo tira elegibilidade dos
tiers que a IA prioriza): REFUTADA.** Em toda semana rastreada,
`evaluateTournamentEntry` reconheceu corretamente Bronze/Silver
(`min_ranking: 0`) como elegíveis sempre que oferecidos. A elegibilidade
nunca foi o problema.

**Hipótese 2 (sem parceiro, causa simples): parcialmente confirmada, mas
incompleta.** Os dois começam com `partner_id: null` no registro-fonte e
passam a temporada 1 inteira sem parceiro — confirmado, `partner=NENHUM`
toda semana de 2026. Isso explica sozinho a temporada 1. Mas os dois
EVENTUALMENTE são pareados pelo mercado de IA (Eduardo em 2027-05 com o
bot "Emiliano Alonso"; Pablo em 2028-03 com o bot "Lucas Giménez 943") —
e a exclusão continua depois disso. "Sem parceiro" não explica as
temporadas 2-5.

**Mecanismo real, confirmado por código E por dado ao vivo: capacidade
fixa nos tiers de acesso livre, sem fila.**
`WorldTourLifecycle.js:resolveCompletedWorldTourEvents` monta cada chave
assim:

```js
let entrants = [...(assignments.get(tournament.id) || [])];
if (entrants.length < drawSize) { /* backstop do achado #22 — já corrigido */ }
const ordered = entrants.sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament)).slice(0, drawSize);
```

Se MENOS pares escolheram o torneio que vagas existem, o backstop do
achado #22 completa a chave — mecanismo correto. Mas se MAIS pares
escolheram do que vagas existem (o caso oposto), a última linha descarta
o excesso SILENCIOSAMENTE — nenhum aviso (o único `console.warn`
existente cobre só o caso de poucos pares), nenhuma fila, nenhuma nova
tentativa na semana seguinte.

Bronze e Silver (`mainDrawSize: 16` cada, ~24+16 = 40 eventos/temporada)
somam ~640 vagas/temporada — e são os ÚNICOS tiers que um atleta de
ranking baixo pode escolher, então todo atleta nessa situação (não só
estes 2 reais) converge para essas mesmas ~640 vagas.

**Confirmado numericamente**: nas 5 temporadas rastreadas, os dois
atletas tiveram **92 decisões de "jogar" (`decisao=play`) — e 0/92
resultaram em um único ponto ganho.** Toda vez que a IA corretamente
escolheu Bronze ou Silver, a dupla perdeu a disputa por `pairScore` (que
pesa `overall_rating` médio — um parceiro bot fraco derruba a média o
bastante para perder, mês após mês).

**Ponto sem retorno**: semana 54 (2027-01-03) para Eduardo — a âncora
sintética de migração expira sem nenhum resultado novo, pontos caem de
1591 para 0 e nunca mais saem de lá, nem depois de arranjar parceiro e
tentar repetidamente. Padrão análogo para Pablo.

**É a mesma classe de bug citada no pedido** (`processWorldCircuit` da
Fase 1.5: truncamento por capacidade disfarçado de corte por mérito) —
confirmado, não só por analogia. A REGRA de elegibilidade está certa; a
PRATELEIRA (capacidade) não escala com quem precisa dela, e quem perde a
vaga nunca é reconsiderado.

### Piso proposto — não implementado, registrado para o desenho da Fase 5

A versão ingênua de "piso" (garantir elegibilidade em `minRanking: 0`)
não resolveria nada — a elegibilidade já está correta. O problema é a
fila. Um piso funcional precisa de uma das duas:

1. Reservar um número de vagas por chave de Bronze/Silver para pares sem
   NENHUMA outra opção elegível naquela semana (prioridade, não
   `pairScore` puro, para essa fatia da chave); ou
2. Escalar a oferta de Bronze/Silver (mais eventos/temporada, ou
   `mainDrawSize` maior) com o tamanho da fatia da população que só tem
   esses dois tiers como opção — que cresce com o tempo, porque o próprio
   ranking rolling (Fase 4) empurra mais atletas pra baixo à medida que as
   temporadas passam.

Sem uma das duas, qualquer redesenho da Fase 5 que só amplie
elegibilidade herda a mesma armadilha.

## 2 — `AthleteRankingResult`: estabiliza, não cresce sem limite

Contagem de linhas ao fim de cada temporada (mesma rodada de
rastreamento, `DIAG_SIZES`):

| Temporada | Linhas | Variação |
|---|---|---|
| 1 (2026) | 4528 | — (inflada pela migração: toda a população ganha uma âncora sintética no primeiro toque) |
| 2 (2027) | 3891 | **-14%** (âncoras da temporada 1 começam a expirar na semana 54 — poda funcionando como desenhada) |
| 3 (2028) | 4165 | +7% |
| 4 (2029) | 4357 | +5% |
| 5 (2030) | 4555 | +5% |

**Estabiliza.** O crescimento residual entre temporadas 2-5 (~5-7%/ano)
acompanha o crescimento lento da própria população (novos prospects
gerados mensalmente) — não um vazamento da coleção.

**Decisão: nada a fazer.** A poda por idade (364 dias) já é suficiente —
visível no próprio corte de -14% entre temporada 1 e 2. Este NÃO é o
mesmo padrão das 6 ocorrências anteriores desta auditoria (aquelas eram
coleções sem NENHUMA poda; esta tem poda e ela funciona).

**Correção do registro do achado #29**: a atribuição anterior do
crescimento de custo por temporada ("a coleção escala com o próprio
tamanho, que cresce ao longo de múltiplas temporadas") estava ERRADA — a
coleção não cresce como se pensava depois da temporada 1. O crescimento
de custo real (temporada 1 ≈366,7s de laço diário → temporada 3
≈701,1s) é melhor explicado pelo padrão já registrado (achados #18/#23:
o save inteiro cresce a cada temporada) somado a uma leitura de
`AthleteRankingResult` cara mas aproximadamente CONSTANTE
(~4000-4600 linhas/leitura) — um imposto fixo a mais por semana/torneio,
não um imposto que composto.

**Consulta indexada por atleta — não é possível nesta arquitetura, e não
ajudaria mesmo se fosse.** `CareerEntityRepository` (toda a camada de
armazenamento local) não tem nenhum mecanismo de índice — `.filter()` e
`.list()` fazem uma varredura linear completa do array em memória, sempre,
para qualquer consulta. Uma consulta "por atleta e janela de data"
custaria exatamente o mesmo que a leitura atual (`O(tamanho da coleção)`)
se feita uma vez só; feita uma vez POR ATLETA (a alternativa cogitada)
custaria `O(população × tamanho da coleção)` — estritamente PIOR. O
padrão atual (uma leitura da coleção inteira por passada semanal,
agrupamento em memória via `Map`) já é o ótimo possível dado que este
armazenamento não tem índice.

## 3 — Implicação para a Fase 5

Reais venceram 381/400 títulos (95,25%) nas 5 temporadas MESMO com o
ranking agora sujeito a queda — confirma que força competitiva
(`overall_rating`, usada pelo motor de partida) e posição de ranking
(atividade recente) são coisas diferentes, e que a Fase 4 não criou um
problema de "reais não vencem mais".

**O problema que resta não é fazer os reais vencerem — já vencem sem
agenda dedicada.** É fazê-los APARECER nos lugares certos: presentes em
Crown/Elite/Masters (onde o corte de ranking naturalmente os favorece,
dado seu histórico) e, no mínimo, presentes de forma proporcional em
Bronze/Silver quando caem — o que hoje não acontece, por causa exata do
mecanismo de capacidade fixa do item 1.

**Isso reduz o escopo da Fase 5** de "balancear dominância" (problema mal
definido — a dominância já existe e é saudável) para "distribuir
presença" (problema mais estreito: garantir que ranking baixo não vire
clausura, resolvendo o gargalo de capacidade do item 1 antes de qualquer
agenda nova).

## 4 — Suíte, lint, build, Tauri

- Instrumentação temporária revertida integralmente — confirmado por grep
  (`DIAG_TRACE_ATHLETES`, zero ocorrências em `src/`).
- `npm run lint` — limpo, sem avisos, em todo o repositório.
- `npm run build` — OK.
- Nenhum arquivo de `src-tauri/` tocado — `test:dev-server-config`
  aprovado.
- Suíte de regressão completa (19 scripts, incluindo os 5 novos das
  Fases 4.0/4) — exit 0, sem nenhuma linha de FAIL/GATE FALHOU.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Diagnóstico da armadilha, com proposta de piso não implementada | ✅ mecanismo real identificado (capacidade fixa + sem fila nos tiers livres, 92/92 tentativas sem resultado) — nem hipótese 1 nem hipótese 2 sozinhas explicavam; piso proposto (reserva de vaga OU capacidade escalável), não implementado |
| 2 | Curva de `AthleteRankingResult` por temporada e decisão | ✅ estabiliza a partir da temporada 2 (4528→3891→4165→4357→4555) — nada a fazer; registro do achado #29 corrigido |
| 3 | Escopo da Fase 5 registrado | ✅ de "balancear dominância" para "distribuir presença" |
| 4 | Suíte verde, lint, build, Tauri OK | ✅ |

**Resumo executivo**: a exclusão permanente de 2 reais não era nem a
retroalimentação de ranking hipotetizada nem simplesmente falta de
parceiro — era uma armadilha estrutural real, do mesmo tipo já visto na
Fase 1.5 (capacidade que não escala, truncamento disfarçado de corte por
mérito), agora confirmada por código e por 5 temporadas de dado ao vivo.
Fica registrada e não corrigida, por instrução explícita — a Fase 5 herda
um diagnóstico preciso, não um sintoma vago. O crescimento da nova
coleção de ranking, por outro lado, não era um problema: estabiliza
sozinho, e a correção do registro anterior evita que uma sessão futura
persiga um custo que na verdade já não está crescendo.
