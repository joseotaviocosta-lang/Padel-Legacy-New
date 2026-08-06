import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['motor de som', read('src/lib/uiSound.js').includes('playUiSound')],
  ['preferências persistentes', read('src/lib/uiSound.js').includes('padel:ui-sound-preferences')],
  ['controlador global', read('src/components/system/FeedbackSoundController.jsx').includes('padel:ui-feedback-sound')],
  ['toast integrado', read('src/components/ui/use-toast.jsx').includes('emitUiSound')],
  ['controle no HUD', read('src/components/career/CareerHud.jsx').includes('Desativar sons da interface')],
  ['layout integrado', read('src/components/AppLayout.jsx').includes('<FeedbackSoundController />')],
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('SoundFeedbackV36_4_4Test: FAIL', failed.map(([name]) => name));
  process.exit(1);
}
console.log(`SoundFeedbackV36_4_4Test: PASS (${checks.length}/${checks.length})`);
