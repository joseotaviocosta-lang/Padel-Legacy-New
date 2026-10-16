# CLOUD-0 — Baseline de testes (Claude Code Cloud)

**Commit analisado:** `4fac81d` (build 9007), branch `feature/live-coach-dynamic-adaptation`, sincronizada com o remoto (0/0).
**Branch de trabalho:** `cloud/phase-0-test-baseline`, criada a partir de `4fac81d`.
**Data:** 16/10/2026.

**Regras desta fase:**
- nenhum arquivo de `src/` alterado;
- nenhum teste alterado;
- nenhum save ou artefato de release tocado;
- nenhum commit ou push sem aprovação.

## Veredito: **CLOUD-0 PARTIAL**

A baseline é reproduzível e está documentada.

**Regressão nova confirmada: nenhuma.**

Dois motivos impedem o PASS:
1. **3 falhas sem causa determinada.** Uma delas é de **persistência**: o `tournament_run` não aparece depois do reload.
2. **15 testes não executáveis aqui.** Dependem de artefatos que só existem na máquina local, de Chrome com caminho Windows ou de uma simulação longa demais.

## Resumo

| Item | Resultado |
|---|---|
| `npm ci` | ✅ 499 pacotes em 11 s; `package-lock.json` e `package.json` idênticos antes e depois (sha256) |
| `npm run lint` | ✅ |
| `npm run build` | ✅ (aviso de chunk > 500 kB, preexistente) |
| `npm run typecheck` | ❌ 2.201 diagnósticos; dívida conhecida (`docs/PROJECT-CLEANUP-AUDIT-RC.md` registrava 1.974); 1.292 são TS2339 |
| Testes únicos executados | **368** |
| Aprovados | **308** |
| Falhos | **60**, todos reproduzidos na repetição serial (0 instabilidade) |
| Não executados por decisão | nenhum da seleção. `test-career-pace-production` (simulação de 4 anos) foi interrompido por tempo e conta como falha/env |

### Por suíte

| Suíte | Resultado | Falhas |
|---|---|---|
| Críticos 5.27-K (20) + torneio pós-correção (4) | **21/24** | 3 × env (artefatos `rebalance-527i/j` só locais) |
| Testes novos 5.30-B | **5/5** | — |
| Testes novos 5.30 (Home) | **8/8** | — |
| Testes novos 5.31 | **10/10** | — |
| Testes novos 5.31-B | **5/5** | — |
| Seleção 5.31-B (51) | **39/51** | as mesmas 12 do Windows (`reports/ui-hotfix-531b/tests.json`) |
| Seleção 5.31 (148) | 119/148 | 21 preexistentes no Windows + 8 env (artefatos/Chrome) |
| Seleção 5.30-B (149) | 117/149 | |
| Live Coach | **5/5** | — |
| Torneio / ranking / calendário | 129/140 | |
| Persistência / save | 18/21 | ver "Problemas confirmados" |

### Classificação das 60 falhas (`classification.json`)

| Classe | Qtde | Critério usado |
|---|---|---|
| Regressão nova confirmada | **0** | — |
| Falha preexistente | 33 | mesma mensagem nos `tests.json` do Windows (5.30-B/5.31/5.31-B) e/ou falha também no 9001 |
| Teste obsoleto ou incompatível | 9 | contradição verificada **no código** entre o teste e uma mudança intencional |
| Instabilidade não determinística | 0 | a repetição serial reproduziu todas |
| Limitação do ambiente cloud | 15 | artefatos só locais, Chrome Windows ou tempo |
| Causa não determinada | 3 | ver abaixo |

**Como a origem foi verificada:** as 18 falhas sem histórico, ou que tinham passado antes, foram rodadas em worktrees dos builds 9001 (`565437f`), 9002 (`c5bf7c8`) e 9005 (`742ee4a`), todos com o mesmo lockfile. Resultado:
- 17 já falhavam no 9001;
- 1 (`test-achievement-save-migration`) passa no 9001 e falha desde o 9002, por mudança intencional.

**Boa notícia:** 12 testes que constavam como falha ou instáveis no Windows **passam aqui** (ver o campo `note` em `results.json`). Exemplos:
- `test-partner-athlete-idempotency-v512` (1.249 s);
- `test-extreme-elite-inactivity-v518` (1.085 s);
- `test-long-career-partner-ecology-v518`;
- `test-tournament-cancellation-cause-v517`.

Eram cortes de **240 s** dos runners de fase no Windows, não falhas de jogo.

## Problemas confirmados e lacunas (ordem de prioridade)

1. **`test-career-persistence-integrity` (não determinada, ALTA).** Depois de um torneio completo (D-3 a D-0) e do reload, o `tournament_run` do torneio disputado não está presente.
   - Falha já no 9001.
   - No Windows aparecia como "preexistente", sem a linha de falha registrada.
   - Precisa de diagnóstico: pode ser comportamento intencional (limpeza do run concluído) ou perda de dado no save.
2. **`test-phase15-5-1-critical-training-center` (preexistente).** `WorldEvent já existe com o id: worldevent-<timestamp>-zn1fu8`.
   - Id gerado com timestamp e sufixo fixo, colidindo no processamento do circuito.
   - Mesma mensagem no Windows.
   - Bug real provável.
3. **`test-ranking-rolling-window-fase4` (não determinada).** Na semana 52, o total de um atleta inativo já decaiu, mas o teste espera a âncora cheia.
   - `rankingWindow.js` mudou no 565437f.
   - Pode ser bug de borda (off-by-one) ou regra nova.
4. **`test-masters-draw-size-comparison-v517` (não determinada).** No modelo de 24 duplas, 2 duplas do Top 20 ficam sem partida.
   - Provável efeito da redução do calendário de elite (`d5e5a2e`).
   - É decisão de design, não correção mecânica.
5. **Lacuna de cobertura (obsoleto).** O 9002 deixou de semear `PlayerAchievement` de demonstração, e `test-achievement-save-migration` perdeu a fixture de linha legada. A tolerância a saves pré-Fase-12 ficou sem cobertura.
6. **Torneio, falhas preexistentes:**
   - `phase15-6-1` (chave já existe em D-7);
   - `phase15-6-2`;
   - `phase15-7` (1º torneio em 28 dias, contra 30-45 esperados).

   Provável efeito do sorteio D-3 unificado e do calendário novo. Não há bug claro; precisam de decisão (atualizar o teste ou corrigir a regra).
7. **`test-partner-engine-ovr-authority-v526b` (preexistente).** Modificadores de contexto do motor (química, energia, coach, vínculo). Toca o motor de partida: só investigar com autorização.
8. **Dívida de testes de UI.** 22 testes estáticos preexistentes conferem markup removido nos redesigns: `premium-*`, `redesign-polish*`, `ui-redesign`, `page-hierarchy`, `mobile-*-m3/m4`, `staff-architecture` e outros. Mantêm a suíte vermelha sem proteger nada. São candidatos a atualização da intenção, como já foi feito nas fases 5.31.
9. **Higiene dos testes:**
   - dois testes **gravam em arquivos versionados** (`reports/fase15-simulation.json`, `reports/phase15-3-simulation.json`);
   - os runners de fase **sobrescrevem** `reports/<fase>/tests.json`;
   - 3 testes v34 rodam `src/` com node puro e quebram no alias `@/`.

## Limitações de execução (cloud)

| Limitação | Testes afetados | Onde validar |
|---|---|---|
| Artefatos de simulação nunca versionados (`reports/rebalance-527g/partner-dump`, `527h/runs`, `527i/runs`, `527i/micro`, `527j/smoke`, `527j/reload-weekly`) | 11 (v527g/h/i/j). Nos 5 testes v527j, **todos os gates de lifecycle passam**; só os gates "carreiras reais" falham | local (Windows), ou versionar os artefatos |
| Chrome fixo em `C:/Program Files/...` | 3 (v520c, v520d ×2) | local; ou parametrizar o caminho (Chromium do Playwright está disponível aqui) |
| Simulação de 4 anos (`test-career-pace-production`) | 1 | rodada dedicada (> 40 min) |
| Sem Tauri runtime: o app não cria carreira no navegador puro | smoke de UI ponta a ponta | local (Tauri/WebView2) |
| Sem Android SDK, adb, emulador ou keystore | APK, smoke físico, ANR | local (Redmi 12) |
| `TAURI_UNSUPPORTED` / `window is not defined` nos logs | aparecem também em testes que **passam** (backup nativo e evento de UI fora do Tauri); ruído, não causa | — |

## Comandos executados

```bash
git fetch origin feature/live-coach-dynamic-adaptation   # HEAD == origin == 4fac81d
git checkout -b cloud/phase-0-test-baseline
npm ci                                                   # lockfile inalterado (sha256)
npm run lint; npm run typecheck; npm run build
git worktree add --detach <scratch>/wt 4fac81d           # execução isolada (+ symlink node_modules)
node reports/cloud-phase-0-baseline/tools/run-baseline.mjs --root=<wt> --out=<scratch>/run1 --jobs=3 --timeout-min=40
node .../run-baseline.mjs --root=<wt> --out=<scratch>/run2-serial --jobs=1 --only=<65 falhas>
node .../run-baseline.mjs --root=<wt-565437f|wt-c5bf7c8|wt-742ee4a> --jobs=1 --timeout-min=15 --only=<18>
python3 reports/cloud-phase-0-baseline/tools/classify.py <scratch> reports/cloud-phase-0-baseline
```

Os testes rodaram num **worktree descartável**: escritas laterais nos `reports/` versionados ficaram fora da árvore principal.

## Arquivos desta pasta

| Arquivo | Conteúdo |
|---|---|
| `CLOUD_PHASE_0_BASELINE.md` | este relatório |
| `results.json` | um registro por teste único: fontes da seleção, status, tempo, resumo; nas falhas: repetição serial, histórico Windows, commits antigos, classe e evidência |
| `classification.json` | contagem e lista por classe |
| `environment.txt` | versões de ferramentas e recursos |
| `logs/<teste>.txt` | últimas 120 linhas da execução serial de cada falha (ANSI e caminhos locais removidos) |
| `logs/_lint.txt`, `_build.txt`, `_typecheck-summary.txt`, `_npm-audit.txt` (extensão `.txt` porque o `.gitignore` do projeto ignora `*.log`) | qualidade estática (o typecheck vai resumido) |
| `tools/run-baseline.mjs` | runner (não grava fora de `--out`) |
| `tools/classify.py` | consolidação e classificação, com a evidência de cada falha |
| `tools/selection.json` | os 393 itens da seleção (368 únicos) e sua origem |
| `tools/history-windows.json` | veredito histórico por teste (5.27-K, 5.30-B, 5.31, 5.31-B) |

**Para comparar uma fase futura:** rode o runner com `--root` no worktree da fase e passe o resultado pelo `classify.py`. Ganho é teste que estava em falha e passou a passar; regressão é teste listado como aprovado aqui que passou a falhar.

## Recomendações (priorizadas; nenhuma aplicada)

1. **Investigar `test-career-persistence-integrity`** (save/reload de torneio). É a única falha de persistência com risco real para o jogador.
2. **Investigar o id duplicado de `WorldEvent`** e a borda da janela de 52 semanas. Dois possíveis bugs de lógica, com escopo pequeno.
3. **Higiene de testes, sem mudar o jogo:**
   - atualizar a intenção dos 9 testes obsoletos e dos 22 de markup antigo, com aprovação caso a caso;
   - impedir que testes gravem em `reports/` versionados;
   - parametrizar o caminho do Chrome;
   - recriar a fixture de conquista legada.
4. **Decidir o destino dos artefatos `rebalance-527*` só locais:** versionar uma amostra mínima, ou marcar esses testes como "local-only".
5. **Smoke físico de 9007** (pendente desde o HANDOFF 01).
