import fs from 'node:fs';
const file = fs.readFileSync('src/components/system/BetaTools.jsx', 'utf8');
const checks = [
  ['modal usa altura segura da viewport', file.includes('h-[calc(100dvh-0.75rem)]')],
  ['modal bloqueia overflow externo', file.includes('overflow-hidden bg-black/65')],
  ['container flex permite encolhimento', file.includes('min-h-0 w-full max-w-2xl')],
  ['conteúdo possui rolagem interna', file.includes('min-h-0 flex-1 overflow-y-auto overscroll-contain')],
  ['cabeçalho não rola para fora', file.includes('flex shrink-0 items-start')],
  ['tecla Escape fecha a janela', file.includes("event.key === 'Escape'")],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
if (failed.length) process.exit(1);
console.log(`HotfixBetaModalV35_5_1Test: PASS (${checks.length}/${checks.length})`);
