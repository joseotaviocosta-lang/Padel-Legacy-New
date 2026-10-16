// Fase 5.31 — detalhe do treinador na ORDEM DA DECISÃO: pode contratar? →
// identidade → benefício principal → competências → por que combina → custo
// → CTA. O resto em "Perfil completo". O modal usa portal (ModalShell), que
// o SSR não monta: a estrutura é verificada no código e o resultado no app
// real (scripts/ui-audit-531.mjs).
import { gateRunner, measurements, pick, read } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-coach-detail-layout-v531');
const src = read('src/components/coaches/CoachDetail.jsx');
const order = ['data-coach-hire-state', 'MapPin', 'data-coach-main-benefit', 'data-coach-competencies', 'Por que combina com sua dupla', 'CoachComparison candidate', 'data-coach-cost', 'title="Perfil completo"'];
const positions = order.map((needle) => src.indexOf(needle, src.indexOf('data-coach-detail')));
gate('1. ordem: estado → identidade → benefício → competências → por que combina → comparação → custo → perfil', positions.every((p, i) => p > 0 && (i === 0 || p > positions[i - 1])), JSON.stringify(positions));
gate('2. benefício principal em destaque (2 maiores efeitos), resto em linha', src.includes('impact.highlights.slice(0, 2)') && src.includes('impact.highlights.slice(2)'));
gate('3. competências compactas: 5 linhas com barra fina, sem caixas', /grid-cols-\[4\.5rem_1fr_2rem\]/.test(src) && !src.includes('rounded-lg bg-secondary/30 p-2"><div className="flex justify-between'));
gate('4. "Por que combina" condensado (≤2 itens) e sem parágrafo "Importante:"', src.includes('compatibilityReasons.slice(0, 2)') && !src.includes('<strong>Importante:</strong>'));
gate('5. custo numa linha + alerta de orçamento (salaryShare) só como linha', src.includes('data-coach-cost') && src.includes('salaryShare'));
const visible = src.slice(src.indexOf('data-coach-detail'), src.indexOf('title="Perfil completo"'));
const onDemand = src.slice(src.indexOf('title="Perfil completo"'));
gate('6. filosofia/estilo/métodos/especializações/histórico/conquistas/bio só em "Perfil completo"', ['Filosofia', 'Estilo de comando', 'Métodos de treino', 'Especializações', 'Histórico', 'Conquistas', 'Biografia'].every((t) => onDemand.includes('>' + t + '<') && !visible.includes('>' + t + '<')));
gate('7. CTA no rodapé: "Contratar treinador" + custo na linha secundária (5.28)', src.includes('Contratar treinador') && src.includes("sublabel={hireCheck.allowed ? `${Number(evaluation.salary || 0).toLocaleString('pt-BR')}/mês"));
gate('8. bloqueado: o rodapé mostra o motivo; contratado: "Demitir treinador"', src.includes('{hireCheck.reason}') && src.includes('Demitir treinador'));
gate('9. mesmas fontes de verdade (impacto/efeitos/competências/comparação)', src.includes('getCoachImpactSummary(coach, profile)') && src.includes('getCoachEffects(coach, profile)') && src.includes('getCoachCompetencies(coach)') && src.includes('CoachComparison'));
gate('10. modal global (portal), sem overlay próprio', src.includes('<ModalShell') && !src.includes('fixed inset-0'));

const before = measurements('before'); const after = measurements('after');
if (before && after) {
  for (const vp of ['360', '390', 'desktop', 'landscape']) {
    const b = pick(before, { screen: 'coach-detail', viewport: vp, state: 'com-parceiro' });
    const a = pick(after, { screen: 'coach-detail', viewport: vp, state: 'com-parceiro' });
    if (!b || !a) continue;
    gate(`11. app real ${vp}: modal aberto, 1 primário, nada cortado`, a.modalOpen && a.modalPrimaryCount === 1 && a.modalClippedCount === 0);
    if (vp === '360' || vp === '390') gate(`12. app real ${vp}: conteúdo do modal mais curto (${b.modalScrollHeight} → ${a.modalScrollHeight}px)`, a.modalScrollHeight < b.modalScrollHeight * 0.6);
  }
}
finish();
