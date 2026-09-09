// Fase 5.1 — trocado de import ESM direto (`node` puro) pro mesmo padrão
// já usado por scripts/audit-real-athletes-simulation.mjs:
// `vite.ssrLoadModule` num servidor Vite em modo middleware. O import
// direto quebrava, silenciosamente pro resto da suíte (test:beta compõe
// este teste), toda vez que QUALQUER módulo alcançado transitivamente por
// MatchIntegrityTest.js usasse o alias `@/` (só o Vite resolve) — o motor
// de partida inteiro (337 arquivos em src/ usam `@/`) está nesse caminho,
// então isolar arquivo por arquivo não escala. `random.js`/
// `PersonalityModel.js` já foram corrigidos pra import relativo nesta
// mesma fase (dependências mínimas, sem razão pra usar o alias), mas o
// próximo arquivo que a árvore do motor tocar com um `@/` importaria
// quebraria de novo — corrigir o RUNNER, não perseguir arquivos, resolve a
// classe inteira do problema de uma vez.
const { createServer } = await import('vite');
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  // Sem isto, o scanner de optimizeDeps do Vite tenta indexar index.html
  // (app do navegador) em segundo plano mesmo em modo middleware puro
  // ssrLoadModule — e tromba nos milhares de .html gerados em
  // src-tauri/target/**/tauri-codegen-assets, travando com erro do esbuild
  // (assíncrono, depois do teste já ter passado — não derruba o exit code,
  // mas suja a saída). Não precisamos de pré-bundle de dependência nenhuma
  // aqui, só carregar módulos SSR.
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { runMatchIntegrityTest } = await vite.ssrLoadModule('/src/engine/match/MatchIntegrityTest.js');
  const result = await runMatchIntegrityTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  await vite.close();
}
