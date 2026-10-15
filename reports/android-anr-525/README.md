# Playthrough 5.25 — ANR Android: evidência e harnesses

Aparelho: Xiaomi Redmi 12 (23053RN02A), Android 15, WebView Chrome 153.
Save real do playtest: 3,2 MB (1,5 MB só de AthleteProfile).

## Causa do ANR (prova)

`anr-*.txt` em `evidence-before/` (ANR real do playtest, 17:04:37) e em
`repro-before-anr/` (ANR reproduzido, 17:59:44):

- `main`: `onPageFinished`/`shouldOverrideUrlLoading` → `Mutex::lock_contended`
  (lock `plugins` do Tauri);
- `JavaBridge` (IPC): `Ipc.postMessage` → `AppManager::extend_api` (segura o
  lock `plugins`) → `tauri_plugin_fs::commands::exists` (comando SÍNCRONO) →
  `resolve_path` → `run_mobile_plugin::<PathResponse>` → `recv()` (espera a
  main thread);
- deadlock → `Input dispatching timed out` (10 s).

Correção: `src-tauri/src/storage.rs` (comandos async do app, AppData
resolvido uma vez) + `src/storage/TauriStorage.js`.

## Harnesses

Requisitos: aparelho com depuração USB; para perfil de JS, o APK de
diagnóstico (`npm run android:build -- --apk --target aarch64 --features diag`,
release + inspetor do WebView, mesma assinatura — instala por cima sem perder
dados).

| Script | O que mede |
|---|---|
| `scripts/android-anr-evidence-v525.mjs <label>` | ANRs já ocorridos (DropBox `data_app_anr`), stack da main thread, eventos `am_anr`, meminfo |
| `scripts/android-anr-repro-v525.mjs <label> --mode=plugin\|app` | reprodução determinística: comandos de arquivo em sequência + reload de página; verifica resposta do WebView e ANR novo |
| `scripts/android-profile-v525.mjs <label> [--rounds=2] [--advance=N --sandbox]` | save (bytes, IPC, parse, stringify, clone), navegação SPA (render útil, long tasks, CPU), avanço de dia numa CÓPIA da carreira (restaurada ao final), memória, gfxinfo, logcat |
| `scripts/android-ipc-trace-v525.mjs <rota>` | comandos IPC (cmd, duração, tamanho) disparados por uma navegação |

## Resultados (pastas)

- `before/`, `before-advance/`: build antigo (plugin-fs).
- `after/`: storage do app (deadlock removido + payload em string).
- `after-final/`, `final/`, `final2/`: + redução de clones do save.
- `repro-before/` (travou no 1º ciclo → ANR), `repro-after/`, `repro-final/` (15/15 respondendo, 0 ANR).
