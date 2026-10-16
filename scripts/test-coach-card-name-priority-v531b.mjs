// Hotfix 5.31-B — NOME > OVR > SELOS no card de técnico. Caso do Redmi 12:
// "Caio Silva" + RECOMENDADO + MELHOR CUSTO-BENEFÍCIO + OVR 44 — no APK 9006
// o nome ficava com 0px em 360 (sumia) e 24px em 390 ("C…").
import { PROFILE } from './lib/v531UiKit.mjs';
import { audit, gateRunner, read, repro, textOf, withUi } from './lib/v531bKit.mjs';

const { gate, finish } = gateRunner('test-coach-card-name-priority-v531b');
const src = read('src/components/coaches/CoachCard.jsx');

await withUi({ card: '/src/components/coaches/CoachCard.jsx', coaches: '/src/lib/coaches.js' }, async ({ card, coaches, render }) => {
  const caio = coaches.COACHES_DATA.find((c) => c.name === 'Caio Silva');
  gate('0. cenário real: "Caio Silva" existe no catálogo', Boolean(caio));
  const evaluation = { ...coaches.evaluateCoachForCareer(caio, { ...PROFILE, career_level: 1 }), overall: 44, recommended: true, bestValue: true };
  const html = render(card.default, { evaluation, profile: PROFILE, onDetails() {}, onHire() {} });
  const nameAt = html.indexOf('data-coach-name'); const badgesAt = html.indexOf('data-coach-badges'); const ovrAt = html.indexOf('data-coach-ovr');
  gate('1. ordem: nome (linha 1) → selos (linha 2) → especialidade', nameAt > -1 && badgesAt > nameAt && /Caio Silva/.test(textOf(html.slice(nameAt, badgesAt))));
  gate('2. o nome não divide a linha com selos (selos ficam fora do <h3>)', !textOf(html.slice(nameAt, html.indexOf('</h3>', nameAt))).match(/Recomendado|custo/i));
  gate('3. OVR à direita com largura previsível (w-10 shrink-0) e valor 44', ovrAt > -1 && html.slice(ovrAt - 80, ovrAt).includes('w-10 shrink-0') && /44 OVR/.test(textOf(html.slice(ovrAt))));
});
gate('4. nome usa o espaço livre e só corta como último recurso (2 linhas, sem truncate)', /<h3 className="line-clamp-2 break-words[^"]*" data-coach-name>/.test(src) && !/<h3 className="truncate/.test(src));
gate('5. coluna do nome pode encolher sem empurrar o OVR (min-w-0 flex-1)', src.includes('<div className="min-w-0 flex-1">'));

const r = repro();
if (!r) { gate('reprodução com CSS real presente (tools/coach-card-repro.mjs)', false); finish(); }
for (const vw of ['360', '390']) {
  gate(`6. ${vw}px ANTES (9006): o nome de "Caio Silva" ficava cortado (${r[vw]['caio-2-badges'].before.nameWidth}px)`, r[vw]['caio-2-badges'].before.nameTruncated && r[vw]['caio-2-badges'].before.nameWidth < 30);
  gate(`7. ${vw}px DEPOIS: nome inteiro, com espaço (${r[vw]['caio-2-badges'].after.nameWidth}px)`, !r[vw]['caio-2-badges'].after.nameTruncated && r[vw]['caio-2-badges'].after.nameWidth >= 150);
  gate(`8. ${vw}px DEPOIS: nome longo também inteiro (até 2 linhas)`, !r[vw]['nome-longo'].after.nameTruncated);
  gate(`9. ${vw}px DEPOIS: OVR legível e com a mesma largura (${r[vw]['caio-2-badges'].after.ovrWidth}px)`, r[vw]['caio-2-badges'].after.ovr === '44' && r[vw]['caio-2-badges'].after.ovrWidth === r[vw]['sem-badge'].after.ovrWidth);
}
const after = audit('after');
if (after) {
  const cards = after.results.flatMap((x) => x.coachCards || []);
  gate(`10. app real: ${cards.length} cards de técnico medidos, nenhum nome truncado`, cards.length >= 20 && cards.every((c) => !c.nameTruncated));
}
finish();
