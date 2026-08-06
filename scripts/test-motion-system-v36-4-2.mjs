import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['Motion component', read('src/components/design-system/Motion.jsx').includes('MotionReveal')],
  ['Animated numbers', read('src/components/design-system/Motion.jsx').includes('AnimatedNumber')],
  ['Change pulse', read('src/components/design-system/Motion.jsx').includes('ChangePulse')],
  ['Design exports', read('src/components/design-system/index.js').includes("from './Motion'")],
  ['Page transitions', read('src/components/design-system/Page.jsx').includes('pl-page-enter')],
  ['Modal transition', read('src/components/design-system/ModalShell.jsx').includes('pl-modal-enter')],
  ['Reduced motion', read('src/index.css').includes('prefers-reduced-motion: reduce')],
  ['Motion script', JSON.parse(read('package.json')).scripts['test:motion-v36']?.includes('test-motion-system-v36-4-2.mjs')],
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  process.exit(1);
}
console.log(`MotionSystemV36_4_2Test: PASS (${checks.length}/${checks.length})`);
