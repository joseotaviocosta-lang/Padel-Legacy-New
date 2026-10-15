// 200 carreiras novas independentes; o teste-base usa o seed canônico e
// alterna os primeiros eventos Bronze/Silver da pré-temporada competitiva.
process.env.PADEL_LOWRANK_TRIALS ||= '200';
await import('./test-player-low-rank-first-round-quality-v5.mjs');
