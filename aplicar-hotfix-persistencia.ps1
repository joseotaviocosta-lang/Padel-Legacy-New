$ErrorActionPreference = "Stop"

function Fail($message) {
    Write-Host ""
    Write-Host "ERRO: $message" -ForegroundColor Red
    Write-Host ""
    Read-Host "Pressione Enter para fechar"
    exit 1
}

try {
    $projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    $target = Join-Path $projectRoot "src\local\localDatabase.js"

    if (-not (Test-Path $target)) {
        Fail "Não encontrei src\local\localDatabase.js. Coloque este arquivo na pasta raiz do projeto."
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $projectRoot "backup-hotfix-persistencia-$timestamp"

    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item $target (Join-Path $backupDir "localDatabase.js") -Force

    Write-Host ""
    Write-Host "Backup criado em:" -ForegroundColor Cyan
    Write-Host $backupDir -ForegroundColor Green
    Write-Host ""

    $content = Get-Content $target -Raw -Encoding UTF8

    # ============================================================
    # 1. Adicionar chave para espelho completo do banco
    # ============================================================

    if ($content -notmatch "FULL_MIRROR_KEY") {
        $old = "const CRITICAL_BACKUP_KEY = 'padel-legacy-persistent-critical-v1';"

        $new = @"
const CRITICAL_BACKUP_KEY = 'padel-legacy-persistent-critical-v1';
const FULL_MIRROR_KEY = 'padel-legacy-persistent-full-mirror-v1';
"@

        if (-not $content.Contains($old)) {
            Fail "Não encontrei CRITICAL_BACKUP_KEY."
        }

        $content = $content.Replace($old, $new.TrimEnd())
    }

    # ============================================================
    # 2. Adicionar funções de espelho completo
    # ============================================================

    if ($content -notmatch "function saveFullMirrorSync") {
        $marker = "async function ensureLoaded() {"

        $functions = @'
function saveFullMirrorSync(source) {
  if (!isBrowser || !source) return;

  try {
    const envelope = makeEnvelope(normalizeDatabase(source));
    const serialized = JSON.stringify(envelope);

    window.localStorage.setItem(
      FULL_MIRROR_KEY,
      packStorageString(serialized)
    );
  } catch (error) {
    console.error(
      '[Persistent Save] Não foi possível atualizar o espelho completo.',
      error
    );
  }
}

function loadFullMirror() {
  if (!isBrowser) return null;

  const raw = window.localStorage.getItem(FULL_MIRROR_KEY);
  if (!raw) return null;

  try {
    const envelope = JSON.parse(unpackStorageString(raw));
    return readEnvelope(envelope);
  } catch (error) {
    console.error(
      '[Persistent Save] O espelho completo existe, mas não pôde ser lido.',
      error
    );

    return null;
  }
}

'@

        if (-not $content.Contains($marker)) {
            Fail "Não encontrei ensureLoaded()."
        }

        $content = $content.Replace($marker, $functions + $marker)
    }

    # ============================================================
    # 3. Restaurar espelho completo antes do save legado
    # ============================================================

    if ($content -notmatch "restaurando o espelho completo") {
        $marker = "    const legacy = loadLegacySave();"

        $replacement = @'
    const fullMirror = loadFullMirror();

    if (fullMirror) {
      console.warn(
        '[Persistent Save] IndexedDB não encontrado; restaurando o espelho completo.'
      );

      database = normalizeDatabase(fullMirror);

      await idbCommit(makeEnvelope(database));

      saveCriticalBackupSync(database);

      return database;
    }

    const legacy = loadLegacySave();
'@

        if (-not $content.Contains($marker)) {
            Fail "Não encontrei o carregamento do save legado."
        }

        $content = $content.Replace($marker, $replacement)
    }

    # ============================================================
    # 4. Bloquear criação silenciosa de personagem novo
    # ============================================================

    if ($content -notmatch "criação automática de outro personagem foi bloqueada") {
        $pattern = '(?s)\s*// Seed apenas quando nunca houve save em nenhuma camada\.\s*database = createNewDatabase\(\);\s*await idbCommit\(makeEnvelope\(database\)\);\s*window\.localStorage\.setItem\(FIRST_RUN_KEY, ''created''\);\s*saveCriticalBackupSync\(database\);\s*return database;'

        $replacement = @'

    // Nunca transforma perda de save em uma nova carreira silenciosa.
    const previousInitialization =
      window.localStorage.getItem(FIRST_RUN_KEY);

    if (previousInitialization) {
      throw new Error(
        'Uma carreira já existiu neste navegador, mas nenhum save válido foi encontrado. ' +
        'A criação automática de outro personagem foi bloqueada para proteger seus dados.'
      );
    }

    // Somente uma primeira execução real pode criar o universo inicial.
    database = createNewDatabase();

    await idbCommit(makeEnvelope(database));

    window.localStorage.setItem(FIRST_RUN_KEY, 'created');

    saveFullMirrorSync(database);
    saveCriticalBackupSync(database);

    return database;
'@

        if (-not [regex]::IsMatch($content, $pattern)) {
            Fail "Não encontrei o bloco final que cria o banco inicial."
        }

        $content = [regex]::Replace(
            $content,
            $pattern,
            $replacement,
            1
        )
    }

    # ============================================================
    # 5. Corrigir completamente create() e update()
    # ============================================================

    $pattern = '(?s)\s{2}async create\(entity, data = \{\}\) \{.*?\n\s{2}async delete\(entity, id\) \{'

    $replacement = @'
  async create(entity, data = {}) {
    await ensureLoaded();

    const timestamp = now();

    const record = {
      ...clone(data),
      id: data.id || makeId(entity),
      created_date: data.created_date || timestamp,
      updated_date: timestamp,
    };

    rows(entity).push(record);

    scheduleFlush();

    return clone(record);
  },

  async update(entity, id, data = {}) {
    await ensureLoaded();

    const collection = rows(entity);
    const index = collection.findIndex((row) => row.id === id);

    if (index < 0) {
      throw new Error(
        `${entity} não encontrado para atualização: ${id}`
      );
    }

    collection[index] = {
      ...collection[index],
      ...clone(data),
      id,
      updated_date: now(),
    };

    scheduleFlush();

    return clone(collection[index]);
  },

  async delete(entity, id) {
'@

    if (-not [regex]::IsMatch($content, $pattern)) {
        Fail "Não consegui localizar os métodos create() e update()."
    }

    $content = [regex]::Replace(
        $content,
        $pattern,
        "`n$replacement",
        1
    )

    # ============================================================
    # 6. Atualizar espelho completo em todo save
    # ============================================================

    if ($content -notmatch "lastSavedAt = envelope\.saved_at;\s*saveFullMirrorSync") {
        $old = @'
      lastSavedAt = envelope.saved_at;
      saveCriticalBackupSync(snapshot);
'@

        $new = @'
      lastSavedAt = envelope.saved_at;

      saveFullMirrorSync(snapshot);
      saveCriticalBackupSync(snapshot);
'@

        if (-not $content.Contains($old)) {
            Fail "Não encontrei a atualização do backup no flushNow()."
        }

        $content = $content.Replace($old, $new)
    }

    # ============================================================
    # 7. Confirmar o save relendo o IndexedDB
    # ============================================================

    if ($content -notmatch "Falha na verificação após gravar o save") {
        $old = @'
      await idbCommit(envelope);
      lastSavedAt = envelope.saved_at;
'@

        $new = @'
      await idbCommit(envelope);

      const persistedEnvelope = await idbGet(CURRENT_SLOT);
      const persistedDatabase = readEnvelope(persistedEnvelope);

      if (!persistedDatabase) {
        throw new Error(
          'Falha na verificação após gravar o save no IndexedDB.'
        );
      }

      lastSavedAt = envelope.saved_at;
'@

        if (-not $content.Contains($old)) {
            Fail "Não encontrei o commit dentro de flushNow()."
        }

        $content = $content.Replace($old, $new)
    }

    # ============================================================
    # 8. Mostrar erro de flush em vez de ignorá-lo
    # ============================================================

    $content = $content.Replace(
        "    flushNow().catch(() => {});",
@'
    flushNow().catch((error) => {
      console.error(
        '[Persistent Save] Falha no flush agendado.',
        error
      );
    });
'@
    )

    # ============================================================
    # 9. Gravar arquivo
    # ============================================================

    [System.IO.File]::WriteAllText(
        $target,
        $content,
        [System.Text.UTF8Encoding]::new($false)
    )

    # ============================================================
    # 10. Validar alterações
    # ============================================================

    $validation = Get-Content $target -Raw -Encoding UTF8

    $requiredMarkers = @(
        "FULL_MIRROR_KEY",
        "function saveFullMirrorSync",
        "function loadFullMirror",
        "restaurando o espelho completo",
        "criação automática de outro personagem foi bloqueada",
        "Falha na verificação após gravar o save",
        "não encontrado para atualização"
    )

    foreach ($marker in $requiredMarkers) {
        if ($validation -notmatch [regex]::Escape($marker)) {
            Fail "Validação falhou: $marker"
        }
    }

    Write-Host ""
    Write-Host "HOTFIX APLICADO COM SUCESSO" -ForegroundColor Green
    Write-Host ""
    Write-Host "Arquivo atualizado:" -ForegroundColor Cyan
    Write-Host $target
    Write-Host ""
    Write-Host "Backup original:" -ForegroundColor Cyan
    Write-Host $backupDir
    Write-Host ""
    Write-Host "Próximo comando:" -ForegroundColor Yellow
    Write-Host "npm run dev" -ForegroundColor White
    Write-Host ""

    Read-Host "Pressione Enter para fechar"
}
catch {
    Fail $_.Exception.Message
}