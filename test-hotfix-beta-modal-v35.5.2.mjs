import fs from 'node:fs';
const file = fs.readFileSync('src/components/system/BetaTools.jsx', 'utf8');
const checks = [
  ["import { createPortal } from 'react-dom'", 'React Portal importado'],
  ["createPortal((", 'modal usa createPortal'],
  ['document.body', 'modal montado no body'],
  ['z-[9999]', 'z-index global protegido'],
  ["event.key === 'Escape'", 'tecla Esc preservada'],
  ["document.body.style.overflow = 'hidden'", 'rolagem de fundo bloqueada'],
];
for (const [needle, label] of checks) {
  if (!file.includes(needle)) throw new Error(`Falhou: ${label}`);
}
console.log(`HotfixBetaModalV35_5_2Test: PASS (${checks.length}/${checks.length})`);
