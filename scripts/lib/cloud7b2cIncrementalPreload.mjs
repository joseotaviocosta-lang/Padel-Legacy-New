// CLOUD-7B2C — `node --import ./scripts/lib/cloud7b2cIncrementalPreload.mjs <suíte>` reexecuta uma suíte com a
// compactação INCREMENTAL experimental LIGADA (padrão de produção: desligada).
globalThis.__PADEL_INCREMENTAL_COMPACTION__ = true;
