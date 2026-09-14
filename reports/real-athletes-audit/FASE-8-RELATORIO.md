# Fase 8 — Balanceamento: medindo contra as metas originais da Fase 0

> **COMPLETA.** Regime-check de 5 temporadas rodado duas vezes (calendário atual e
> topo-120, ambos com a configuração de produção corrente — escada de tiers, ranking
> rolling, teto 150, Candidato B, qualifying + janela N=4/rate, sem nenhuma flag de
> diagnóstico exceto `DIAG_TOP_EVENTS` para o segundo cenário, que é puro dado de
> calendário do harness). Todas as 8 metas de `docs/tournament-targets.md` comparadas
> uma a uma. Dois achados adicionais, fora do pedido original mas descobertos na
> medição: (1) o acesso do JOGADOR nunca teve o mecanismo de qualifying/janela — é
> um sistema inteiramente separado, com uma lacuna real; (2) 3 das 6 duplas reais
> confirmadas (protegidas) param de parear por volta da T4, em AMBOS os cenários de
> calendário — não é efeito de calendário, é um problema à parte, registrado aqui e
> não corrigido (fora de escopo desta fase).

## 0 — Mapeamento de nomenclatura (decisão necessária antes de medir)

`docs/tournament-targets.md` usa a nomenclatura do pedido original (Major/P1, P2,
Gold/Platinum, Bronze/Silver) e deixa o mapeamento pros tiers reais do catálogo
(`Bronze/Silver/Gold/Platinum/Masters/Elite/Crown`) como decisão pendente da fase que
fizesse a medição. Adotado aqui, pela posição na hierarquia (`TOURNAMENT_TIER_CONFIG`,
`order`) — a correspondência mais direta já sugerida pelo próprio documento de metas:

| Nomenclatura da meta | Tiers do catálogo |
|---|---|
| Major / P1 | Elite + Crown |
| P2 | Masters |
| Gold / Platinum | Gold + Platinum |
| Bronze / Silver | Bronze + Silver |

`Circuit Finals`/`Legacy Finals` (eventos de convite só pro topo do ranking) ficam de
fora do mapeamento — o documento de metas não os menciona, e são estruturalmente
diferentes (campo de 1 dígito, por convite, não por corte de ranking).

## 1 — Regime-check: metodologia

Duas rodadas de 5 temporadas completas, população oficial (900 procedurais, 100
reais, seed `official-900-100-s1`), com o código de produção corrente e SEM nenhuma
variável `DIAG_*` além de `DIAG_TOP_EVENTS` (puramente dado de calendário do harness,
não afeta gameplay):

- **Atual** — calendário de produção sem alteração.
- **Topo-120** — `DIAG_TOP_EVENTS=120` (Gold/Platinum/Masters ampliados, mesmo
  override já usado nas Fases 6.7-7.4).

O harness ganhou uma pequena instrumentação de RELATÓRIO nesta fase (não de gameplay):
`tournamentsPlayedThisSeason.real` agora inclui `min`, `belowTargetCount` e uma
amostra de quem fica abaixo de 12 eventos — a meta de participação exige verificação
INDIVIDUAL, que a média/mediana sozinhas não respondem.

## 2 — Metas, uma a uma

### 2.1 — Metas por tier (título 100%-reais, agregado ponderado das 5 temporadas)

| Meta | Alvo | Atual | Topo-120 | Status |
|---|---|---|---|---|
| Major/P1 (Elite+Crown), T1-3 | ≥ 70% | **100%** (42/42) | **100%** (42/42) | ✅ **Atingida** (excede) |
| P2 (Masters), todas | 40-60% | **100%** (50/50) | **97,7%** (215/220) | ❌ **Não atingida** — domínio real muito acima do teto pretendido, nos dois cenários |
| Gold/Platinum, todas | < 15% | **84,3%** (59/70) | **50,8%** (157/309) | ❌ **Não atingida** — topo-120 melhora muito (84,3%→50,8%) mas continua 3,4× acima do alvo |
| Bronze/Silver, todas | ~0% | **10,5%** (21/200) | **20,0%** (40/200) | ⚠️ **Parcial** — atual está relativamente perto; topo-120 PIORA este eixo especificamente (ver §4) |

**Leitura**: o topo do circuito (Elite/Crown) está calibrado corretamente — reais
dominam como esperado, sem exagero medido (100% é o próprio piso do que a meta pedia,
não uma sobra). O meio do circuito (Masters/Gold/Platinum) está sistematicamente
DESEQUILIBRADO PRA MAIS: mesmo depois de toda a correção da espiral de exclusão
(Fase 7-7.4), que resolveu quem ENTRA, quem VENCE dentro da chave continua dominado
quase inteiramente por reais em qualquer tier acima da base — o teto de entrada por
tier (Fase 5.4-5.6) nunca foi desenhado pra limitar quem vence, só quem entra. Bronze/
Silver (a base) é o único par de tiers relativamente perto do alvo em qualquer
cenário — mas nem ele bate exatamente ~0%.

### 2.2 — Participação: ≥12 eventos por temporada, temporada 1 individualmente

| | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| Atual — mediana | 10 | 7 | 8 | 2 | 3 |
| Atual — abaixo de 12 (individual) | **63/100** | 62/100 | 58/95 | 62/91 | 65/86 |
| Topo-120 — mediana | 36 | 18,5 | 21 | 15 | 15 |
| Topo-120 — abaixo de 12 (individual) | **11/100** | 31/100 | 20/95 | 35/91 | 36/86 |

❌ **Não atingida em nenhum dos dois cenários** — a meta exige ZERO reais abaixo de
12/temporada, já na T1. No calendário atual, **63% dos reais** ficam abaixo do piso
já na primeira temporada (mediana 10, `min=2`) — pior que uma média aceitável
esconderia (a Fase 0 já havia previsto exatamente esse risco ao exigir verificação
individual, não só agregada). Topo-120 é uma melhora GRANDE (11/100 na T1, mediana
36) mas ainda não zera, e a situação de ambos os cenários piora nas temporadas
seguintes (a população de reais "ativos" no topo do ranking se concentra, e o resto
da base joga cada vez menos — o mesmo padrão de "reais que não jogaram" crescendo
por temporada, medido desde a Fase 2).

### 2.3 — Duplas históricas pareadas em ≥90% dos eventos

`docs/tournament-targets.md` cita "as 12 duplas de `worldSeed2025.json`" — o harness
rastreia 50 duplas reais no total, mas só **6 são "confirmadas"** (pares reais de
torneio, marcados `ai_partnership_protected:true`, que só deveriam se desfazer por
evento narrativo explícito) — as outras 44 são "prováveis"/"iniciais", que o mercado
PODE dissolver normalmente por desenho (Fase 6.1/6.2). A meta de ≥90% só faz sentido
pras 6 confirmadas — medir contra as 50 mediria o comportamento ERRADO (churn
esperado de pares não-protegidos).

| Dupla confirmada | T1 | T2 | T3 | T4 | T5 | (Atual) |
|---|---|---|---|---|---|---|
| Coello & Tapia | 100% | 100% | 100% | 100% | 100% | |
| Galán & Chingotto | 100% | 100% | 100% | 100% | 100% | |
| Lebrón & Augsburger | 100% | 100% | 100% | 100% | 100% | |
| Esbrí & Ruiz | 100% | 100% | 100% | **0%** | **0%** | |
| Quílez & Mouriño | 100% | 100% | 91,7% | **0%** | **0%** | |
| Geens & Guichard | 100% | 100% | 100% | 91,7% | **0%** | |

(Idêntico em topo-120 — as mesmas 3 duplas caem a 0% nas mesmas temporadas, byte a
byte quase; ver §5, achado à parte.)

⚠️ **Parcial** — a meta é cumprida com folga nas temporadas 1-3 (5-6 das 6 duplas
em 100%), mas **3 das 6 duplas param de jogar juntas inteiramente (0%) por volta da
T4**, apesar da flag de proteção. Isso não é efeito de calendário (idêntico nos dois
cenários) — é tratado como achado separado, não corrigido nesta fase (§5).

### 2.4 — Jogador #1000: ≥15 eventos elegíveis no ano 1, intervalo máximo ≤21 dias

| | Atual | Topo-120 |
|---|---|---|
| Eventos elegíveis (T1) | 40 | 40 |
| Intervalo máximo | 14 dias | 14 dias |

✅ **Atingida com folga, nos dois cenários** — usando a função de elegibilidade real
do jogo (`evaluateTournamentEntry`/`buildAthleteEntryContext`), não um caminho
interno. Estável nas 5 temporadas nos dois cenários (o número de eventos abertos
pro rank #1000 não muda com o tamanho do topo do calendário, que é exatamente onde
`DIAG_TOP_EVENTS` mexe — Gold/Platinum/Masters, tiers que o rank #1000 não alcança).

### 2.5 — Zero chaves incompletas

| | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| Atual | 2/79 | 1/79 | 2/80 | 1/79 | 1/79 |
| Topo-120 | **14/160** | 3/161 | 4/162 | 2/160 | 3/161 |

❌ **Não atingida em nenhum dos dois cenários.** O calendário atual fica numa taxa
baixa e estável (~1-2,5%). Topo-120 tem uma T1 bem pior (8,75% — o campo maior ainda
não tem gente suficiente pra preencher todo o novo volume de chaves logo de saída),
convergindo pra uma taxa parecida (~2%) a partir da T2. Nenhum dos dois cenários
chega a zero em nenhuma temporada.

## 3 — Acesso do jogador: lacuna real confirmada

**A correção de qualifying/janela (Fase 7.1-7.4) NUNCA tocou o caminho de registro do
jogador.** São dois sistemas inteiramente separados, que só compartilham o nome
"qualifying":

- **Simulação de fundo (IA)**: `WorldTourLifecycle.js:applyEntryPriority` — qualifying
  é uma fatia FIXA (12,5% do draw) sempre disputada por um mini-bracket, em QUALQUER
  tier oversubscrito; vencer garante `PRIORITY_WINDOW_N=4` aparições seguidas.
- **Registro do jogador**: `tournamentRegistration.js` → `EntryManager.js:
  evaluateTournamentEntry`. O "caminho qualifying" aqui só existe se
  `config.qualifyingSize > 0` — e, checando `TOURNAMENT_TIER_CONFIG`
  (`circuitCatalog.js`), **isso só está configurado para o Crown** (`qualifyingSize:
  16`). Gold, Platinum, Masters e Elite não têm NENHUM path de qualifying pro
  jogador — se o rank cai abaixo do corte direto desses tiers, o resultado é
  `INELIGIBLE`, ponto final.
- Mesmo onde existe (Crown), **não há window nenhuma** — vencer o qualifying do
  jogador garante entrada NAQUELE evento, não numa sequência de torneios seguintes.
  É exatamente o desenho de "resgate pontual" que a Fase 7.2 mediu como insuficiente
  pra atletas de IA (90-100% de reincidência) — nunca substituído por algo melhor
  pro jogador.
- As únicas outras portas (`wildcard_tokens`, `protected_ranking`,
  `special_exempt_until`, `junior_reputation`, `national_reputation`) são checadas
  em `EntryManager.js` mas **nunca são concedidas por nenhum sistema do jogo**
  (`grep` em `src/` inteiro confirma: zero ocorrências fora de `EntryManager.js` e
  de um teste unitário) — são portas estruturalmente mortas hoje, não uma rede de
  segurança real.

**Conclusão**: se o rank do jogador cair abaixo do corte de Gold/Platinum/Masters/
Elite (por uma temporada ruim, perda de parceiro, lesão), **não existe nenhum
caminho de volta** — nem disputa, nem convite, nem espera. Isso é literalmente a
Fase 7 original (a espiral de exclusão), nunca resolvida pro jogador — só pro elenco
de IA que a simulação de fundo controla. **Recomendação**: uma fase futura deveria
levar a mesma correção (qualifying real como fatia disputável, não um interruptor
`qualifyingSize>0`/`0`, mais uma janela de prioridade equivalente) pro caminho do
jogador — não implementado aqui, por estar fora do escopo de medição desta fase.

## 4 — Decisão de calendário

**Topo-120 deveria ser formalmente adotado.** O calendário atual falha
claramente a meta mais concreta e verificável de todo o documento de metas
(participação individual ≥12/temporada): 63% dos reais abaixo do piso já na
temporada 1. Topo-120 reduz isso pra 11% na mesma temporada — uma melhora de quase
6× — sem piorar nenhuma outra meta de forma que mude o veredito dela:

- Zero chaves incompletas: nenhum dos dois bate a meta; topo-120 só é
  perceptivelmente pior na T1 (8,75% vs. 2,5%), convergindo depois.
- Gold/Platinum: topo-120 melhora MUITO (84,3%→50,8%), embora ainda não bata <15%.
- Bronze/Silver: topo-120 é o único eixo que PIORA (10,5%→20,0%) — mas o alvo "~0%"
  já não estava sendo cumprido no atual, e a mudança não inverte o veredito
  (continua "parcial" nos dois).
- P2/Masters, pareamento de duplas, acesso do #1000: sem diferença de veredito
  entre os dois cenários.

Isso fecha a linha de dimensionamento de calendário aberta desde a Fase 6.6: depois
de topo-76 ter sido descartado por instabilidade de forma (Fase 7.4), topo-120 é a
opção que resta com evidência favorável, medida agora sob a configuração de
produção completa (não a versão pré-janela usada nas Fases 6.7/7.1-7.3).

**Ação necessária, não implementada nesta fase (medição, não código)**: fixar
`TIER_EVENTS_PER_YEAR` em `src/lib/circuitCatalog.js` com os valores de topo-120
(`Gold: 35, Platinum: 27, Masters: 44`, substituindo `Gold: 8, Platinum: 6,
Masters: 10`) como configuração PERMANENTE de produção — mesmo padrão de promoção
já usado pra janela de prioridade na Fase 7.4 (valor fixo, sem variável de
ambiente). Fica registrado como o próximo passo de código, fora do escopo desta
fase de medição.

## 5 — Achado à parte: duplas confirmadas param de parear (não é bug de calendário)

Documentado em §2.3 acima — 3 das 6 duplas reais "protegidas"
(`ai_partnership_protected: true`) caem a 0% de pareamento por volta da T4, de
forma IDÊNTICA nos dois cenários de calendário testados. Como a proteção deveria
impedir dissolução exceto por "evento narrativo explícito" (comentário de
`scripts/audit-real-athletes-simulation.mjs`), isso é ou (a) um bug — a flag não
está sendo respeitada em algum ponto do ciclo de vida de parcerias
(`aiPartnershipLifecycle.js`, não investigado nesta fase), ou (b) um evento
narrativo de fato disparando (aposentadoria, lesão) de forma que zera o
pareamento sem que isso seja necessariamente incorreto. **Não investigado a fundo
nem corrigido aqui** — fora do escopo de uma fase de medição contra metas; registrado
para decisão de prioridade numa fase futura, com os dados específicos (quais
duplas, em qual temporada, idêntico nos dois calendários) já levantados pra quem
for investigar.

## 6 — Validação

- `npm run lint` — limpo.
- `npm run build` — sucesso.
- `node scripts/rc-qa-suite-v36.mjs` — a confirmar antes do commit (mesma
  expectativa das fases anteriores: mudança aditiva, só relatório).
- Único arquivo de código tocado: `scripts/audit-real-athletes-simulation.mjs`
  (instrumentação de relatório — `min`/`belowTargetCount`/`belowTargetSample` em
  `tournamentsPlayedThisSeason.real` — sem efeito em gameplay, só no que o harness
  imprime). Nenhum arquivo de `src/` alterado.
- `src-tauri/` — sem alterações.
- Scratch descartado: `resume-state.json` e `run.log` das 2 rodadas; `summary.json`/
  `tournament-results.csv`/`season-tier-table.md` mantidos em
  `reports/real-athletes-audit/f8-{regime-check,topo120}/`.

## Entrega

| Meta | Status |
|---|---|
| Major/P1 ≥70% (T1-3) | ✅ Atingida (100%, excede) |
| P2 40-60% | ❌ Não atingida (97,7-100%) |
| Gold/Platinum <15% | ❌ Não atingida (50,8-84,3%) |
| Bronze/Silver ~0% | ⚠️ Parcial (10,5-20,0%) |
| ≥12 eventos/temporada individualmente, T1 | ❌ Não atingida (63% abaixo no atual; 11% em topo-120) |
| Duplas confirmadas pareadas ≥90% | ⚠️ Parcial (100% até T3, colapsa em 3/6 por T4-T5 — achado à parte, §5) |
| Jogador #1000: ≥15 eventos, ≤21 dias | ✅ Atingida (40 eventos, 14 dias) |
| Zero chaves incompletas | ❌ Não atingida (1-14 por temporada, conforme cenário) |
| **Item 3 — acesso do jogador** | **Decisão**: lacuna confirmada — qualifying/janela nunca chegou ao caminho do jogador; recomendada como fase futura |
| **Item 4 — calendário** | **Decisão**: adotar topo-120 formalmente (código pendente, não implementado nesta fase de medição) |
