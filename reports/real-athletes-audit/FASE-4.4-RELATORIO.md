# Fase 4.4 — Dimensionar a população e a capacidade antes de decidir

> Pré-requisito: Fase 4.3 entregue (a exclusão permanente de 2 reais
> diagnosticada como capacidade fixa sem fila em Bronze/Silver, não como
> "sem parceiro" nem retroalimentação de ranking). Ver
> [FASE-4.3-RELATORIO.md](FASE-4.3-RELATORIO.md). Esta fase mede se aquele
> achado é caso de borda ou padrão estrutural, em duas escalas de
> população — nenhuma implementação, só números para decidir.

## Método

Instrumentação temporária (`DIAG_CAPACITY`, `DIAG_INJECT_CLIMBER`,
revertida integralmente após medir — confirmado por grep, zero
ocorrências restantes) em `WorldTourLifecycle.js` (demanda vs. capacidade
por torneio, co-entrantes de chave) e no harness (atleta sintético
"climber" com parceiro garantido e protegido, isolando a pergunta de
ascensão da armadilha do achado #30). Regime-check completo de 5
temporadas rodado duas vezes, mesma seed `official-900-100-s1`: escala
oficial (900 procedurais + 100 reais = 1000) e escala reduzida (400
procedurais + 100 reais = 500).

## 1 — Demanda vs. capacidade na base do circuito (escala 1000)

| Temporada | Razão demanda/capacidade | Duplas escolheram mas nunca jogaram |
|---|---|---|
| 2026 | 9,99× | 228/402 (56,7%) |
| 2027 | 15,29× | 349/517 (67,5%) |
| 2028 | 15,35× | 334/511 (65,4%) |
| 2029 | 15,56× | 311/510 (61,0%) |
| 2030 | 15,11× | 340/499 (68,1%) |

Em regime estável (temporadas 2-5), a razão fica entre **15× e 15,6×** —
muito acima do "perto de 1" que validaria o piso proposto na Fase 4.3, e
muito acima do "2-3×" que ainda seria corrigível por regra de reserva.
**Entre 6 e 7 de cada 10 duplas que tentam Bronze/Silver num ano ficam de
fora inteiramente** — não é caso de borda, é a norma. Nenhuma chave
incompleta em nenhuma temporada (0/80) — o problema nunca foi faltar
gente, foi a chave ser pequena demais pra quem precisa dela.

Confirma a leitura do próprio pedido: o circuito real tem a proporção
oposta (FIP Tour, 200+ eventos de base contra 26 no topo — a base
absorve todo mundo). Aqui, Bronze+Silver somam ~40 eventos/temporada
(640 vagas) contra uma demanda que cresce com a própria população.
**Nenhuma regra de reserva de vaga resolve uma razão de 15×** — é
subdimensionamento de calendário.

## 2 — Comparação 500 vs. 1000

### (a) Capacidade

| | 1000 | 500 |
|---|---|---|
| Razão demanda/capacidade (regime, temp. 3-5) | 15,3-15,6× | 6,7-7,1× |
| Duplas escolheram mas nunca jogaram (regime) | 61-68% | 36-42% |
| Chaves incompletas | 0/80 todas | 0/80 todas |

Cortar a população pela metade corta a razão e a taxa de exclusão em
quase metade — **melhora real**. Mas mesmo a 500, mais de 1 em cada 3
duplas que tentam a base ficam de fora num ano típico — **não resolve**.

### (b) Presença dos reais

| | 1000 | 500 |
|---|---|---|
| Títulos 100%-real (de 400) | 373 (93,3%) | 378 (94,5%) |
| Crown 100%-real | 4/4 todas as 5 temporadas | 4/4 todas as 5 temporadas |
| Elite 100%-real | 9-10/10 todas as 5 temporadas | 9-10/10 todas as 5 temporadas |
| Top 20 (reais), curva | 20,15,11,8,7 (100%→35%) | 20,15,12,12,10 (100%→50%) |
| Reais que nunca jogaram (5 temp.) | 1/100 (Pablo García) | 1/100 (Luciano Capra) |

Quem vence não muda com a escala (skill-driven, confirmado achado #29).
Crown/Elite são idênticos nas duas escalas — os cortes de acesso do topo
já são exclusivos o bastante pra não sentir a população abaixo. A curva
de dominância do Top 20 cai MENOS a 500 (menos concorrência total dilui
menos o topo). O real permanentemente excluído muda de nome entre as
duas rodadas — confirma que é probabilístico (achado #27), não um alvo
fixo.

### (c) Repetição de adversários

| | 1000 | 500 |
|---|---|---|
| Distintos/temporada (reais) | 152,5 | 139,0 |
| Distintos totais 5 anos (reais) | 307,9 | 268,6 |
| Taxa de reencontro — reais | 44,9% | 49,1% |
| Taxa de reencontro — bots (amostra) | 43,3% | 52,2% |

Proxy: co-entrantes na mesma chave, não confronto rodada-a-rodada (o
motor não simula isso). Efeito real mas modesto (+4 a +9 pontos, não
dobra). **O dado mais importante corrige uma expectativa**: já a 1000,
quase metade dos adversários de um real recorrem em anos diferentes —
rivalidades já são estatisticamente plausíveis na escala atual, ao
contrário do "com 970 bots anônimos, provavelmente não são" hipotetizado.

### (d) Velocidade de ascensão

Atleta sintético (overall 85), parceiro garantido e protegido desde o
dia 1 — isolando deliberadamente esta pergunta da armadilha do achado
#30, que é outro problema.

| Marco | 1000 | 500 | Diferença |
|---|---|---|---|
| Top 100 | mês 20 | mês 18 | 2 meses (~10%) |
| Top 20 | mês 30 | mês 22 | 8 meses (~27%) |
| Top 10 | mês 47 | mês 35 | 12 meses (~26%) |
| Posição final (ano 5) | #7 | #5 | — |

Cortar a população pela metade **não** dobra a velocidade em nenhum
ponto. O efeito é pequeno pra sair da obscuridade (top 100) e mais
relevante pra entrar na elite (top 10-20) — quase uma temporada inteira
de diferença lá, não cá.

### (e) Custo

| | 1000 | 500 |
|---|---|---|
| Tempo de parede (5 temporadas) | 47min8s | 42min56s |
| Heap por temporada (pico) | 783,3→958,1MB | 695,4→890,9MB |

Cortar a população pela metade economiza só **8,9%** do tempo de parede
— desproporcional. A contagem de torneios/temporada é FIXA por config
(`circuitCatalog.js`), independente de `--proceduralAthletes` — só o
tamanho do array de duplas iterado por torneio encolhe. **Corte de
população não se paga em custo por si só.**

## 3 — Inventário de controles de progressão

### (1) Qualidade do parceiro como porta de acesso — achado principal

O mecanismo já existe, está bem desenhado, e está **completamente
desconectado**. `calculatePartnershipInterest`
(`src/players/teamCompatibility.js:67`) calcula um `score` de interesse
real: compatibilidade tática (35%), reputação do jogador (30%),
progresso de ranking do jogador (35%), menos demanda do candidato ser
elite (-15%, um atleta muito bem-rankeado é mais difícil de atrair) —
com textos corretos ("sua reputação ainda limita o interesse", "melhore
ranking, reputação ou condições da proposta").

**Mas o campo `available` — o único que `buildInitialPartnerOffers`
(`src/lib/partnerOfferRules.js:7`) usa pra decidir se o candidato
aparece como opção — nunca lê o `score`:**

```js
available: athlete?.career_status !== 'aposentado'
```

Um jogador no fundo do ranking, com reputação zero, pode ver e contratar
imediatamente o melhor atleta do jogo — `startPartnership`
(`src/lib/partnershipSystem.js:254`) também não tem checagem própria.
Toda a máquina de "convencer alguém melhor" já está escrita e correta —
nunca foi ligada ao portão.

**Este é o controle mais barato e de maior alavancagem disponível para a
Fase 5**: religar `available` (ou uma checagem em `startPartnership`) ao
`score` já calculado transforma a subida em algo narrativo, sem nenhuma
mecânica nova — só destravar a existente.

Achado adicional: `generatePartnerProposals`
(`src/lib/partnershipSystem.js:593`) é código morto (zero chamadores) —
um sistema de propostas paralelo, mais simples, nunca ligado a nada. O
fluxo real é `PartnerHub.jsx` → `partnerOffers.js` → `partnerOfferRules.js`.

### (2) Pontos por tier e cortes de acesso

Já em config (`circuitCatalog.js:TOURNAMENT_TIER_CONFIG`, Fase 3A) —
`minRanking`/`rankPoints`/`mainDrawSize` por tier, central e já tunável.

### (3) Ritmo de evolução de atributos

Sistema maduro e já calibrado (`trainingSystemV2.js`):
`getAttributeDevelopmentCeiling` (teto por atributo, dependente de
`potential`, com bônus de especialização — Fase 13.1 já calibrou pra
deixar uma carreira "média" abaixo do Top 10-20 real de propósito),
`getDevelopmentWindow` (retorno decrescente perto do teto, 1× a 0,08×),
`getDiminishingMultiplier` (fadiga de repetição na mesma semana). Já é
lever, não precisa de construção.

### (4) Janela dos 22 melhores/52 semanas

Já construída na Fase 4 (`rankingWindow.js`) — já pune resultado isolado
sem consistência sustentada, por design.

### Conclusão do item 3

Dos 4 controles pedidos, **3 já existem prontos e tunáveis** (pontos por
tier, ritmo de atributos, janela de consistência). **O quarto — parceiro
como porta de acesso — existe calculado mas não aplicado.** É a peça que
falta, e é a mais barata de destravar.

## 4 — Suíte, lint, build, Tauri

- Instrumentação temporária revertida integralmente — confirmado por
  grep (`DIAG_CAPACITY`, `DIAG_INJECT_CLIMBER`, e todas as variáveis
  associadas, zero ocorrências em `src/`/`scripts/`).
- `npm run lint` — limpo, sem avisos, em todo o repositório.
- `npm run build` — OK.
- Nenhum arquivo de `src-tauri/` tocado.
- Suíte de regressão completa (19 scripts) — exit 0, sem nenhuma linha de
  FAIL/GATE FALHOU.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Números de demanda/capacidade, razão explícita | ✅ 15,3-15,6× em regime (escala 1000) — subdimensionamento de calendário, não caso de borda |
| 2 | Comparação 500 vs. 1000 nos 5 eixos | ✅ capacidade melhora ~50% sem resolver; presença no topo idêntica; reencontro de adversários já alto nas duas escalas; ascensão 10-27% mais rápida a 500 (mais no topo que na entrada); custo cai só 9% |
| 3 | Inventário de controles de progressão | ✅ 3 de 4 já prontos; o do parceiro existe calculado, não aplicado — maior alavancagem, menor custo |
| 4 | Suíte verde, lint, build OK | ✅ |

**Resumo executivo**: o gargalo de capacidade na base do circuito não é
um efeito de dois atletas azarados — é estrutural, mede 15× em regime na
escala atual, e nenhuma regra de fila o resolve sozinha. Cortar a
população pela metade ajuda a capacidade e a velocidade de ascensão pro
topo, mas não resolve o gargalo, não muda quem vence, e não se paga em
custo. O controle de progressão mais promissor que a Fase 5 poderia usar
— qualidade do parceiro como porta de acesso — já está construído,
calculado corretamente, e simplesmente nunca foi conectado à decisão de
quem aparece como opção. Com estes números, a decisão de população e o
desenho da Fase 5 ficam com base de dado, não de expectativa.
