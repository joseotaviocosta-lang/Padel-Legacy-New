// 200 carreiras novas independentes, com distribuição por rodada (rank,
// OVR, Top50/100/300) no fluxo real de inscrição e montagem de chave.
process.env.PADEL_CAMPAIGNS ||= '200';
await import('./test-player-opponent-progression-v5.mjs');
