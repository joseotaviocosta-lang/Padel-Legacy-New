// Playthrough 5.24-B, Parte B — "SUA DUPLA NA RACE" legível.
//
// Causa: o eyebrow e o badge usavam `text-secondary`, mas `--secondary` é um
// token de SUPERFÍCIE (228 25% 14%, quase preto). Sobre o card escuro o texto
// ficava ~1.2:1. Correção só de apresentação: tokens de texto reais.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const raceDoubles = source.match(/function RaceDoublesCard[\s\S]*?\n\}/)[0];
const raceIndividual = source.match(/function RaceIndividualCard[\s\S]*?\n\}/)[0];

// 1. Premissa da causa: --secondary é escuro (lightness < 25%).
const secondary = css.match(/--secondary:\s*\d+\s+\d+%\s+(\d+)%/);
assert.ok(secondary && Number(secondary[1]) < 25, '--secondary deveria ser token de superfície escuro');

// 2. Eyebrow com o MESMO token dos outros eyebrows ("Sua dupla", "Sua posição mundial").
assert.match(raceDoubles, /text-muted-foreground">Sua dupla na Race</, 'eyebrow deve usar text-muted-foreground');
assert.match(source, /text-muted-foreground">Sua dupla</, 'referência: eyebrow do Mundial → Duplas');
assert.match(source, /text-muted-foreground">Sua posição mundial</, 'referência: eyebrow do Mundial → Individual');

// 3. Nenhum TEXTO dos cards da Race em text-secondary (badge incluído).
assert.doesNotMatch(raceDoubles, /\btext-secondary\b/, 'RaceDoublesCard não pode usar text-secondary como cor de texto');
assert.doesNotMatch(raceIndividual, /\btext-secondary\b/, 'RaceIndividualCard não pode usar text-secondary como cor de texto');

// 4. Hierarquia: nome da dupla continua mais forte que o eyebrow.
assert.match(raceDoubles, /<h3 className="[^"]*text-lg font-black text-foreground/, 'nome da dupla segue como destaque');

// 5. Autoridade intacta (só apresentação mudou).
for (const token of ['racePairRank.points', 'playerRacePoints', 'partnerRacePoints', 'Total']) {
  assert.ok(raceDoubles.includes(token), `RaceDoublesCard deve manter ${token}`);
}

// 6. Contraste MEDIDO no navegador (gerado por generate-mobile-recovery-screenshots-v524b.mjs).
const evidenceFile = new URL('../reports/screenshots-524b/evidence.json', import.meta.url);
if (existsSync(evidenceFile)) {
  const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  for (const vp of ['360', '390', 'desktop']) {
    const c = evidence[vp]?.contrast;
    assert.ok(c?.eyebrow, `contraste do eyebrow medido em ${vp}`);
    assert.ok(c.eyebrow.ratio >= 4.5, `eyebrow ${vp}: ${c.eyebrow.ratio}:1 < 4.5:1 (WCAG AA)`);
    assert.ok(c.badgeRatio?.ratio >= 4.5, `badge ${vp}: ${c.badgeRatio?.ratio}:1 < 4.5:1`);
  }
  console.log(`   contraste medido: eyebrow ${evidence['360'].contrast.eyebrow.ratio}:1 · badge ${evidence['360'].contrast.badgeRatio.ratio}:1`);
} else {
  console.log('   (evidence.json ausente — rode generate-mobile-recovery-screenshots-v524b.mjs para o gate medido)');
}

console.log('test-ranking-race-doubles-contrast-v524b: PASS');
