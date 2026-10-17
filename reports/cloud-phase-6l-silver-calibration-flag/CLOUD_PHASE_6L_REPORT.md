# CLOUD-6L — Isolated Silver Calibration (flag experimental, reversível)

Base: `cloud/phase-6k-production-preset-audit` @ `1218a3f` (worktree limpo) → branch `cloud/phase-6l-silver-calibration-flag`.
Nenhum push, PR, merge ou rebase. Nenhuma temporada completa executada.

## 1. Arquivos modificados
| Arquivo | Mudança |
|---|---|
| `src/lib/balance527.js` | + `setSilverCalibrationExperiment6L(bool)`, `isSilverCalibrationExperiment6LEnabled()`, `getSilverCalibrationOffsetOverride6L()`, `SILVER_CALIBRATION_6L_OFFSET_PCT = 0.15`. Presets e `getBalance527()` intocados. |
| `src/gameplay/worldTour/WorldTourLifecycle.js` | Único consumidor (`buildPlayerTournamentField`): `getSilverCalibrationOffsetOverride6L() ?? <expressão anterior>`. A expressão `silverFieldOffsetPct ?? 0.25` foi mantida literalmente (testes 5.27-I fazem regex nela). |
| `scripts/test-silver-calibration-flag-6l.mjs` | Novo teste direcionado (módulos reais via Vite SSR, mundo real semeado). |
| `reports/cloud-phase-6l-silver-calibration-flag/` | Este relatório e `results.json` (saída do teste). |

## 2. Mecanismo de ativação
Estado em memória no módulo `balance527.js`, alterado só por chamada explícita ao setter (apenas `=== true` liga). Sem `globalThis`, sem env, sem storage, sem UI. É lido **a cada chamada** de `buildPlayerTournamentField` (como já era o parâmetro), logo **não depende de ordem de import** nem de configuração em tempo de importação.
```js
const { setSilverCalibrationExperiment6L } = await load('/src/lib/balance527.js');
setSilverCalibrationExperiment6L(true);   // 0,15
setSilverCalibrationExperiment6L(false);  // reverte (0,25)
```
Nada em `src/` chama o setter; só harness/testes. Default: **desligado → 0,25**.

## 3. Testes executados
`node scripts/test-silver-calibration-flag-6l.mjs` → **16/16**:
1. default desativado · 2. default 0,25 (balanced sem `competition`, fallback 0,25 no consumidor) · 3. flag liga 0,15, desliga reverte, valores não-`true` não ligam · 4. presets (`balanced`, `balanced-e` e `getBalance527()`) serializados idênticos com flag ligada; os 5 parâmetros `competition` do `balanced-e` inalterados · 4b. config de tier / tabela de pontos do catálogo idênticas · 5. Gold e Bronze: campos idênticos (ids) com flag ligada (2 sementes) · 6. catálogo/mundo inicializam e o campo Silver sai completo e sem duplicatas · 7. perfil persistido idêntico antes/depois; `saveFoundation.js` sem referência; flag só aparece em `balance527.js` e no consumidor · determinismo (campo repetido com flag off idêntico).

Regressão: `test-silver-band-baseline-v527i` 4/4; `test-no-gold-change-v527i` 2/3 — **mesma falha pré-existente da 6K** (`commitment`, hash de `partnerLifecycle.js`); comparação semântica: ranking/tactics/balance/partnerPolicy/engine IGUAIS. `eslint` nos arquivos tocados: ok. `npm run build`: ok.

## 4. Resultados (sementes `6l-seed-a`, `6l-seed-b`; mundo real, 8 dias de aquecimento)
| | Flag OFF | Flag ON |
|---|---|---|
| Silver offset (duplas puladas), campo de 15 | 75 | 45 (≈15% do pool; antes 25%) |
| Silver OVR médio do campo (a / b) | 43,7 / 44,1 | 38,7 / 38,4 |
| Bronze (OVR do campo / offset) | 35,3 / 35,6 · 0 | idêntico · 0 |
| Gold (OVR do campo / offset) | 78,4 / 77,0 · 0 | idêntico · 0 |

Cenários curtos (semente a; campo Silver real, OVR de referência do jogador; não é simulação de partidas): lacuna campo−jogador, OFF → ON:
OVR 22: +21,7 → +16,7 · OVR 30: +13,7 → +8,7 · OVR 40: +3,7 → −1,3 · OVR 45: −1,3 → −6,3.
Interpretação: a flag desloca o campo Silver ≈5 OVR para baixo. Não foi simulado win-rate por partida (limitação).

## 5. Invariantes preservadas
Com flag off: código executado idêntico ao anterior (override `null` → expressão antiga). Com flag on: só a janela do campo Silver muda; elegibilidade (`evaluateTournamentEntry`), `silverPeakLow`, banda de adequação, 1ª dupla, pontos de derrota Gold+, ranking, economia, treino, fadiga, IA, schema e versão (`0.9.0-rc.1.9`) não foram tocados. `balanced-e` não foi alterado nem ativado.

## 6. Limitações
- A flag afeta apenas o campo **do jogador** (como o parâmetro original); a IA/Silver global não muda.
- Sem simulação de partidas/temporadas: só composição de campo. Efeito em win-rate e progressão do jogador não medido.
- Efeito colateral de composição (Silver mais fraco que o atual) pode aproximar Silver do Bronze (Bronze ≈35 vs Silver ≈38); a 6J/5.27-I indicava a ordem Bronze > Silver ≈ Gold com o preset completo `-E`, que inclui também `silverPeakLow=900`. Isolar só o offset não reproduz esse conjunto.
- `test-no-gold-change-v527i` continua 2/3 por causa pré-existente.

## 7. Reversão
Não chamar o setter (ou chamar com `false`). Para remover de vez: reverter este commit único (`git revert <sha>`); nenhum dado migrado, nenhum schema alterado.

## 8. Riscos para saves existentes
Nenhum dado novo é gravado; o flag não vive no save. Como a flag só pode ser ligada por código de teste, saves de produção não são afetados. Se um dia ativada por padrão, carreiras em andamento passariam a montar campos Silver futuros com a janela de 15% sem sinalização no save (mistura de regimes, como já descrito na 6K §5); torneios já sorteados não mudam.

## 9. Recomendação
Manter experimental (default off). Antes de qualquer ativação: (a) rodar a simulação de partidas do harness 5.27-I/6J com flag on × off, especialmente para OVR 22–30 (a 6J mostrou risco para iniciantes na recomposição estratificada; aqui o campo só encolhe de nível, mas o efeito sobre Bronze→Silver precisa ser medido); (b) decidir a 5.27-F (pontos Gold+) separadamente; (c) se adotada, torná-la parâmetro versionado do preset (não do setter) com a decisão humana documentada.
