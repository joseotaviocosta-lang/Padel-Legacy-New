mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        // Playthrough 5.25 — storage do save por comandos async do app (ver
        // storage.rs): os comandos síncronos do plugin-fs causavam o deadlock
        // que gerava ANR no Android.
        .invoke_handler(tauri::generate_handler![
            storage::storage_read_text,
            storage::storage_write_text,
            storage::storage_exists,
            storage::storage_remove,
            storage::storage_copy,
            storage::storage_rename,
            storage::storage_list,
            storage::storage_mkdir,
            storage::storage_stat,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar o Padel Legacy");
}
