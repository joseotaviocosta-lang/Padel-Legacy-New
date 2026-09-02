// Fase 0.3, item 3 — prova de que a extração de src/lib/hashUtils.js não
// muda comportamento. Duas partes:
//   1) confirma que a forma do laço (for-of vs. indexado por code unit,
//      as duas formas que existiam espalhadas nos 29 arquivos duplicados)
//      produz o MESMO hash pra uma bateria de strings reais do jogo (ids,
//      datas, chaves de mês, nomes com acento);
//   2) chama fnv1aHash() de verdade (o módulo extraído) e confere contra
//      uma reimplementação independente da fórmula original, pra pegar
//      qualquer erro de transcrição na extração.
import { fnv1aHash } from '../src/lib/hashUtils.js';

function referenceForOf(text) {
  let value = 2166136261;
  for (const char of String(text ?? '')) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}
function referenceIndexed(text) {
  const str = String(text ?? '');
  let value = 2166136261;
  for (let i = 0; i < str.length; i += 1) { value ^= str.charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

const samples = [
  '', 'a', 'athlete-arturo-coello', 'athleteprofile-1788201827554-qfpyj6',
  '2026-01', '2026-01:3:athleteprofile-1788201827554-qfpyj6',
  'tournament-2028-sha-pla-w10-2', 'Fran Guerrero', 'Íñigo Jofre', 'Álex Arroyo',
  'São Paulo', 'renew', 'breakup', 'weak-pair', '2026-06-15', 'coach-generatedNumber-seed-99',
  'a'.repeat(500), '2026-12:7:athleteprofile-1788201827999-zzzzzz',
];

let failures = 0;
for (const s of samples) {
  const forOf = referenceForOf(s);
  const indexed = referenceIndexed(s);
  const extracted = fnv1aHash(s);
  if (forOf !== indexed) { failures += 1; console.log(`FAIL (forma do laço diverge) "${s}": for-of=${forOf} indexado=${indexed}`); continue; }
  if (extracted !== indexed) { failures += 1; console.log(`FAIL (fnv1aHash extraído diverge da referência) "${s}": extraído=${extracted} referência=${indexed}`); }
}

if (failures === 0) {
  console.log(`PASS — ${samples.length} amostras: for-of, indexado e fnv1aHash() extraído produzem hash idêntico em todos os casos.`);
} else {
  console.log(`FAIL — ${failures} divergência(s) encontrada(s).`);
}
process.exitCode = failures === 0 ? 0 : 1;
