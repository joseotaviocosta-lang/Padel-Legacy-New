# CLOUD-6K — Production Balance Presets & Historical Calibration Audit

Fase exclusivamente de diagnóstico. Nenhum código de produção, teste, hash, schema, versão ou preset foi alterado.
Base: `cloud/phase-6j-field-recomposition-validation` @ `ec9357a` (worktree limpo) → branch `cloud/phase-6k-production-preset-audit`.
Rótulos: **[CÓDIGO]** lido no código · **[EXECUTADO]** rodado nesta fase · **[RELATÓRIO]** vindo de relatório histórico · **[INFERÊNCIA]**.

## 0. Resumo executivo

1. **O app roda `balanced` (5.27-B), sempre.** `getBalance527()` lê `globalThis.__PL527_PRESET`, com fallback `'balanced'`; nada em `src/` define esse valor (só scripts/harness). Não há flag de ambiente, persistência em save nem diferença web/Android. [CÓDIGO]
2. **A diferença `balanced` → `balanced-e` é exatamente o objeto `competition` (5 parâmetros) mais `id/label/version`.** Os 8 parâmetros de economia/atributos são idênticos. [CÓDIGO]
3. **O conjunto `-E` não é só "Silver" nem só "5.27-E".** Ele traz quatro calibrações de fases distintas (5.27-E, F, I), e **a 5.27-F (pontos da derrota na 1ª rodada Gold+) também está inativa** — a 6J não listava esse item. Ela afeta ranking, não só o Silver.
4. **`test-no-gold-change-v527i` (2/3):** a falha vem do bloco `commitment` (hash de `src/game-core/partnerLifecycle.js`), alterado de propósito pela 5.27-J. Ranking, tactics, balance, partnerPolicy e engine estão **iguais**. É teste desatualizado, não regressão. Detalhes na §4.
5. **Recomendação:** manter `balanced` (A) até haver decisão humana; se a decisão for adotar a calibração, a rota preferida é **C com flags independentes e default = atual**, medida por item. Não ativar `balanced-e` inteiro por troca de default (B) sem avaliar a 5.27-F e a banda Silver da IA.

## 1. Mapa do preset efetivamente utilizado

### 1.1 Seleção
| Ponto | Arquivo / função | Comportamento |
|---|---|---|
| Seleção | `src/lib/balance527.js` `getBalance527()` | `globalThis.__PL527_PRESET \|\| 'balanced'`; id desconhecido → `balanced` |
| Override de harness | idem, `__PL527E_COMPETITION_OVERRIDE` | mescla em `competition`; "nunca setado pelo app" |
| Quem seta o preset | só `scripts/*` (harness e testes) | `grep` em `src/`, `index.html`, `vite.config.js`: zero escritas |
| Flags de ambiente | nenhuma para preset | `vite.config.js` só define `__APP_VERSION__`. Variáveis `PL527*` são de scripts (`FORBIDDEN_ENV` em `v527hFreeze.mjs`) |
| Plataformas | não há `android/`, `capacitor.config.*` ou `electron*` no repositório | O APK é build do mesmo bundle (`reports/release-527l/RELEASE_MANIFEST.json`); sem divergência de preset por plataforma no código. A validação em dispositivo não faz parte desta fase [INFERÊNCIA] |
| Persistência | nenhuma referência a preset em `src/` além de `balance527.js` | O preset **não é gravado no save** |

### 1.2 Consumidores por fluxo (todos usam o preset implícito `balanced`)
| Fluxo | Parâmetro lido | Arquivo : função |
|---|---|---|
| Nova carreira | `startingCoins` | `src/lib/padel.js:406` |
| Nova carreira | `initialAttributeMultiplier` | `src/lib/initialCareerProfiles.js:61` `scaleScoreCurve` |
| Nova carreira / 1ª dupla | `competition.firstPartnerTargetOvr`, `firstPartnerRatingWeight` | `src/lib/firstPartnershipScoring.js:86-88` (fallback: OVR do jogador, peso 0,2) |
| Mundo / calendário / prêmios | `prizeMultiplier` | `src/lib/circuitCatalog.js:104` `buildTier` |
| Mundo / pontos de ranking | `competition.gatedFirstRoundLossPointsRatio` | `circuitCatalog.js:92` `buildRankPointsTable` |
| Elegibilidade/preferência Silver (jogador e IA) | `competition.silverPeakLow` | `circuitCatalog.js:841` `openTierSilverBand` |
| Campo de torneio do jogador | `competition.silverFieldOffsetPct` (fallback 0,25) | `src/gameplay/worldTour/WorldTourLifecycle.js:1188` `buildPlayerTournamentField` |
| Economia mensal | `investmentRateMultiplier` | `src/lib/economy.js:92` |
| Patrocínios | `sponsor.*` | `src/lib/sponsors.js:537, 567` |
| Staff | `staffMultiplier` | `src/lib/staffCatalog.js:162` |
| Loja | `shopPriceMultiplier` | `src/lib/storeCatalog.js:88` (`shopBonusMultiplier` **não é lido em `src/`**) |
| Simulação de partidas | nenhum parâmetro de preset | `src/engine/match/*` só lê hooks `__PL527F/G_*` de harness |
| Inscrição / avanço de temporada / load de save | nenhum parâmetro direto | usam as funções acima indiretamente |

### 1.3 Momento da leitura (relevante para qualquer troca)
- `TOURNAMENT_TIER_CONFIG` é `Object.freeze(...)` avaliado **no import** (`circuitCatalog.js:153`): prêmios e `roundPoints` de cada tier ficam fixados quando o módulo carrega. Em runtime, `getRoundOutcomeTable` (`:485-491`) reconstrói a tabela com o preset corrente para chaves reduzidas.
- Os demais parâmetros (`silverPeakLow`, `silverFieldOffsetPct`, 1ª dupla, economia) são lidos a cada chamada.
- Consequência: o preset precisa estar definido **antes** do import de `circuitCatalog.js`. Um default por código atende isso; um `globalThis` setado depois não.
- Divergência jogo × auditoria: os scripts de auditoria da 5.27 rodam `-E` (e a 6J rodou `balanced` e `balanced-e` lado a lado). O jogo roda `balanced`. As validações "5.27-I aprovada" descrevem um estado que **não é o entregue**.

## 2. Matriz de diferenças entre presets

### 2.1 Presets existentes [CÓDIGO: `balance527.js`]
`conservative`, `balanced`, `hardcore` (5.27-B) e `conservative-e`, `balanced-e`, `hardcore-e` (= base + `competition`). Não há outros presets de produção/teste em `src/`.

### 2.2 `balanced` × `balanced-e` (diff completo)
| Parâmetro | `balanced` (ativo) | `balanced-e` | Área | Consumidor |
|---|---|---|---|---|
| startingCoins, initialAttributeMultiplier, prizeMultiplier, investmentRateMultiplier, sponsor.*, staffMultiplier, shopPriceMultiplier, shopBonusMultiplier | 900 / 1,8 / 3,0 / 0,23 / 0,22·0,21·prova 1 / 1,25 / 1,2 / 1,0 | **idênticos** | Treino/atributos, Economia, Mercado | — |
| `id`/`label`/`version` | balanced / Balanced / 5.27-B | balanced-e / Balanced-E / 5.27-E | Metadados | nenhum consumidor em `src/` |
| `competition.firstPartnerTargetOvr` (5.27-E) | ausente → ref = OVR do jogador | **36** | Mercado e qualidade dos parceiros | `firstPartnershipScoring` |
| `competition.firstPartnerRatingWeight` (5.27-E) | 0,2 | **0,45** | Mercado e qualidade dos parceiros | idem |
| `competition.silverPeakLow` (5.27-E) | ausente → 800 | **900** | Torneios/campos (Silver); ranking (fit) | `openTierSilverBand`: afeta fit de Silver para **todas** as duplas (IA e jogador), `getTierDiagnosticCoreBand`, preferência de admissão |
| `competition.silverFieldOffsetPct` (5.27-I) | ausente → 0,25 | **0,15** | Torneios/composição de campos | `WorldTourLifecycle:1188` (só campo **do jogador**) |
| `competition.gatedFirstRoundLossPointsRatio` (5.27-F) | ausente → tabela cheia | **0,01** | **Ranking** (Gold 5→1, Platinum 9→2, Masters 23→5, Elite 45→10, Crown 90→20) | `buildRankPointsTable`, vale para jogador **e** IA, entra no ranking de duplas |

Nenhuma diferença em: IA de decisão, fadiga/recuperação, treino, progressão de carreira, motor de partida. [CÓDIGO]
Áreas do pedido: (1) treino/atributos — sem diferença; (2) progressão — sem diferença direta; (3) economia — sem diferença nos multiplicadores; efeito indireto via prêmios/posição no ranking; (4) mercado/parceiros — 1ª dupla; (5) ranking — pontos Gold+ e fit Silver; (6) torneios/campos — Silver; (7) IA — indireto (fit/pontos usados pela IA e `titleChance`); (8) fadiga — nenhuma; (9) outros — nenhum.

## 3. Auditoria histórica

Observação: o histórico Git deste repositório tem poucos commits e a série 5.27 entrou **squashada** em `565437f` (release 0.9.0 RC); o diff por fase não é recuperável via `git`. A auditoria usa `reports/rebalance-527*/` e o código. [LIMITAÇÃO]

### 3.1 Fase 5.27-E
- **Objetivo:** diagnóstico 5.27-D — no 1º ano o jogador ficava com o parceiro da oferta inicial (OVR 9–14), preso ~11 meses pela proteção de compromisso, enquanto ele evoluía ~22→50. [CÓDIGO: comentário em `balance527.js`]
- **Mudanças:** `firstPartnerTargetOvr=36`, `firstPartnerRatingWeight=0,45`, `silverPeakLow=900` (micro-calibração: campo Silver 47→45, Bronze WR 41→45%).
- **Presets afetados:** os três `-E`. **Estado:** código presente; **inativo no app**.
- **Efeito não visto antes:** `silverPeakLow` muda o fit de Silver globalmente (IA incluída), não só o campo do jogador.

### 3.2 Fase 5.27-F (calibração adicional dentro do mesmo objeto)
- Pontos de derrota na 1ª rodada Gold+ = 1% do título, para impedir subir no ranking perdendo sempre. Texto do código: "só presets -E, IA e jogador iguais". **Estado: inativo no app.** Efeito possível em produção hoje: ranking acumulável por derrotas em Masters/Elite/Crown (problema que a 5.27-F documentou como medido). Esta fase **não** mediu a prevalência disso no app (§8).

### 3.3 Fase 5.27-I
- **Motivo:** no micro de 5 sementes, campo Silver OVR 46,8 vs dupla ~40,5 (+6/+7), Silver WR 21% < Gold 32% < Bronze 59% [RELATÓRIO `REBALANCE_527I.md`; 6J §5.6].
- **Mudança:** `silverFieldOffsetPct` 0,25 → 0,15 (candidato E de A–E, o menor que corrige a ordem). Em `WorldTourLifecycle`; `?? 0.25` mantém presets antigos.
- **Evidência:** Stage 1 45/45, Silver OVR 45 P(1ª partida) 0,73→0,85 (6J, simulação). **Estado:** inativa no app (offset real 74–77 vs 45–46, medido na 6J).
- Gold+/Bronze/`circuitCatalog` declarados intocados (`test-no-gold-change`).

### 3.4 Outras calibrações restritas a presets não usados
Nenhuma outra no código de `src/` além do objeto `competition`. Os hooks `__PL527F_*`, `__PL527G_*`, `__PL527I_FIELD_OBSERVER` são só harness (padrão neutro). Fases 5.27-H/J/K/L/M mexeram em código de produção direto (ex.: ciclo de compromisso 5.27-J), não em preset.

## 4. Hashes congelados — `test-no-gold-change-v527i`

[EXECUTADO] `node scripts/test-no-gold-change-v527i.mjs` (após `npm ci --ignore-scripts`): **2/3**.
| Verificação | Resultado |
|---|---|
| `circuitCatalog.js` idêntico ao frozen-before | ✓ |
| Blocos `ranking/tactics/balance/partnerPolicy/engine/commitment` | ✗ — falha em `commitment` (o `for` aborta no primeiro) |
| Fit/config Gold+/Bronze entre baseline e preset (Vite real) | ✓ |

[EXECUTADO] comparando `computeFrozenConfig()` atual com `frozen-before.json`:
`balance` OK · `partnerPolicy` OK · `tactics` OK · `engine` OK · `ranking` OK · **`commitment` DIFF** · `population` DIFF (não asserido pelo teste).
- **`commitment`:** hash = `fileHash(src/game-core/partnerLifecycle.js)`. Arquivo mudou em relação à 5.27-I. A 5.27-J documenta a mudança (`exit_decided_at`, `encerra_apos_compromisso`, moral baixa) e **retirou o teste de sua lista de regressões**: "compara o hash do lifecycle de parceria, que esta fase muda de propósito" (`REBALANCE_527J.md` §8). `run-tests-rebalance-527i.mjs` ainda o lista.
- **`population`:** o `frozen-before` é anterior à 5.27-I; ao incluir `silverFieldOffsetPct` em `ENTRY_COMPETITION_527E`, o hash muda de propósito. Com o `frozen-config.json` pós-I o hash de `population` **é igual** ao atual [EXECUTADO].
- **Outras diferenças de fonte desde a 5.27-I (`sourceHashes` do `frozen-config`):** `partnerLifecycle.js`, `sponsors.js`, `teamCompatibility.js`, `sim-progression-economy-v526.mjs`, `v526Tournament.mjs`, `v526Actions.mjs`. Os blocos semânticos `balance` e `partnerPolicy` seguem iguais, então as mudanças em `sponsors.js`/`teamCompatibility.js` não alteram os valores congelados; o conteúdo exato não foi diffado (histórico squashado; `sponsors.js` também tocado em `c5bf7c8` e `fbb0bc4`, fora da série 5.27) [LIMITAÇÃO].
- **Conclusões:** (1) teste desatualizado, causa conhecida e documentada; (2) nenhuma alteração de produção não documentada foi encontrada nos blocos ranking/tactics/balance/partnerPolicy/engine; (3) risco real para esses blocos: **baixo**; (4) o risco é de **cobertura**: o teste falha cedo e esconde as comparações seguintes; um hash de arquivo inteiro de `partnerLifecycle.js` gera falso alarme a cada edição. Reparar exige decisão humana (reescrever baseline ou trocar por hash semântico). Nenhum hash foi atualizado.

## 5. Impacto em saves existentes

| Pergunta | Resposta | Base |
|---|---|---|
| Preset persistido? | Não | nenhuma gravação de preset/versão de balanceamento em `src/` |
| Saves mantêm parâmetros próprios? | Parcialmente: valores **já materializados** persistem (moedas, atributos iniciais, contratos de patrocínio assinados, staff contratado, itens comprados) | `padel.js:406`, `initialCareerProfiles`, `sponsors.js`, `staffCatalog`, `storeCatalog` calculam no momento da criação/contratação |
| Mudar o default afeta carreiras em andamento? | **Sim**, para tudo que é recalculado em runtime: campo Silver (offset), fit Silver, pontos de ranking Gold+ em torneios futuros, vitrine de 1ª dupla (só quem ainda não escolheu). Economia/atributos iniciais: **não** muda (idênticos) | §1.2 |
| Ranking já acumulado | Pontos passados ficam; novos torneios usariam a tabela nova → mistura de regimes em um mesmo ranking contínuo | [INFERÊNCIA] |
| Migração necessária? | Não para schema (nada é persistido). Uma troca altera o comportamento futuro sem sinalização de versão no save | — |
| Rollout reversível? | Sim, em código: reverter o default restaura o comportamento; os pontos já ganhos permanecem. `TOURNAMENT_TIER_CONFIG` é fixado no import, então a troca vale após reiniciar o app | §1.3 |
| Risco entre versões | Save criado na versão N e aberto na N+1 muda de regime sem aviso; sem campo de versão não há como distinguir | — |

Não foram alterados schema nem saves. A inspeção de arrays persistidos de calendário (`round_points` por torneio) não foi feita nesta fase (§8).

## 6. Alternativas

### A — Manter `balanced`
- **Benefícios:** comportamento atual validado em campo (RC 0.9.0); zero risco de regressão; saves estáveis.
- **Riscos:** o app não tem a calibração Silver (offset 0,25 → campo Silver OVR ~44 vs 36,6) nem a 5.27-F (ranking por derrotas Gold+) nem a 1ª dupla 5.27-E. A 6J mediu P(1ª partida Silver, OVR 45) = 0,73 e título fácil em OVR 55–65.
- **Sistemas:** nenhum. **Saves:** compatível. **Testes:** nenhum novo; reparar `test-no-gold-change` é higiene separada. **Reversibilidade:** n/a.
- **Recomendação:** válida como estado padrão enquanto a decisão humana não for tomada.

### B — Ativar `balanced-e` integralmente
- **Benefícios:** estado que as fases 5.27-E/F/I validaram em conjunto (Stage 1 45/45). Silver mais acessível ao iniciante (+0,12 em P(1ª partida) OVR 45, 6J).
- **Riscos:** muda **ranking** (pontos Gold+, fit Silver global afetando a IA e `titleChance`), **1ª dupla** e campo Silver ao mesmo tempo, sem medição isolada de cada um no app real; a validação da 5.27 usa harness sem save/reload do app. Cobertura de regressão é frágil (§4). Silver quase igual ao Bronze (mediana 36,6 vs 35) — o desenho da 5.27-I, mas que a 6I/6J questionam pelo lado de jogadores de OVR 55–65.
- **Sistemas:** ranking, IA de torneios, calendário/elegibilidade, 1ª dupla, relatórios de dificuldade (6I).
- **Saves:** sem migração, mas muda regimes de carreiras em andamento (§5).
- **Testes necessários:** `test-silver-vs-gold-order-v527i`, `test-silver-band-baseline-v527i`, `test-balanced-e-gates-v527i`, `test:admission-matrix-v522f`, 6F/6G/6H, persistência de carreira; hash de campos por semente × tier; mundo de meio de carreira.
- **Reversibilidade:** boa em código (um default); parcial em dados (pontos de ranking já ganhos).
- **Recomendação:** não adotar por troca cega de default.

### C — Transporte seletivo (flags independentes, default = atual)
- **Benefícios:** cada calibração entra isolada, medida e reversível. Permite começar pela de menor raio de ação: `silverFieldOffsetPct` (só campo do jogador, 1 ponto de leitura em `WorldTourLifecycle:1188`) e `firstPartner*` (só vitrine inicial). `silverPeakLow` e 5.27-F tocam ranking/IA e pedem mais cautela.
- **Riscos:** combinações novas nunca validadas em conjunto (a 5.27-I assumiu 5.27-E/F ativas); ao desligar `silverPeakLow` o offset 0,15 pode gerar campo diferente do micro da 5.27-I (a 6J mediu "CAL_E" com os dois). Mais superfície de teste.
- **Saves:** igual a B, restrito aos itens ligados. **Testes:** os de B, mais hash de campos com flags off = atual, e medição por item em 5+ sementes (dia ~8 e meio de carreira).
- **Reversibilidade:** alta.
- **Recomendação:** é o caminho recomendado **se** a decisão humana for adotar a calibração.

### Recomendação consolidada
Manter A agora. Decisão humana necessária: o app deve ter a calibração Silver/1ª dupla/5.27-F? Em caso afirmativo, usar C, item por item, na ordem: (1) `silverFieldOffsetPct` (mantendo `silverPeakLow` atual e medindo), (2) `firstPartner*`, (3) 5.27-F com análise de ranking, (4) `silverPeakLow` por último. Não mexer na recomposição estratificada (decisão da 6J mantida).

## 7. Testes e verificações desta fase
- [EXECUTADO] `npm ci --ignore-scripts` (dependências, sem alterar `package.json`/lock; `node_modules` ignorado pelo Git).
- [EXECUTADO] `test-no-gold-change-v527i`: 2/3 (reproduz a falha preexistente).
- [EXECUTADO] comparação de hashes por bloco (script temporário no scratchpad, fora do repositório).
- Nenhuma simulação de carreira ou matriz de torneios foi executada.

## 8. Limitações
1. Histórico Git squashado (série 5.27 em `565437f`): a auditoria de fases usa relatórios `reports/rebalance-527*/` e o código atual, sem diff por fase.
2. Conteúdo das mudanças em `sponsors.js` e `teamCompatibility.js` desde a 5.27-I não foi diffado; só se verificou que os blocos semânticos continuam iguais.
3. Não foi verificado se torneios do calendário persistido em saves carregam `roundPoints` materializados (se sim, a troca só valeria para torneios gerados depois). Requer inspeção de `buildSeasonTournaments`/persistência.
4. Prevalência real do "ranking por derrotas" (5.27-F) no app não foi medida.
5. Nada foi testado em dispositivo Android; web/desktop/Android compartilham o mesmo código.
6. Não há ferramentas de edição de save; impacto em saves é por leitura de código.

## 9. Escopo proposto para CLOUD-6L
Somente após decisão humana sobre A/B/C:
1. Se C: introduzir `silverFieldOffsetPct` como flag de produção (default = 0,25), com teste de hash de campos com flag off e medição do campo Silver em 5+ sementes, dia ~8 e meio de carreira; sem mexer em `silverPeakLow` ou 5.27-F.
2. Medir 5.27-F em mundo real de 2 anos (jogador que perde sempre em Gold+) para decidir se o problema existe em `balanced`.
3. Reparar `test-no-gold-change-v527i` e `run-tests-rebalance-527i.mjs` (por decisão explícita): trocar hash de arquivo por hash semântico no bloco `commitment`, ou retirar da lista com justificativa; regenerar baseline somente com autorização.
4. Verificar persistência de `roundPoints`/calendário em saves.
Fora de escopo: recomposição estratificada, mudança de schema, migração de saves.

## 10. Arquivos modificados
- `reports/cloud-phase-6k-production-preset-audit/CLOUD_PHASE_6K_REPORT.md` (novo)
Nenhum arquivo em `src/`, `scripts/`, `package.json` ou `reports/rebalance-*` foi alterado.

## 11. Commit final
Commit específico da CLOUD-6K na branch `cloud/phase-6k-production-preset-audit` (hash no resumo da entrega). Sem push, merge, rebase ou PR.
