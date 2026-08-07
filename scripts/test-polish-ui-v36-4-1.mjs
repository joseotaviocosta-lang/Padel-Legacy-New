import { isAtLeastBetaOrRC } from './release-version-utils.mjs';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks.push(name);
};

const modal = read('src/components/design-system/ModalShell.jsx');
const css = read('src/index.css');
const index = read('src/components/design-system/index.js');
const pkg = JSON.parse(read('package.json'));

expect('Modal usa Portal', modal.includes('createPortal'));
expect('Modal restaura foco', modal.includes('previousFocusRef'));
expect('Modal trava e restaura scroll', modal.includes("document.body.style.overflow = 'hidden'"));
expect('Modal respeita viewport dinâmica', modal.includes('100dvh'));
expect('Feedback global exportado', index.includes("./ActionFeedback"));
expect('Moldura de ícones exportada', index.includes("./IconFrame"));
expect('CSS possui sistema de modal', css.includes('.pl-modal-panel'));
expect('CSS protege overflow horizontal', css.includes('.pl-no-horizontal-overflow'));
expect('CSS possui ações fixas seguras', css.includes('.pl-sticky-actions'));
expect('Script registrado', pkg.scripts?.['test:polish-ui-v36']);
expect('Versão atualizada', isAtLeastBetaOrRC(pkg.version, 36));

console.log(`PolishUIV36_4_1Test: PASS (${checks.length}/${checks.length})`);
