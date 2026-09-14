# Fase 8.7 — Fecha as pontas restantes da Fase 8

> **COMPLETA.** Topo-120 implementado em produção (código, não mais flag
> de diagnóstico) e confirmado por regime-check de 5 temporadas. P2/
> Masters confirmado por analogia como a MESMA causa estrutural de Gold/
> Platinum (não precisou repetir as 4 rodadas de medição) — meta
> corrigida na mesma disciplina. Pareamento de duplas: **meta atingida**
> nas 6 duplas confirmadas, quando medida corretamente (descontando
> aposentadoria) — a "falha" aparente era artefato da métrica cumulativa,
> não um problema de jogo. Chaves incompletas: diagnosticado (2,6% com
> topo-120, concentrado em casos estruturalmente difíceis de zerar), meta
> revisada, **nada implementado** (mesma disciplina da Fase 8.6). Com
> isso, as 8 metas originais da Fase 0 têm status final definido.

## 1 — Topo-120 adotado formalmente em produção

### 1.1 — Implementação

`src/lib/circuitCatalog.js`: `TIER_EVENTS_PER_YEAR` passa a usar os
valores de topo-120 diretamente (`Gold: 35, Platinum: 27, Masters: 44`,
substituindo `8/6/10`) como configuração PERMANENTE — mesmo padrão de
promoção já usado pra janela de prioridade na Fase 7.4 (valor fixo, sem
variável de ambiente). O mecanismo `DIAG_TOP_EVENTS_OVERRIDE` (que também
guardava o cenário "topo-76", já descartado por instabilidade de forma na
Fase 7.4) foi removido — não sobra nenhum cenário de diagnóstico
pendente que precise dele.

### 1.2 — Regime-check de confirmação: conclusão qualitativa idêntica, números exatos divergem (achado novo, não bloqueante)

Regime-check de 5 temporadas rodado com o código de produção (mesma seed
`official-900-100-s1`, mesma população 900+100), comparado contra a
medição diagnóstica original da Fase 8 (`f8-topo120/`, `DIAG_TOP_EVENTS=120`):

| | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| Original (diagnóstico, Fase 8) — abaixo de 12 | 11/100 | 31/100 | 20/95 | 35/91 | 36/86 |
| Este regime-check (produção) — abaixo de 12 | 14/100 | 47/100 | 47/100 | 48/100 | 47/100 |
| Top 20 (original) | não medido nesta granularidade | | | | |
| Top 20 (este regime-check) | 20/20 | 20/20 | 17/20 | 14/20 | 12/20 |
| Chaves incompletas (este regime-check) | 10/160 | 3/161 | 4/162 | 0/160 | 4/161 |

**A conclusão qualitativa não muda**: topo-120 continua sendo uma melhora
GRANDE sobre o calendário atual (que tinha 63% abaixo do piso já na T1)
em qualquer uma das duas medições. Mas os números EXATOS de T2-T5 não
batem tão de perto quanto o esperado de uma simulação determinística com
seed idêntica (11→14 na T1 é razoavelmente próximo; 31→47, 20→47, 35→48,
36→47 divergem mais). Investigado antes de reportar como fechado:

- **Nenhuma mudança de comportamento de IA entre as duas medições** —
  `git diff` de todo o histórico entre o commit da Fase 8 e o commit da
  Fase 8.6 mostra só 6 arquivos alterados, e TODOS são exclusivos do
  caminho do JOGADOR (`TournamentModal.jsx`, `EntryManager.js` só na
  parte de `evaluateTournamentEntry`/`buildAthleteEntryContext`,
  `tournamentRegistration.js`, testes) — confirmado por leitura de cada
  diff que nenhum consumidor do lado da IA (`WorldTourLifecycle.js`) lê
  `config.qualifyingSize` (o campo que a Fase 8.1 adicionou a Gold/
  Platinum/Masters/Elite): a IA calcula seu próprio pool de qualifying
  de forma independente (`ENTRY_RESERVED_SHARE`/`QUALIFYING_SHARE`), sem
  ler esse campo do catálogo.
- **`TIER_EVENTS_PER_YEAR` é byte-idêntico** nas duas configurações
  (mesmas chaves, mesma ordem de inserção, mesmos valores) — confirmado
  por comparação direta do objeto construído.
- **Achado novo, não corrigido aqui**: `src/gameplay/repositories/CareerEntityRepository.js:13`
  gera IDs de entidade com `Date.now()` (relógio real, não interceptado
  pelo determinismo do harness) e `Math.random()` pra um sufixo —
  confirmado comparando os IDs crus nos dois `tournament-results.csv`
  (`athleteprofile-1767227302915-...` vs `athleteprofile-1767227272915-...`,
  timestamps de execução real diferentes). Se qualquer ordenação/
  desempate na simulação depender do valor textual do `id` (não só de
  `pairScore`), isso introduziria variação de resultado entre execuções
  separadas do harness mesmo com a MESMA seed lógica — explicaria a
  divergência sem que nenhum código de gameplay tenha mudado. **Não
  investigado a fundo nem corrigido nesta fase** — fora do escopo dos 4
  itens pedidos; registrado para decisão de prioridade futura, com a
  evidência já levantada (comparação de CSVs, achado do arquivo/linha
  exatos) pra quem for investigar. Não bloqueia a decisão desta fase
  porque o veredito (adotar topo-120) já estava tomado e não muda com
  nenhuma das duas medições.

### 1.3 — Margem até o teto de código (achado #32, ~240/temporada)

Total por temporada com topo-120: `24(Bronze)+16(Silver)+35(Gold)+27(Platinum)+44(Masters)+10(Elite)+4(Crown)+2(finais) = 162`
— confirmado neste regime-check (160-162 torneios/temporada, pequena
variação por ano bissexto/distribuição de semana). Contra o teto de
código de `Tournament.list('-start_date', 300)` com horizonte de 15
meses (achado #32, confirmado ainda presente em
`WorldTourLifecycle.js:351`, valor do query limit inalterado): **162/240
= 67,5% do teto, ~78 torneios/temporada de margem** — idêntico ao já
calculado na Fase 6.7, nenhuma mudança na margem desde então.

## 2 — P2/Masters: causa confirmada idêntica por analogia, meta corrigida

### 2.1 — Verificação rápida (reaproveitando dados já coletados, sem nova rodada de 4 medições)

Usando a instrumentação `[DIAG_FIELD_OVR]` já coletada nas Fases 8.3-8.5
(mesma seed, mesma população, campo efetivo por tier):

| Config. | Masters reais (méd. T1) | Masters bots (méd. T1) | Gold reais (méd. T1) | Gold bots (méd. T1) |
|---|---|---|---|---|
| Baseline limpo (produção) | 85,4 | 72,3 | 84,5 | 60,0 |

Bots de Masters seguem a MESMA curva de geração (teto de OVR na origem
dependente só de `absoluteRank`, sem reserva por tier) e a mesma margem
de crescimento estreita que os de Gold/Platinum — confirmado, não é uma
causa diferente. **Diferença notada, não uma causa diferente**: o corte
de ranking mais alto de Masters (`minRanking: 230`, contra 450 de Gold)
filtra um subconjunto de bots individualmente mais forte (OVR médio de
campo 72-75, contra 60-65 em Gold) — mas a dominância real observada em
Masters (94-100% nas 4 configurações já medidas) é, na prática, MAIS
extrema que em Gold/Platinum, não menos, porque mais reais circulam por
Masters ao longo da carreira e o corte mais alto reduz ainda mais o
número de bots elegíveis a competir ali.

### 2.2 — Meta corrigida

`docs/tournament-targets.md` atualizado: meta de P2/Masters ("40-60%
real") substituída por referência de teto observado (até ~6% de títulos
de bot, Fase 8.3 — melhor resultado nas 4 configurações já medidas),
mesma disciplina e mesma decisão de não perseguir correção adicional já
aplicada a Gold/Platinum na Fase 8.6.

## 3 — Pareamento de duplas: meta ATINGIDA, descontada aposentadoria

### 3.1 — As 6 duplas confirmadas, medidas corretamente

| Dupla | T1-T5 (cru) | Aposentadoria | pairedRatePct só nas temporadas ativas |
|---|---|---|---|
| Arturo Coello & Agustín Tapia | 100,100,100,100,100 | nenhuma | **100%** |
| Alejandro Galán & Federico Chingotto | 100,100,100,100,100 | nenhuma | **100%** |
| Juan Lebrón & Leandro Augsburger | 100,100,100,100,100 | nenhuma | **100%** |
| Juanlu Esbrí & Alejandro Ruiz | 100,100,100,0,0 | Juanlu Esbrí, 2029-02 (T4) | **100%** (T1-T3) |
| Marc Quílez & Federico Mouriño | 100,100,91.7,0,0 | Marc Quílez, 2029-01 (fim T3) | **97,2%** (T1-T3) |
| Clément Geens & Dylan Guichard | 100,100,100,91.7,0 | Dylan Guichard, 2030-01 (fim T4) | **97,9%** (T1-T4) |

**As 6/6 duplas confirmadas atingem a meta (≥90%) enquanto ativas.** A
data de aposentadoria de cada uma precede EXATAMENTE a temporada em que o
pareamento cai a zero (já confirmado na Fase 8.1) — não uma coincidência
aproximada.

### 3.2 — A métrica cumulativa penaliza aposentadoria como se fosse falha

`historicalDuplasOverall` (o número usado no relatório da Fase 8 pra
sinalizar "colapso") soma as 5 temporadas SEM descontar aposentadoria —
uma dupla que se aposenta na T4 aparece com 2 temporadas de "0%
pareada" that são, na verdade, "não jogou mais, por desenho" (Fase 2D:
aposentadoria por idade), não uma falha de pareamento. Isso arrasta a
média cumulativa das 3 duplas que se aposentam mais cedo pra 58,3-78,3%
— parecendo uma falha, quando na verdade a dupla nunca deixou de parear
enquanto os dois estavam ativos. Não é um bug de jogo (a parceria não
"deveria" continuar depois que um dos dois se aposenta —
`WorldTourLifecycle.js` já filtra `!athlete.retired`, comportamento
correto) — é uma limitação da MÉTRICA cumulativa do harness, que não
distingue "não pareou porque não competia mais" de "não pareou porque a
parceria quebrou". `docs/tournament-targets.md` atualizado com uma nota
explicando essa distinção, pra que nenhuma sessão futura reabra isso como
um bug de jogo pendente.

### 3.3 — Item fechado

Meta de pareamento de duplas históricas confirmada como **atingida**
para as 6 duplas confirmadas, sem nenhuma correção de código necessária.

## 4 — Chaves incompletas: diagnóstico e meta revisada (nada implementado)

### 4.1 — Taxa atual, com topo-120 em vigor

Regime-check de 5 temporadas (§1.2): **21/804 = 2,6%** de chaves
incompletas — melhor do que a taxa "combinada" citada na Fase 8 pro
cenário isolado de topo-120 na T1 (8,75%), porque a maior parte do
residual é efeito de T1 (10/160 = 6,25%, convergindo pra 0-2,5% nas
temporadas seguintes — mesmo padrão de "partida fria" já documentado
desde a Fase 2).

| Tier | Ocorrências (5 temporadas) | Severidade típica |
|---|---|---|
| Masters | 12 | 96% cheio (23/24) na maioria; 2 casos T1 mais vazios (38%, 63%) |
| Gold | 4 | 96% cheio (23/24) em todos |
| Legacy Finals | 3 | 63-88% cheio (5-7/8) — draw de convite, só 8 vagas |
| Platinum | 1 | 53% cheio (17/32) — caso isolado de T1 |
| Circuit Finals | 1 | 50% cheio (4/8) — draw de convite, só 8 vagas |

### 4.2 — Resolvível sem reabrir o trade-off da Fase 8.2-8.5?

**Não vale a pena tentar** — pelo mesmo motivo que fechou aquela linha.
16 das 21 ocorrências (Gold+Masters) são "incompletas" por só 1 vaga
(23/24 = 96% cheio) — tecnicamente contadas como incompletas pela
comparação estrita `simulated_entrants < main_draw_size`, mas o mecanismo
de chave mínima viável já em produção (`minViableDraw`, Fase 5.3, item 2:
`min(8, ceil(drawSize/2))` = 8 para um draw de 24) roda esses torneios
NORMALMENTE — 23 entrantes está muito acima do piso de 8 pra sequer
cancelar. Preencher essa última vaga exigiria mais bots competitivos
disponíveis naquela semana específica — exatamente o "mais capacidade ou
força de bot" que a Fase 8.2-8.5 já mostrou reabrir vazamento pro topo ou
deslocamento de reais, por um ganho que é, na prática, cosmético (um
torneio 96% cheio não é uma chave quebrada).

### 4.3 — Legacy Finals/Circuit Finals: estruturalmente difícil de zerar

Os 4 casos restantes (Legacy Finals ×3, Circuit Finals ×1) são eventos
de CONVITE com só 8 vagas (top 8/16 do ranking correspondente) — um único
convidado indisponível (lesão, aposentadoria, conflito de calendário) já
cria um "gap" de 12,5% do draw. Forçar preenchimento aqui significaria
convidar alguém FORA do top 8/16 pretendido, contradizendo a própria
premissa narrativa do tier ("só os melhores, por convite direto" —
`circuitCatalog.js`, descrição de `Circuit Finals`/`Legacy Finals`).
Zerar isso teria o mesmo tipo de risco de design já descartado na Fase
8.6 (regra sem defeito correspondente, ou correção que quebra a premissa
do tier).

### 4.4 — Meta revisada proposta (sem implementação)

Mesma disciplina da correção de Gold/Platinum/Masters (Fase 8.6): a meta
original ("zero chaves incompletas") nunca foi atingida em nenhuma
medição desde a Fase 5, e o residual atual (2,6%, concentrado em T1 e em
casos estruturalmente difíceis de zerar) não justifica mais investigação
sob o mesmo trade-off já resolvido. **Proposta**: revisar a meta para
"≤ 3% de chaves incompletas, fora da T1" — reconhecendo o efeito de
partida fria como aceito (já documentado desde a Fase 2) e o residual de
eventos de convite pequenos (Legacy/Circuit Finals) como estruturalmente
inevitável. Não implementado nesta fase — só diagnóstico e proposta,
aguardando decisão, mesma disciplina da Fase 8.3-8.5.

## 5 — Validação

- `npm run lint` — limpo.
- `npm run build` — sucesso.
- `node scripts/rc-qa-suite-v36.mjs` — mesmas 3 falhas pré-existentes
  (`test:rc-gameplay-balance`, `test:career-pace`, `test:ui-quality`), sem
  regressão nova.
- Único arquivo de código de produção alterado: `src/lib/circuitCatalog.js`
  (`TIER_EVENTS_PER_YEAR` — topo-120 permanente, `DIAG_TOP_EVENTS_OVERRIDE`
  removido). Nenhuma instrumentação temporária usada nesta fase (o
  regime-check do item 1 rodou com o harness já existente, sem flags
  `DIAG_*` de gameplay).
- `docs/tournament-targets.md` — meta de P2/Masters corrigida (item 2);
  nota sobre pareamento de duplas e aposentadoria adicionada (item 3).
- Scratch descartado: `resume-state.json`, `run.log` (ignorado pelo git);
  mantidos `summary.json`/`tournament-results.csv`/`season-tier-table.md`
  em `reports/real-athletes-audit/f87-topo120-regime/` como evidência.
- `reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/*.json` revertidos via `git checkout --`.
- `src-tauri/` — sem alterações.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Topo-120 implementado em produção, regime-check confirmando | ✅ implementado (`circuitCatalog.js`); regime-check confirma a mesma conclusão qualitativa (melhora grande); achado novo e não-bloqueante registrado (não-determinismo de IDs de entidade entre execuções separadas do harness, `CareerEntityRepository.js:13`) |
| 2 | P2/Masters — causa confirmada, meta ajustada | ✅ causa idêntica confirmada por analogia (dados já coletados, sem nova rodada); meta revisada em `docs/tournament-targets.md` |
| 3 | Pareamento de duplas — confirmado ou causa residual reportada | ✅ **atingida** — 6/6 duplas confirmadas ≥90% enquanto ativas; "falha" aparente era artefato da métrica cumulativa não descontar aposentadoria, documentado |
| 4 | Chaves incompletas — diagnóstico e meta revisada | ✅ diagnosticado (2,6% com topo-120, concentrado em T1 e em eventos de convite pequenos); meta revisada proposta (≤3%, fora da T1); **nada implementado**, conforme pedido |

Com isso, a Fase 8 fecha por completo — as 8 metas originais da Fase 0
têm status final: Major/P1 (✅ atingida), acesso do jogador #1000 (✅
atingida), pareamento de duplas (✅ atingida), participação individual
≥12/temporada (❌ não atingida, mas topo-120 é a melhor mitigação
disponível — adotada), P2/Masters e Gold/Platinum (metas corrigidas por
evidência estrutural, Fase 8.6-8.7), Bronze/Silver (⚠️ parcial, não
afetado por esta linha de investigação), chaves incompletas (meta
revisada proposta, aguardando decisão).
