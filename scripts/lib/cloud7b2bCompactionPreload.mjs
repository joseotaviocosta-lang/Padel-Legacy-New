// CLOUD-7B2B — `node --import ./scripts/lib/cloud7b2bCompactionPreload.mjs <suíte>` reexecuta qualquer suíte de
// persistência com a gravação compacta de torneios finalizados LIGADA (padrão de produção: desligada).
globalThis.__PADEL_HISTORICAL_COMPACTION__ = true;
