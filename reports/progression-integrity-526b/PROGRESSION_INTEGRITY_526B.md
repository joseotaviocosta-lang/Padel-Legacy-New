# Integridade de progressão antes do rebalanceamento — Playthrough 5.26-B

**FIX INTEGRITY · DO NOT TUNE BALANCE.** Esta fase corrigiu apenas as falhas
que invalidavam a auditoria 5.26. Nenhum valor de balanceamento foi alterado
(prêmios, patrocínios, thresholds, preços, salários, treino, dificuldade,
tiers, força de adversários, investimentos, fãs, ganhos de reputação,
fórmulas de pontos). A 5.26 (`reports/progression-economy-526/`) segue intacta
como baseline.

## Resumo

| Bug | Antes (5.26) | Depois (5.26-B) |
|---|---|---|
| P0 OVR do parceiro no motor | 1 em 100% das partidas | = OVR canônico em 100% |
| P0 congelamento anual | 100% das carreiras (dias 366–452) | 0 congelamentos, sem contorno |
| P1 moedas de conquista apagadas | ~14,4k/carreira em 2 anos | 0 |
| P1 reputação | 0 para sempre | evolui e persiste |
| P1 `ranking_position` do jogador | nunca gravado | gravado pela autoridade canônica |
| P1 idade para patrocínio | relógio do PC (16 para sempre) | data da carreira (16 → 18 em 2 anos) |
| P1 loja acima de incomum | travada | desbloqueia pelas regras atuais |

*Tabela comparativa completa na seção 9.*

## 1. P0 — parceiro com OVR 1 no motor

**Reproduzido** (`scripts/repro-partner-ovr-v526b.mjs`, `repro-partner-ovr-before.json`):
parceiro com card 35 → motor **1**; elite 88 → **1**; fraco 9 → **1**; template
parcial 31 → **19**.

**Causa raiz.** Duas fórmulas de OVR:
- a UI (`src/lib/padel.js:overallRating`) já usava, desde a 5.22, a média dos
  atributos **presentes** e, sem atributos planos, o `overall_rating`/`overall`
  declarado;
- o motor (`src/engine/match/playerModel.js:overallRating`) tinha uma cópia
  antiga: média das **10** chaves planas (ausente = 0) com **piso 1**.

O parceiro materializado (`partnerAthlete.js:materializePartnerAthlete`) e
todo atleta do mundo guardam só `overall`/`overall_rating` (atributos de
origem ficam em `source_attributes`). Soma 0 → arredonda 0 → piso → **1**. O
bot não "perdia campos" ao virar participante: o motor é que lia a fonte errada.

**Correção (input apenas).** A regra da UI foi movida, sem alteração, para
`src/lib/attributes.js:baseOverallRating` (módulo-folha, sem imports) e passou
a ser a única autoridade: `padel.js:overallRating` e `playerModel.js` a usam.
Os modificadores do motor (química, energia, treinador, vínculo), o clamp e
todas as fórmulas de rally/probabilidade/momentum ficaram intocados.

**Depois** (`repro-partner-ovr-after.json`): 35 → 35, 88 → 88, 9 → 9, 31 → 31.
O roster comprometido (`committedRoster.js`) continua decidindo **quem** joga;
o ex-parceiro comprometido entra com a identidade da inscrição e OVR válido.

## 2. P0 — congelamento anual (dias 366–452)

**Reproduzido sem contorno** (`freeze-before/`): seed 1 travou em 2027-01-02
(dia 366, `real_santiago_jose_pineda_cabello`), seed 2 em 2027-01-02 (dia 366,
`real_ignacio_vilarino_gestoso`), seed 3 em 2027-02-24 (dia 419,
`real_ignacio_sager`): `AthleteProfile já existe com o id: …`, 6 tentativas
seguidas sem avanço.

**Cadeia.** `processWorldTourDay` (`WorldTourLifecycle.js:1683`) roda
`verifySaveFoundation()` todo dia → `!ok` → `ensureWorldSeed2025()` →
`upsertBy('AthleteProfile', …, 'bot_id', …)` → não acha → `create` com o id
canônico do registro → o repositório recusa id existente
(`CareerEntityRepository.js:240`) → a transação do dia falha → o calendário
nunca mais avança.

**Por que o atleta existente não era reconhecido.** `verify` e `ensure` liam
**só os 500 primeiros `AthleteProfile` por pontos**. Num mundo vivo, atletas
reais do registro caem para fora desse recorte (perdem pontos/aposentam) — e o
par confirmado se desfaz no mercado da IA. As duas evoluções legítimas viravam
"semeadura incompleta". Não era tipo de id, alias, nem schema: era a janela de
consulta.

**Correção (identidade/lookup, sem bypass temporal)** em `src/lib/saveFoundation.js`:
- `loadRealAthleteIdentity()`: identidade resolvida na coleção **inteira**, por
  `bot_id` e `id`; `TeamRanking` também na coleção inteira (o mesmo recorte
  podia duplicar `team_key`);
- real **aposentado e podado** (`AthleteCareerLegacy.athlete_id`) é conhecido e
  nunca ressuscitado;
- `wasEverPairSeeded()`: par "semeado" = foi pareado **ao menos uma vez**
  (`ai_partner_id` ou `ai_partnership_status`, que fica `sem_parceiro`/
  `encerrada` quando o par se desfaz). A checagem da 4.5A continua pegando a
  semeadura **interrompida** (os dois membros sem nenhum pareamento) e o reparo
  não re-pareia à força quem o mercado separou.

**Idempotência** (`test-athlete-repair-idempotency-v526b`, 8/8): save saudável →
0 criações, 0 escritas; mundo evoluído → 0/0; falta 1 atleta real → cria
exatamente 1; segundo reparo → 0/0; aposentado podado → 0; semeadura
interrompida → detectada e reparada; após save/reload → 0/0.

**Custo:** a verificação diária agora lê a coleção inteira (~1,2 mil atletas +
legado) em vez de 500 — leitura em memória.

## 3. P1 — moedas de conquista apagadas na última partida

**Reproduzido** (`test-achievement-final-match-reward-v526b`, caso "reprodução
do bug"): com o commit antigo, fechamento = abertura + prêmio (conquista
sumiu).

**Quem sobrescrevia.** `prepareTournamentFinalization`
(`tournamentLifecycle.js`) calcula `playerPatch.coins/xp/level` **absolutos**
sobre o perfil de antes das conquistas. A 5.24-E deixou a conquista atômica e
ela grava `saldo fresco + recompensa`; depois, `incrementMissionProgress`
(`padel.js`) aplicava `{ ...perfilFresco, ...playerPatch }` — o `coins`
absoluto e velho do patch vencia e apagava a conquista.

**Correção.** A finalização devolve também `playerIncrements` (moedas/XP do
torneio). `padel.js:rebasePlayerPatchIncrements` aplica o ganho sobre o perfil
**lido na hora da escrita** (rederivando `level`), nos dois caminhos de commit
(`incrementMissionProgress` em lote/fallback e `finalizeTournamentRun`).
`TournamentModal.jsx` passa `playerIncrements`. Nada é recreditado.

**Testes:** derrota final, título, múltiplas conquistas, conquista no meio do
torneio, abandono, reload e restart — 8/8, invariante "fechamento = abertura +
conquistas + prêmio" exato.

## 4. P1 — reputação nunca aumentava

Campo canônico: `PlayerProfile.reputation`. Única fonte no código: os efeitos
`reputation` das respostas de entrevista (`pressData.js:QUESTION_BANKS`),
aplicados por `applyReputationEffects` no fluxo de `Press.jsx`. A função
aplicava fãs, apelo comercial e moral, mas **descartava** `reputation`.

**Correção:** aplica exatamente o valor declarado, clamp 0–100 (mesmo dos
demais campos), base 0. Nenhum ganho novo. Consumidores (loja, estágio de
patrocínio) já liam esse campo. Teste 10/10 com o fluxo real de imprensa e
reload.

**Observação para o rebalanceamento:** com os valores declarados (+3 a +6 por
resposta), a reputação chega a 100 em ~1 ano (mediana 100 aos 2 anos no smoke).

## 5. P1 — posição no ranking não persistia

Pontos já persistiam; a posição é derivada (`buildWorldRankingSnapshot`, a da
tela de Ranking). Mas ≥ 11 sistemas leem `profile.ranking_position` de forma
síncrona (loja, estágio de patrocínio, missões, treinadores, mercado de
duplas, imprensa, relatórios) e nada gravava esse campo para o jogador.

**Correção:** `processWorldCircuit` (`circuitLifecycle.js`) grava
`ranking_position` com a posição da **mesma** autoridade canônica, na escrita
semanal que já existia (`null` quando o jogador não tem ranking). Sem fórmula
paralela. Consequência conhecida: o campo tem a cadência semanal do circuito
(no teste longo, #362 gravado × #361 ao vivo no mesmo dia).

## 6. P1 — idade pelo relógio do computador

`sponsors.js:calculateAge` usava `new Date()`. Agora usa
`padel.js:ageAtDate(birth_date, career_date)` — a autoridade já usada pelo
resto do jogo, com o limite do aniversário. Teste com o relógio do sistema
forçado em 2040: 16 (2026-01-01) → 17 (2027-01-01) → 17 (2027-12-31) → 18
(2028-01-01); aniversário em 20/07 respeitado no dia exato. Faixas etárias do
catálogo inalteradas.

## 7. Patrocínio e loja voltam a seguir as regras atuais

- **Patrocínio:** com idade, posição e reputação corretas, Prata fica assinável
  aos 17/18 e Ouro quando estágio/XP/fãs/títulos batem. No smoke, Prata foi
  assinado (antes: 100% Bronze).
- **Loja:** raro+ desbloqueia por nível, Top N e reputação. No smoke: maior
  raridade liberada em 2 anos = lendário/mítico/exclusivo.
- **Não corrigido (fora do escopo):** 9 dos 21 patrocinadores não têm
  `is_available` e continuam recusando ("não aceita novos contratos").

## 8. Rank jump em 01/01/2027 (instrumentado, não corrigido)

`scripts/instrument-rank-jump-v526b.mjs` (`rank-jump-2027.json`), pontos do
jogador congelados em 117:

| Dia | Rank do jogador | Atletas com pontos | ≥ 117 pts | Pontos no #300 | Pontos totais do mundo | Linhas-semente |
|---|---|---|---|---|---|---|
| 2026-12-31 | #633 | 960 | 665 | 721 | 853.106 | 1.067 |
| 2027-01-02 | #630 | 954 | 665 | 736 | 857.580 | 1.073 |
| 2027-01-03 | **#330** | 749 | 348 | 154 | **308.724** | **189** |

Causa: na primeira semana de circuito de 2027 a janela móvel de 52 semanas
descarta **884 das 1.073 linhas-semente** (`legacy-seed`, os pontos iniciais do
mundo datados de jan/2026): −64% dos pontos do mundo de uma vez. Não é
consequência dos P0/P1 corrigidos → fica para a 5.26-C.

## 9. Auditoria reduzida pós-correção (smoke)

5 seeds × 3 perfis × 2 temporadas (730 dias), **contorno desligado**, lifecycles
reais (simulateWorldDay, mercado da IA, world tour, missões, conquistas,
persistência), reload a cada 180 dias na seed 5.

**Execuções e interrupções (transparência).** Os processos do harness foram
encerrados por fora três vezes (todos os `node.exe` ao mesmo tempo, sem erro,
coincidindo com outro agente na máquina subindo servidores). Por decisão do
usuário a fase fecha com o que foi medido:

| Execução | Carreiras | Resultado |
|---|---|---|
| 1 (harness com a divisão de custos antiga) | **15/15** | 11/12 checagens; única falha: resíduo de 7–4.410 moedas no livro-razão do **harness** (categorização; ver abaixo) |
| 2 (idem) | 14/15 (encerrada) | fonte da tabela abaixo (`comparison.json`) |
| 3 (harness final) | 3/15 (encerrada) | livro-razão exato: 25/25 meses fecham, resíduo 0 |

Os dados brutos das execuções 1 e 2 foram descartados ao relançar; as
métricas de integridade não dependem da categorização de custos.

**Correções do harness durante a fase** (não afetam moedas do jogo, só o
rótulo de cada moeda): (a) prêmio de torneio finalizado dentro do avanço do
dia passou a ser contabilizado como prêmio; (b) o fechamento mensal agora
separa treinador e clube pelo breakdown com o multiplicador de custo da
dificuldade, e o staff como resto (líquido da economia do contador). **Na 5.26
o staff entrou bruto e o treinador como resto**: totais certos, divisão
staff/treinador deslocada pela economia do contador (até 25% do staff).

### Comparação 5.26 × 5.26-B (mesmo horizonte de 730 dias, seeds 1–5)

| Métrica | 5.26 bugada | 5.26-B pós-fix |
|---|---|---|
| OVR do parceiro no motor (mediana) | **1** | **59** |
| OVR do parceiro no card (mediana) | 31 | 59 |
| Partidas com motor = card | 0% | **100%** |
| Vitória Fácil (Bronze/Silver) | 29,6% (n=577) | 44,1% (n=641) |
| Vitória Médio (Gold/Platinum) | 40,8% (n=635) | 72,3% (n=1.034) |
| Vitória Difícil (Masters/Elite/Crown) | 24,1% (n=87) | 55,0% (n=240) |
| Carreiras que travariam no horizonte | **100%** | **0%** |
| Moedas de conquista apagadas (mediana/carreira, 2 anos) | 14.400 | **0** |
| Reputação aos 2 anos (mediana) | 0 | 100 |
| Idade aos 2 anos | 16 (relógio do PC) | **18** |
| `ranking_position` gravado | 0% | **100%** |
| Tiers de patrocínio assinados | Bronze | Bronze/Prata |
| Loja: maior raridade liberada (por carreira) | incomum: 15 | lendário 4, épico 3, mítico 4, exclusivo 3 |
| Rank mediano em 1 ano | 702 | 663 |
| Rank mediano em 2 anos | 96 | **20** |
| Títulos (total em 2 anos) | 1 | 14 |
| Finais vencidas | 10% | 28% |

A 5.26-B usa 14 carreiras (execução 2); a 5.26, as 15 com seeds 1–5.

**Leitura (sem tunar).** Corrigir o OVR do parceiro e o OVR dos adversários
(templates parciais) mudou o quadro competitivo por completo: a mesma escada
agora é *fácil* no meio (Médio 72%) e o jogador mediano chega ao Top 20 em 2
anos. Isso é exatamente o que precisa ser **remedido** na 5.26 completa antes
de decidir qualquer ajuste — a amostra curta não sustenta conclusão de
balanceamento.

## 10. Carreiras longas sem contorno

- **Feito:** carreira real até o **dia 400** (2027-02-05) sem contorno, duas
  vezes (validação `freeze-after/` e `test-career-year2-no-freeze-v526b`): 0
  falhas de avanço, 0 recriações de atleta, 0 disparos do shim. As 15 carreiras
  da execução 1 do smoke chegaram ao dia **730** sem nenhum congelamento.
- **Não executado:** 3 seeds × 3 anos e 1 seed × 10 anos (encerrados por fora;
  o usuário optou por fechar a fase). **Critério 10 da nota A não cumprido.**
  Tamanho do save por ano (Bloco K) fica para a reexecução da 5.26.

## 11. Testes

| Teste | Resultado |
|---|---|
| `test-partner-engine-ovr-authority-v526b` | 9/9 |
| `test-partner-committed-roster-ovr-v526b` | 5/5 |
| `test-athlete-repair-idempotency-v526b` | 8/8 |
| `test-career-year2-no-freeze-v526b` | 6/6 |
| `test-achievement-final-match-reward-v526b` | 8/8 |
| `test-reputation-progress-persists-v526b` | 10/10 |
| `test-ranking-gating-current-position-v526b` | 6/6 |
| `test-player-age-career-clock-v526b` | 8/8 |
| `test-sponsor-tier-age-progression-v526b` | 5/5 |
| `test-shop-tier-unlock-v526b` | 5/5 |
| `test-integrity-smoke-simulation-v526b` | 11/12 na execução 1 (15 carreiras; falha só no resíduo do harness, corrigido e validado em 3 carreiras); não reexecutado completo |
| `test-progression-audit-no-workaround-v526b` | 4/4 |
| `test-progression-economy-v526` (harness 5.26) | 6/6 |

**Regressões** (`regressions.json`, 56 testes): **55/56**. Única falha,
`test-athlete-profile-ovr-repair-v56`, é **pré-existente**: o teste e o
validador mais estrito são trabalho não commitado de fase anterior
(`athleteProfileOverallRepair` nem existe no HEAD) e não tocam nada desta fase.
Cobertura: match/roster/força/resultados, mundo/materialização/mercado/reparo,
5.24-D, 5.24-E, armazenamento, conquistas (atomicidade, multi-unlock),
ranking (5.22-E/G, 5.23, TeamRanking, Race), patrocínio/loja, mobile.

## 12. Classificação dos achados

### RESOLVIDO
- P0 OVR do parceiro (e oponentes parciais) no motor.
- P0 congelamento anual (identidade do reparo; reparo idempotente).
- P1 moedas de conquista apagadas no settlement.
- P1 reputação nunca aumentava.
- P1 `ranking_position` do jogador nunca gravado.
- P1 idade de patrocínio pelo relógio do computador.
- P1 loja travada em incomum (consequência dos dois acima).

### AINDA DISTORCE A AUDITORIA (corrigir antes do rebalanceamento)
- **Rank jump de 01/01/2027**: −64% dos pontos do mundo de uma vez (seção 8);
  distorce marcos de ranking do 1º para o 2º ano.
- **9/21 patrocinadores sem `is_available`**: escada de patrocínio incompleta.
- **Rank da dupla adversária nunca resolvido** (`getCanonicalTeamWorldRank` →
  "sem ranking" em 100% das partidas): detecção de zebra e conquistas de "vencer
  Top N" provavelmente nunca disparam.
- **Laço de re-contratação diária do parceiro após renovação** (13% das
  carreiras normais/otimizadoras na 5.26): distorce métricas de parceria.
- **Reexecutar a 5.26 completa** (30 seeds × 3 perfis, longas) sem contorno —
  pendente.

### PODE AGUARDAR O REBALANCEAMENTO (tuning)
- Patrocínio inicial cedo e alto; CDB/investimentos com retorno mensal.
- Fãs de entrevista (`|| 50` e +7/+8 por entrevista) e reputação +3/+6 por
  resposta (100 em ~1 ano).
- Rótulos de dificuldade fixos por tier; nova curva pós-fix (Médio 72%).
- Severance trap, divisão de prêmio cosmética, preços/ROI da loja, staff barato.
- Save de 63–70 MB (otimização de storage).
- Livro-razão do próprio jogo (`FinancialTransaction`) incompleto.

## 13. Escopo do diff e verificação

Alterações de código do jogo nesta fase (diff isolado em
`phase-526b-src.diff`, só desta fase — o working tree tem trabalho anterior
preservado):

| Arquivo | Mudança |
|---|---|
| `src/lib/attributes.js` | +26 (autoridade única `baseOverallRating`) |
| `src/lib/padel.js` | +35/−27 (`overallRating` usa a autoridade; `rebasePlayerPatchIncrements`; incrementos no commit) |
| `src/engine/match/playerModel.js` | +13/−3 (OVR-base pela autoridade; fórmula do motor intocada) |
| `src/lib/saveFoundation.js` | +69/−15 (identidade na coleção inteira, legado, `wasEverPairSeeded`) |
| `src/game-core/tournamentLifecycle.js` | +13/−3 (`playerIncrements`; abandono rebaseado) |
| `src/components/tournaments/TournamentModal.jsx` | +3 (passa `playerIncrements`) |
| `src/lib/pressData.js` | +7 (aplica `effects.reputation`) |
| `src/game-core/circuitLifecycle.js` | +12 (grava `ranking_position` canônico) |
| `src/lib/sponsors.js` | +8/−6 (idade pela data da carreira) |

**Nenhum valor de balanceamento alterado** (prêmios, patrocínios, thresholds,
preços, salários, treino, dificuldade, tiers, investimentos, ganhos de fãs e
reputação, fórmulas de pontos). Valores que mudaram **só porque o bug foi
corrigido**: força efetiva do parceiro e dos adversários parciais, saldo com
conquistas preservadas, reputação acumulada, acesso a Prata/loja.

| Verificação | Resultado |
|---|---|
| `npm run lint` | verde |
| `npm run build` | verde (aviso antigo de chunk > 500 kB) |
| `git diff --check` | verde |
| Commit / push | nenhum |
| Relatório 5.26 | intocado |

**Veredito: B** — os dois P0 e os cinco P1 foram eliminados e provados por
teste, mas as carreiras longas sem contorno (critério 10) não foram executadas
e o smoke final com o harness corrigido não completou as 15 carreiras.
