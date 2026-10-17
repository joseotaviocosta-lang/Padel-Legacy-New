# CLOUD-6O — Cloud-to-Windows Integration Readiness

Fase **somente de diagnóstico e documentação**. Nenhum código, teste, `package.json`, save, schema, balanceamento, flag, dependência ou versão foi alterado. Nenhum merge/rebase, PR ou push foi feito. Nenhum comando foi executado no computador do usuário. Não foram rodados testes, builds nem simulações nesta fase.

Branch: `cloud/phase-6o-integration-readiness` (criada a partir de `cloud/phase-6n-career-critical-flows` @ `044da29`, confirmado).

---

## 1. Estado Git verificado (no ambiente de nuvem)

| Item | Valor verificado |
|---|---|
| Repositório | `https://github.com/joseotaviocosta-lang/Padel-Legacy-New` |
| Branch de origem | `cloud/phase-6n-career-critical-flows` |
| HEAD de origem | `044da29` (CLOUD-6N) — **igual ao esperado** |
| Worktree na nuvem | limpo e em dia com `origin/cloud/phase-6n-career-critical-flows` antes de criar a 6O |
| `origin/main` | `498e3ac` ("v.6", 2026-08-03), `package.json` `0.6.6-alpha.1` |
| `package.json` da 6N | `0.9.0-rc.1.9` (versão **inalterada** pelas fases CLOUD) |
| Node na nuvem | v22.22.0 |

> Tudo acima descreve o **clone da nuvem**. **Nada** aqui comprova o estado do Windows (branch atual, HEAD, commits locais, arquivos sujos). O Windows deve ser considerado desconhecido até rodar os comandos da seção 6.

## 2. Cadeia de commits

### 2.1 Cadeia CLOUD é linear
Todas as 21 branches `origin/cloud/phase-*` são **ancestrais** de `origin/cloud/phase-6n-career-critical-flows` (verificado com `git merge-base --is-ancestor`). Cada fase está exatamente 1 fase à frente da anterior; a 6N contém todas. Não há ramificação entre fases.

Base de toda a cadeia: **`4fac81d`** — `ui: fix mobile partner filters and coach card layout (build 9007)` (2026-10-16). Do `4fac81d` até a 6N: **30 commits**.

| Fase | Tip | Natureza |
|---|---|---|
| 0 | `efc1a3f` | baseline de testes (relatórios/logs) |
| 1 | `b8db071` | diagnóstico de integridade |
| 2 | `c969662` | correções: colisão de IDs, falha de sorteio rastreável, tipagem, ~10 testes atualizados |
| 3A | `c604ee2` | teste de mercado determinístico |
| 3B | `0c28fae` | **produção**: busca de parceiro com lado indefinido |
| 4 | `df8902b` | validação de integração (relatório) |
| 5 | `fbb0bc4` | **produção**: semeadura em lote + side profiles 1x (desempenho) |
| 6A | `b19d96f` | auditoria (relatório) |
| 6B | `7caab6e` | **produção**: janela de desenvolvimento contínua |
| 6C | `5a8350a` | **produção**: teto de bônus de vitória (`attributeCeiling.js`) |
| 6D–6G | `3234cd4`…`c02c713` | diagnóstico/relatórios |
| 6H | `94fe862` | **produção**: seleção de torneio do simulador, exibição honesta de chance de título |
| 6I–6K | `01824b4`…`1218a3f` | diagnóstico/relatórios |
| 6L | `58466e3` | **produção**: flag Silver experimental (default desligada) |
| 6M | `d6db62e` | **produção**: um único shell de cabeçalho no `AppLayout` |
| 6N | `044da29` | testes + relatório de fluxos críticos |

### 2.2 Ancestral comum com `main`: **NÃO EXISTE**
`git merge-base origin/main origin/cloud/phase-6n-career-critical-flows` retorna **vazio** (exit 1). As duas linhagens têm raízes diferentes:

- `main` → raiz `ad9eb22` ("Projeto inicial", 2026-07-31). 19 commits, até `498e3ac` (2026-08-03).
- Linhagem CLOUD → raiz `52aa933` ("skill", 2026-09-15). 50 commits, até `044da29`.

Consequências verificadas:
- **Commits exclusivos de `main`:** 19 (todos). **Exclusivos da 6N:** 50 (todos).
- `git diff origin/main..6N`: 2 795 arquivos (2 535 adicionados, 254 modificados, 6 removidos), +1,19 M / −13 k linhas. Um merge direto seria, na prática, um *add/add* em massa (históricos não relacionados exigiriam `--allow-unrelated-histories`).
- `main` está **muito defasada** (v0.6.x alpha, 2026-08) em relação à linhagem usada no desenvolvimento (v0.9.0-rc, 2026-10). A `main` não contém, por exemplo, `d5e5a2e`/`565437f`/builds 9001–9007.
- A tag `v0.9.0-beta.1` aponta para `498e3ac` (tip de `main`), não para a linhagem CLOUD.
- Outras branches remotas (`feature/*`, `fix/*`) também são ramos da raiz de `main`, **exceto** `feature/live-coach-dynamic-adaptation`, que termina exatamente em `4fac81d` (é a mesma base das fases CLOUD; 0 commits próprios).

**Conclusão:** a linhagem real do produto é `52aa933 → … → 4fac81d → CLOUD-0 … 6N`. O Windows quase certamente trabalha nessa linhagem (confirmar na seção 6). `main` remota **não é** base utilizável para integrar as fases CLOUD sem decisão humana explícita.

### 2.3 O que a cadeia CLOUD altera (`4fac81d..044da29`)
| Categoria | Arquivos |
|---|---|
| Produção (`src/`) | 15 (13 M, 2 A) — ≈ +339 / −100 linhas |
| Scripts/testes (`scripts/`) | 55 (22 novos, **33 modificados** — testes históricos realinhados) |
| Relatórios (`reports/cloud-phase-*`) | 161 arquivos novos (+124 k linhas) |
| Config | `package.json` (somente scripts novos) |
| `package-lock.json`, deps, versão, `src-tauri`, `base44/` | **inalterados** |

Arquivos de produção: `AppLayout.jsx` (6M), `PartnerSearch.jsx`, `career.js` (3B), `saveFoundation.js`, `athleteSchema.js`, `teamCompatibility.js` (5), `trainingSystemV2.js` (6B+6C), `attributeCeiling.js` novo, `padel.js` (6C), `tournamentProjectionDisplay.js` novo, `Tournaments.jsx` (6H), `balance527.js`, `WorldTourLifecycle.js` (6L), `calendarSystem.js`, `CareerEntityRepository.js` (CLOUD-2).

## 3. Riscos de integração

### 3.1 Confirmados (verificados por Git na nuvem)
1. **Sem ancestral comum entre `main` e a 6N.** Merge/rebase para a `main` atual é inviável como "integração normal" (ver 2.2).
2. **Arquivos tocados por mais de uma fase:** `trainingSystemV2.js` (6B e 6C), `PartnerSearch.jsx` e `career.js` (3B; ambos citados por commits distintos de CLOUD-3B), `package.json` (3B, 5, 6B, 6C, 6M, 6N). Dentro da cadeia linear isso **não gera conflito**; só importa se aplicar commits seletivamente (6C depende de 6B; 6C introduz `attributeCeiling.js` usado por `padel.js` e `trainingSystemV2.js`).
3. **`package.json` mudou somente em `scripts`** (adição de `test:*` e `benchmark:*`); sem dependências, sem `version`, `package-lock.json` intacto. Se o Windows alterou `package.json` localmente, há risco de conflito textual nessa seção.
4. **33 testes históricos modificados** nas fases 1/2 (realinhados a redesenhos 5.24–5.31 e ao calendário de `d5e5a2e`). Se o Windows também editou esses scripts, conflito.
5. **Os dois JSON do usuário** (`reports/fase-m4-2-1-training-economy-balance.json`, `reports/phase15-3-simulation.json`) existem rastreados no `4fac81d` e na 6N, **e nenhuma fase CLOUD os modifica** (verificado por `git diff --name-only`). Logo, a cadeia CLOUD não conflita com eles; o risco é só o de um checkout/pull/stash do Windows os sobrescrever — daí o backup (seção 6).
6. **Mudanças de comportamento de produção já presentes na cadeia** (precisam de validação humana):
   - 6B: janela de desenvolvimento contínua (atributos deixam de saturar em ~18; atributos acima do teto não são mais rebaixados).
   - 6C: bônus de vitória +1/+2 limitado ao teto individual (consumo de RNG inalterado).
   - 6H: simulador filtra por ranking de **dupla** (`evaluateTournamentEntry`); legado atrás de `PL526_LEGACY_INDIVIDUAL_RANK_SELECTION=1`; análise do coach não mostra mais % de título/semifinal só por ranking.
   - 3B: busca de parceiros lista candidatos com lado indefinido.
   - CLOUD-2: IDs gerados em colisão são resolvidos sem mudar o formato; falha de sorteio de torneio passa a ser registrada.
   - 6M: um único shell de cabeçalho (compacto <768 px ou desktop) em vez de dois montados e escondidos por CSS.

### 3.2 Potenciais (não confirmados; dependem do estado real do Windows)
1. **HEAD local desconhecido**: pode ter commits que não existem no remoto, estar em outro ponto da linhagem, ou numa linhagem derivada da `main`.
2. **Saves existentes (compatibilidade):** nenhuma fase alterou `careerSchema`, `CareerMigration` ou schema persistido (verificado: não aparecem em `git diff --name-only 4fac81d 044da29`). Riscos residuais:
   - 5: `ensureWorldSeed2025` agora usa `bulkCreate` (ordem de criação: todos os atletas antes das duplas; IDs continuam por `makeUniqueId`). Com fallback sequencial. Deve ser validado em carreira **nova** e em **existente**; saves antigos não re-semeiam o que já existe.
   - 6B/6C: carreiras em andamento passam a evoluir atributos por regra diferente → trajetórias futuras mudam (sem reescrever atributos existentes; atributos ≥ teto são intocados).
   - 6H: a lógica do simulador mudou; inscrições e sorteios já persistidos não são reescritos (a verificar no Windows).
3. **Flag Silver (6L):** `setSilverCalibrationExperiment6L` está **desligada por padrão**, existe só em memória, não entra em save, não é lida de storage/ambiente e não tem UI. Observação: `balance527.js` já contém `silverFieldOffsetPct: 0.15` em `ENTRY_COMPETITION_527E` (preset `balanced-e`, pré-existente da 5.27-I); o `WorldTourLifecycle.js` usa `override ?? preset ?? 0.25`. **Não ativar** na integração; qualquer ativação padrão mudaria o campo Silver de carreiras em andamento (≈ 5 OVR para baixo, segundo a 6L).
4. **Desempenho Android:** a 5 reduziu gravações físicas da semeadura de 156 → 8 (medido em Node, disco em memória). Ganho real em Redmi 12 **não medido**. A 6M reduz consultas do cabeçalho em ≈50 % (contagem estrutural); rotação cruza 768 px e remonta o cabeçalho (recarrega dados uma vez). Ambos exigem Android físico.
5. **`typecheck`** tinha 2 201 diagnósticos já na CLOUD-4 (sem novos). Não é gate.
6. **Arquivos ignorados:** `.gitignore` ignora `*.log`, `node_modules/`, `dist/`, `src-tauri/target/`, `.build-cache/`, `.gradle/`. **Logs locais do Windows são invisíveis ao `git status`** e só entram no backup se listados com `-i` (seção 6).
7. `src-tauri/gen/android/` está rastreado (48 arquivos); `keystore.properties.txt` está rastreado (vazio no commit analisado). Nenhuma fase CLOUD o tocou.

### 3.3 Falhas históricas conhecidas (não são regressões das fases CLOUD)
- CLOUD-2/4: **32 testes** falham desde a baseline CLOUD-0/1: 11 dependem de artefatos `rebalance-527*` do Windows; 3 de Chrome com caminho Windows; `career-pace-production` (>40 min); demais por fixtures/expectativas obsoletas.
- CLOUD-5: `test-partner-quality-over-time-v527h` (4/5, "315 !== 0") — idêntico na base.
- CLOUD-6K/6L: `test-no-gold-change-v527i` (2/3, hash de `partnerLifecycle.js`) — pré-existente.
- CLOUD-6M: `test-desktop-no-duplicate-quick-actions-v524c` (exige screenshots), `test-mobile-performance-m3-5` (gate do comparador `CareerHud`) — idênticos na base `58466e3`.
- CLOUD-6N: `test-phase15-7-first-tournament-parity`, `test-phase15-6-2-tournament-canonical-state`, `test-fatigue-integrity-rc` — fixtures/caminhos desatualizados (documentados).
- Ruído inofensivo em Node: "backup nativo / Tauri indisponível", `TAURI_UNSUPPORTED`, `window is not defined`.
- Aviso de build pré-existente: chunk > 500 kB.

Regra de triagem: uma falha é **regressão nova** só se (a) não consta acima e (b) falha na árvore integrada mas passa no commit de base (`4fac81d`/o HEAD anterior do Windows). Dívida histórica **não** bloqueia o teste local.

## 4. Estratégia recomendada

### Comparação
| | A. Branch local de integração a partir da 6N | B. Integrar 6N à `main` em branch temporária | C. Aplicar commits seletivamente |
|---|---|---|---|
| Premissa | Windows está na linhagem `52aa933…4fac81d` | `main` é a base oficial | Só parte das fases interessa |
| Conflitos | Mínimos (cadeia linear; 6N já contém tudo; só colidem edições locais não commitadas) | **Garantidos em massa**: históricos sem ancestral; 2 795 arquivos; `--allow-unrelated-histories` | Reaparecem em `trainingSystemV2.js` (6B→6C), `package.json`, testes realinhados |
| Rastreabilidade | Alta (histórico preservado) | Baixa (resolve milhares de add/add; pode regredir `main` vs linhagem real) | Média/baixa (cherry-picks duplicam SHAs) |
| Risco ao trabalho local | Baixo se feito em **worktree separada** | Alto | Médio |
| Quando usar | **Padrão** | Só se o dono decidir que `main` é a verdade e a linhagem CLOUD deve substituí-la — decisão de produto, fora do escopo desta fase | Se for preciso excluir uma fase (ex.: reverter 6B/6C); lembrar dependências 6B→6C e 6L→(flag inerte) |

### Recomendação: **A, com `git worktree` separado**
1. Não mexer na worktree atual do Windows. Criar uma **segunda worktree** (pasta irmã) com branch nova a partir de `origin/cloud/phase-6n-career-critical-flows`. Assim os arquivos modificados/não rastreados, JSON, logs e capturas ficam intactos por construção.
2. Se o HEAD do Windows contiver commits locais próprios (não presentes em `4fac81d`), integrá-los **depois**, na branch de integração, via `git merge` (ou `cherry-pick` dos commits próprios) — nunca rebase de histórico publicado.
3. `main` não deve ser alterada nem usada como alvo até decisão humana sobre a divergência de históricos (anotar como pendência).

## 5. Estrutura dos checkpoints (resumo)
CP0 backup verificado → CP1 diagnóstico de topologia (merge-base do HEAD local com 4fac81d/6N) → CP2 worktree de integração criada → CP3 `npm ci` + testes críticos → CP4 lint/build/arquitetura → CP5 app web/desktop → CP6 Android físico → CP7 decisão (aprovar/reverter). **Parar** em qualquer critério da seção 9.

## 6. Comandos PowerShell seguros

> Todos são de leitura, cópia ou criação. Nenhum usa `reset --hard`, `clean`, `checkout -f`, `switch -f`, `stash` ou `rebase`. Executar **na raiz do repositório** do Windows. Ajustar `$Repo`.

### 6.1 Inspeção (somente leitura)
```powershell
$Repo = "C:\caminho\para\Padel-Legacy-New"   # AJUSTAR
Set-Location $Repo
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status -sb
git log --oneline -15
git remote -v
git worktree list
git stash list                      # só listar; não aplicar
```
```powershell
git status --porcelain=v1 -uall | Tee-Object "$env:TEMP\pl_status_before.txt" | Measure-Object -Line
git ls-files -m                      # modificados rastreados
git ls-files -o --exclude-standard   # não rastreados (não ignorados)
git ls-files -o -i --exclude-standard | Select-String -NotMatch "node_modules|\\target\\|\\dist\\|\\.gradle\\|\.build-cache"   # IGNORADOS (logs *.log etc.)
git diff --stat                      # alterações não commitadas
```
**Parar se:** `git status` mostrar "rebase/merge/cherry-pick in progress" ou "unmerged paths". Resolver antes (fora do escopo).

### 6.2 Backup externo ao repositório
```powershell
$Stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = "$env:USERPROFILE\PadelLegacy-backups\pre-cloud-6o-$Stamp"   # FORA do repositório
if ($Backup.StartsWith($Repo, [StringComparison]::OrdinalIgnoreCase)) { throw "Backup dentro do repo: abortar" }
New-Item -ItemType Directory -Path $Backup -Force | Out-Null

# 1) metadados Git
git rev-parse HEAD | Out-File "$Backup\HEAD.txt" -Encoding utf8
git status --porcelain=v1 -uall | Out-File "$Backup\status.txt" -Encoding utf8
git branch -vv | Out-File "$Backup\branches.txt" -Encoding utf8
git log --oneline -50 | Out-File "$Backup\log50.txt" -Encoding utf8
git diff            | Out-File "$Backup\unstaged.patch" -Encoding utf8
git diff --cached   | Out-File "$Backup\staged.patch" -Encoding utf8

# 2) bundle com TODAS as refs locais (preserva commits locais não publicados)
git bundle create "$Backup\repo-all-refs.bundle" --all
git bundle verify "$Backup\repo-all-refs.bundle"
```
```powershell
# 3) cópia dos arquivos modificados + não rastreados + ignorados relevantes (preserva caminho relativo)
$files  = @()
$files += git ls-files -m
$files += git ls-files -o --exclude-standard
$files += git ls-files -o -i --exclude-standard | Where-Object { $_ -notmatch '^(node_modules|src-tauri/target|dist|\.build-cache|\.gradle)/|/\.gradle/' }
$files = $files | Sort-Object -Unique
$files | Out-File "$Backup\file-list.txt" -Encoding utf8
foreach ($f in $files) {
  $src = Join-Path $Repo $f
  if (Test-Path -LiteralPath $src -PathType Leaf) {
    $dst = Join-Path "$Backup\files" $f
    New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
}

# 4) os dois JSON explicitamente (cópia redundante, caminho fixo)
$Json = @("reports\fase-m4-2-1-training-economy-balance.json","reports\phase15-3-simulation.json")
New-Item -ItemType Directory -Path "$Backup\critical-json" -Force | Out-Null
foreach ($j in $Json) { Copy-Item -LiteralPath (Join-Path $Repo $j) -Destination "$Backup\critical-json\" -Force }

# 5) relatórios, logs e capturas inteiros (sem node_modules)
robocopy "$Repo\reports" "$Backup\reports-full" /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
Get-ChildItem $Repo -Recurse -File -Include *.log,*.png,*.jpg,*.jpeg,*.webp,*.mp4 -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\(node_modules|target|dist|\.gradle|\.git)\\' } |
  ForEach-Object {
    $rel = $_.FullName.Substring($Repo.Length).TrimStart('\')
    $dst = Join-Path "$Backup\media-logs" $rel
    New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
  }
```
*(robocopy retorna código 0–7 em sucesso; ignorar `$LASTEXITCODE` < 8. Sem `/MIR` nem `/PURGE` — nunca apaga.)*

### 6.3 Verificação de integridade e de não-remoção
```powershell
# manifesto SHA256 da origem x cópia
$bad = @()
foreach ($f in $files) {
  $s = Join-Path $Repo $f; $d = Join-Path "$Backup\files" $f
  if (Test-Path -LiteralPath $s -PathType Leaf) {
    if (-not (Test-Path -LiteralPath $d)) { $bad += "FALTA: $f"; continue }
    if ((Get-FileHash -LiteralPath $s).Hash -ne (Get-FileHash -LiteralPath $d).Hash) { $bad += "HASH DIFERENTE: $f" }
  }
}
foreach ($j in $Json) {
  if ((Get-FileHash (Join-Path $Repo $j)).Hash -ne (Get-FileHash "$Backup\critical-json\$(Split-Path $j -Leaf)").Hash) { $bad += "JSON DIFERENTE: $j" }
}
$bad; "Falhas: $($bad.Count)"
Get-ChildItem "$Backup\files","$Backup\reports-full","$Backup\media-logs" -Recurse -File -ErrorAction SilentlyContinue |
  Get-FileHash | Select-Object Hash,@{n='Path';e={$_.Path.Substring($Backup.Length)}} | Export-Csv "$Backup\manifest-sha256.csv" -NoTypeInformation
```
```powershell
# nada foi apagado/alterado no repo: o status deve ser idêntico ao do início
git status --porcelain=v1 -uall | Out-File "$env:TEMP\pl_status_after.txt" -Encoding utf8
Compare-Object (Get-Content "$env:TEMP\pl_status_before.txt") (Get-Content "$env:TEMP\pl_status_after.txt")   # vazio = ok
```
**CP0 — Parar se:** `Falhas > 0`, `git bundle verify` falhar, ou `Compare-Object` retornar diferença. Só prosseguir com backup 100 % íntegro.

### 6.4 Diagnóstico de topologia (somente leitura; só `fetch`)
```powershell
git fetch origin --prune
git rev-parse --verify origin/cloud/phase-6n-career-critical-flows      # esperado: 044da29...
git cat-file -t 4fac81d                                                  # deve ser "commit"
git merge-base --is-ancestor 4fac81d HEAD; "HEAD contém 4fac81d? exit=$LASTEXITCODE (0 = sim)"
git merge-base HEAD origin/cloud/phase-6n-career-critical-flows
git rev-list --left-right --count HEAD...origin/cloud/phase-6n-career-critical-flows   # "locais  remotos"
git log --oneline origin/cloud/phase-6n-career-critical-flows..HEAD      # commits locais não presentes na 6N
git diff --name-only HEAD origin/cloud/phase-6n-career-critical-flows -- src package.json | Out-File "$Backup\diff-vs-6n.txt"
```
Interpretação:
- `merge-base` vazio → **PARAR** (linhagem diferente; pedir decisão humana; não integrar).
- `merge-base` = `4fac81d` ou posterior na cadeia, sem commits locais → caminho simples (6.5).
- Há commits locais → listar; integrá-los na branch de integração depois do CP3 (6.7).

### 6.5 Criar a branch de integração em worktree separada (A)
```powershell
$Int = Join-Path (Split-Path $Repo -Parent) "Padel-Legacy-New-cloud6o"     # pasta NOVA
if (Test-Path $Int) { throw "Pasta já existe: escolher outra" }
git worktree add -b integration/cloud-6o $Int origin/cloud/phase-6n-career-critical-flows
Set-Location $Int
git rev-parse --short HEAD          # esperado 044da29
git status -sb                      # esperado limpo
```
Reverter, se necessário (não destrutivo para o original): `Set-Location $Repo; git worktree remove $Int` (só remove a pasta nova, sem alterações) e `git branch -d integration/cloud-6o`.
**Parar se:** `HEAD` ≠ `044da29`, ou `git status` não limpo.

### 6.6 Comparar o que o Windows tem localmente contra a 6N (opcional, leitura)
```powershell
Set-Location $Repo
git diff --stat HEAD origin/cloud/phase-6n-career-critical-flows -- package.json scripts | Select-Object -Last 5
git diff --name-only ; git ls-files -m | ForEach-Object { if ($_ -in (git diff --name-only HEAD origin/cloud/phase-6n-career-critical-flows)) { "COLISÃO POTENCIAL: $_" } }
```
`COLISÃO POTENCIAL` = arquivo editado localmente que a cadeia CLOUD também altera → tratar manualmente quando for trazer as edições locais para a worktree de integração. Os dois JSON **não** devem aparecer.

### 6.7 Trazer commits locais (se existirem) — na worktree de integração
```powershell
Set-Location $Int
git merge --no-ff --no-commit <sha-ou-branch-local>   # inspeciona antes de confirmar
git status
# conflitos? PARAR e analisar arquivo a arquivo; aborto não destrutivo:
git merge --abort
```
Edições **não commitadas** do Windows não são migradas automaticamente: comparar com o backup (`unstaged.patch`) e, se necessário, aplicar com `git apply --check` antes de `git apply`.

### 6.8 Aceitar ou desistir
- Aceitar: usar `$Int` como diretório de trabalho de teste. A worktree original permanece como está.
- Desistir: remover somente a worktree nova (6.5) — o repositório original e o backup ficam intactos.

## 7. Plano de backup e verificação (resumo)
Backup em `%USERPROFILE%\PadelLegacy-backups\pre-cloud-6o-<data>` **fora do repo**, contendo: HEAD/status/branches, `unstaged.patch`/`staged.patch`, `repo-all-refs.bundle` (verificado), cópia de modificados/não rastreados/ignorados relevantes, cópia redundante dos dois JSON, `reports/` completo, logs e capturas, `manifest-sha256.csv`. Verificações: hashes origem×cópia, `bundle verify`, `status` antes×depois idêntico. Nenhum comando de remoção em todo o fluxo.

## 8. Checklist técnico (na worktree de integração; ordem recomendada)
Dívida histórica **não** impede o teste local; registrar resultado de cada item e comparar com a seção 3.3.

| # | Item | Comando | Esperado |
|---|---|---|---|
| 1 | Dependências | `npm ci` | OK (sem alterar `package-lock.json`; conferir `git status` limpo depois) |
| 2 | Arquitetura | `npm run validate:architecture` | OK (passou na 6N) |
| 3 | CLOUD-6N | `npm run test:cloud-6n-career-flows` | 22/22 PASS |
| 4 | CLOUD-6M mobile | `npm run test:cloud-6m-shell` + `node scripts/test-mobile-m2-shell.mjs` e `scripts/test-global-header-calendar-rc.mjs` | PASS (fails históricos 6M: `…quick-actions-v524c`, `mobile-performance-m3-5`) |
| 5 | CLOUD-6H torneios | `node scripts/test-tournament-consistency-6h.mjs`; `node scripts/test-tournament-selection-divergence-6g.mjs`; `npm run test:tournament-registration` | PASS |
| 6 | CLOUD-2 integridade | `node scripts/test-entity-id-collision-cloud2.mjs`; `node scripts/test-tournament-draw-observability-cloud2.mjs`; `npm run test:career-persistence-integrity`; `npm run test:achievement-save-migration` | PASS |
| 7 | CLOUD-3B/5/6B/6C | `npm run test:partner-search-side-3b`; `test:phase5-perf-equivalence`; `test:player-development-6b`; `test:victory-attribute-integrity-6c` | PASS |
| 8 | ESLint | `npm run lint` | 0 erros |
| 9 | Build | `npm run build` | OK (aviso de chunk > 500 kB é histórico) |
| 10 | Typecheck (informativo) | `npm run typecheck` | ≈2 201 diagnósticos (histórico; não é gate) |
| 11 | Saves | ver abaixo | Sem erro de carga/migração |
| 12 | Execução | `npm run dev` (web) e `npm run dev:tauri`/`app:dev` (desktop) | App abre, carreira nova e existente carregam |
| 13 | Flag Silver | `grep -rn setSilverCalibrationExperiment6L src` | Só definição + testes; **nenhum** chamador em código de produção |

**Verificação de saves (item 11):** (a) trabalhar com **cópia** do save existente (a pasta do save do Tauri/localStorage é do usuário; copiar antes de abrir na versão integrada); (b) abrir carreira existente → confirmar carregamento, calendário, parceria, ranking, inscrições; (c) avançar 1–7 dias; (d) salvar, fechar, reabrir; (e) comparar valores-chave (ranking, dinheiro, atributos, datas) antes/depois; (f) criar carreira nova e repetir. Qualquer erro de migração = critério de reversão.

**Distinguir regressão de dívida:** rodar o mesmo teste falho no commit de base (`git worktree add ..\Padel-Legacy-New-base 4fac81d`). Falhou nos dois → dívida histórica. Passa só na integrada → regressão nova (reportar com o nome do teste e a saída).

## 9. Checklist Android (aparelho físico — **não validado na nuvem**)
Referência anterior: Redmi 12, 360 px (fases 4/6M). Nenhum dado de FPS/tempo no Android foi medido em nenhuma fase CLOUD.

1. Conectar o aparelho por USB, depuração USB ativa; aceitar a chave RSA.
2. `adb version` · `adb devices` (deve listar o aparelho como `device`, não `unauthorized`).
3. Gerar build de teste: `npm run android:build` (ou `npm run android:dev` para dev). Para APK de teste, não usar o keystore de release.
4. Instalar: `adb install -r <caminho-do-apk>` (`-r` preserva dados; para carreira existente **não** desinstalar antes).
5. Antes: se houver save relevante no aparelho, extrair/backup (`adb exec-out run-as <pacote> ...` se for build debug) ou exportar pelo app.
6. Abrir **carreira nova** (escolher lado e sem lado): tempo de abertura, ausência de travamento (CLOUD-5), aviso âmbar sem lado e botão "Convidar" (3B).
7. Carregar **carreira existente**: confirma dados e calendário intactos.
8. Navegar entre todas as telas principais: Home, Calendário, Torneios, Treino, Parceiros, Ranking, Loja, etc.
9. Cabeçalho único (6M): sem duplicação, sem salto de layout; sino/notificações abrem uma vez e atualizam.
10. Notificações/comunicações: sem duplicatas ao navegar ou rotacionar.
11. Inscrições: inscrever-se em torneio elegível; ver rejeição correta quando inelegível; ver estado após reabrir.
12. Disputar um torneio: sorteio persistido, jogar rodada, vitória e derrota, premiação e ranking.
13. Avançar calendário 1 dia e 7 dias; bloqueio no dia do torneio inscrito.
14. Fluidez: rolagem de listas longas, troca de abas, abertura de modais; anotar travamentos/jank, tempo de abertura.
15. Rotação retrato↔paisagem (cruza 768 px): header remonta e recarrega uma vez; sem perda de estado, sem tela branca.
16. Voltar do sistema; matar o app no multitarefa e reabrir; confirmar continuação do save.
17. `adb logcat -d | Select-String "FATAL|AndroidRuntime|panic"` após o roteiro (capturar se houver).
18. Teclado aberto no campo "Nome do atleta" do tutorial (pendência da CLOUD-4).

Registrar: aparelho, versão do Android, build/commit, resultado por item, capturas e logs.

## 10. Critérios de aprovação e reversão

**Aprovar (todos):**
- Backup verificado (CP0) e `status` do repo original idêntico ao início.
- Worktree de integração em `044da29` (ou 6N + commits locais revisados) sem conflitos não resolvidos.
- `npm ci`, lint, build, `validate:architecture` OK; testes 6N/6M/6H/CLOUD-2/3B/5/6B/6C PASS ou com falha apenas **idêntica à dívida histórica** (seção 3.3).
- Nenhuma regressão nova (falha que passa na base).
- Saves existentes carregam, avançam e salvam sem erro; carreira nova abre.
- Flag Silver desligada e sem chamador de produção.
- Android: itens 6–16 sem bloqueio (travamento/perda de save/header duplicado).

**Reverter / parar (qualquer um):**
- Falha na verificação do backup, ou `merge-base` vazio (linhagem diferente).
- Conflito inesperado nos arquivos de produção listados em 2.3 ou perda de edição local.
- Erro de carga/migração de save, perda de dados, ou valores-chave divergentes após reabrir.
- Regressão nova em teste crítico, build quebrado, crash no Android.
- Reversão (não destrutiva): remover só a worktree de integração (`git worktree remove $Int`) e a branch `integration/cloud-6o`; continuar na worktree original; restaurar a partir do backup (`bundle` + `files\`) apenas se algo tiver sido alterado, copiando de volta **sem** sobrescrever sem conferir hash.

**Pendência de decisão humana (fora da 6O):** o que fazer com `origin/main` (históricos sem ancestral comum com a linhagem CLOUD) — por exemplo, tornar a linhagem 6N a nova `main` por decisão explícita do proprietário, ou manter `main` como está. Não decidido aqui.

## 11. Limitações
- Ambiente de nuvem: Linux/Node 22, sem Windows, sem WebView, sem Android físico, sem acesso ao worktree, aos saves, aos logs ou às capturas do usuário.
- Estado do Windows (branch, HEAD, commits locais, arquivos sujos, JSON modificados, untracked) **não verificado**; tratado como desconhecido. Não se afirma que esteja limpo ou sincronizado.
- Esta fase não executou testes, build, lint, typecheck, simulações nem Android; resultados citados vêm dos relatórios das fases anteriores e de inspeção Git.
- Os comandos PowerShell **não foram executados** (nem em ambiente Windows de teste); revisar caminhos e variáveis antes de usar. Sintaxe PowerShell não foi validada por interpretador.
- A análise de "arquivos por fase" usa mensagens de commit; commits sem rótulo (`CLOUD-2`) foram atribuídos pela mensagem e pela ordem.
- Conflitos com `main` foram avaliados por topologia (sem ancestral) e `git diff --name-status`; não foi feita tentativa de merge, por restrição.
- A comparação com as branches `feature/*`/`fix/*` foi apenas topológica.

## 12. Arquivos modificados
Somente criado: `reports/cloud-phase-6o-integration-readiness/CLOUD_PHASE_6O_REPORT.md`. Nenhum arquivo de produção, teste, `package.json`, save/schema ou relatório anterior alterado.

## 13. Commit final
Commit único documental na branch `cloud/phase-6o-integration-readiness` (SHA: ver `git log -1`). **Não publicado** (sem push, sem PR); aguardando autorização.
