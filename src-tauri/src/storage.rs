// Playthrough 5.25 — STORAGE DO SAVE SEM DEADLOCK NO ANDROID.
//
// ANR real capturado no aparelho (Redmi 12, Android 15, APK 0.9.0/9000):
// a main thread do Android ficou presa em `Mutex::lock_contended` dentro de
// `WebviewManager::prepare_pending_webview::{closure#3}` (onPageFinished) e
// o event loop do Tauri preso no mesmo `manager.plugins.lock()`.
//
// Cadeia (Tauri 2.11.5 + tauri-plugin-fs 2.5.1):
//  1. comandos SÍNCRONOS do plugin-fs (exists/rename/remove/stat/mkdir) são
//     despachados por `AppManager::extend_api`, que roda o handler INTEIRO
//     segurando o lock global `plugins`;
//  2. com `baseDir: AppData`, cada um desses comandos chama
//     `app_data_dir()` → `run_mobile_plugin("getDataDir")` →
//     `run_on_android_context`: posta na main thread do Android e BLOQUEIA
//     esperando a resposta — a cada chamada, sem cache;
//  3. se a main thread está em `onPageLoaded` (abertura do app, reload de
//     página), ela tenta o mesmo lock `plugins` → ninguém avança → ANR.
// O passo 2 também custava uma ida-e-volta à main thread por operação de
// arquivo (uma escrita atômica do save faz várias).
//
// Estes comandos são do APP (não passam por `extend_api`, logo não tocam o
// lock `plugins`), são `async` (rodam no runtime, nunca na main thread) e
// resolvem o diretório de dados UMA vez (OnceLock). O contrato de caminho é o
// mesmo do TauriStorage.js: relativo a AppData, sem traversal.
//
// Conteúdo trafega como STRING, não bytes: no Android o IPC do Tauri é sempre
// `window.ipc.postMessage` com JSON.stringify do payload, e um Uint8Array vira
// `Array.from(bytes)` — o save de 2,9MB virava um array JSON de ~2,9 milhões
// de números (~10MB de texto) montado na main thread do JS a cada gravação
// e a cada leitura. Medido no aparelho: long tasks de 2,7-3,4s em
// `processIpcMessage`. Uma string JSON do mesmo save serializa nativamente.
// Na LEITURA a resposta volta em bytes crus (tauri::ipc::Response): o caminho
// de resposta no Android é rápido (medido: ~100ms para 3,2MB contra ~370ms
// como string JSON); o caminho lento é só o de ENVIO.
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

use serde::Serialize;

use tauri::ipc::Response;
use tauri::{AppHandle, Manager, Runtime};

static BASE_DIR: OnceLock<PathBuf> = OnceLock::new();

fn base_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(dir) = BASE_DIR.get() {
        return Ok(dir.clone());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _ = BASE_DIR.set(dir.clone());
    Ok(dir)
}

fn resolve<R: Runtime>(app: &AppHandle<R>, relative: &str) -> Result<PathBuf, String> {
    let normalized = relative.replace('\\', "/");
    let mut out = base_dir(app)?;
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err(format!("Caminho inválido para o armazenamento: {relative}")),
        }
    }
    Ok(out)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> std::io::Result<T> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    name: String,
    is_file: bool,
    is_directory: bool,
    is_symlink: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStat {
    size: u64,
    is_file: bool,
    is_directory: bool,
    mtime: Option<u64>,
}

#[tauri::command]
pub async fn storage_read_text<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Response, String> {
    let target = resolve(&app, &path)?;
    let bytes = blocking(move || std::fs::read(target)).await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn storage_write_text<R: Runtime>(app: AppHandle<R>, path: String, content: String) -> Result<(), String> {
    let target = resolve(&app, &path)?;
    blocking(move || {
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(target, content.as_bytes())
    })
    .await
}

#[tauri::command]
pub async fn storage_exists<R: Runtime>(app: AppHandle<R>, path: String) -> Result<bool, String> {
    let target = resolve(&app, &path)?;
    blocking(move || Ok(target.exists())).await
}

#[tauri::command]
pub async fn storage_remove<R: Runtime>(app: AppHandle<R>, path: String, recursive: Option<bool>) -> Result<(), String> {
    let target = resolve(&app, &path)?;
    blocking(move || {
        if target.is_dir() {
            if recursive.unwrap_or(false) { std::fs::remove_dir_all(target) } else { std::fs::remove_dir(target) }
        } else {
            std::fs::remove_file(target)
        }
    })
    .await
}

#[tauri::command]
pub async fn storage_copy<R: Runtime>(app: AppHandle<R>, from: String, to: String) -> Result<(), String> {
    let source = resolve(&app, &from)?;
    let destination = resolve(&app, &to)?;
    blocking(move || {
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(source, destination).map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn storage_rename<R: Runtime>(app: AppHandle<R>, from: String, to: String) -> Result<(), String> {
    let source = resolve(&app, &from)?;
    let destination = resolve(&app, &to)?;
    blocking(move || {
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::rename(source, destination)
    })
    .await
}

#[tauri::command]
pub async fn storage_list<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Vec<StorageEntry>, String> {
    let target = resolve(&app, &path)?;
    blocking(move || {
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(target)? {
            let entry = entry?;
            let file_type = entry.file_type()?;
            entries.push(StorageEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                is_file: file_type.is_file(),
                is_directory: file_type.is_dir(),
                is_symlink: file_type.is_symlink(),
            });
        }
        Ok(entries)
    })
    .await
}

#[tauri::command]
pub async fn storage_mkdir<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let target = resolve(&app, &path)?;
    blocking(move || std::fs::create_dir_all(target)).await
}

#[tauri::command]
pub async fn storage_stat<R: Runtime>(app: AppHandle<R>, path: String) -> Result<StorageStat, String> {
    let target = resolve(&app, &path)?;
    blocking(move || {
        let meta = std::fs::metadata(target)?;
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        Ok(StorageStat { size: meta.len(), is_file: meta.is_file(), is_directory: meta.is_dir(), mtime })
    })
    .await
}
