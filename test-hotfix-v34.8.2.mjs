import fs from 'node:fs';
const file = 'src/pages/Communications.jsx';
const source = fs.readFileSync(file, 'utf8');
if (!source.includes('{agent && <Surface className="p-4">')) throw new Error('Bloco condicional do empresário não encontrado.');
if (!source.includes('</Surface>}')) throw new Error('Fechamento do bloco condicional do empresário ausente.');
console.log('HotfixV34_8_2Test: PASS');
