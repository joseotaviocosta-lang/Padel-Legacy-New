import { buildStrategicWeeklyPlan } from '@/lib/strategicCareerAI.js';

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, Number(v) || 0));
const active = (member) => member && member.status !== 'encerrado' && member.contract_status !== 'expired';

function weekKey(dateString) {
  const date = new Date(`${dateString || '2026-01-01'}T00:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

export function deriveStaffMood(member, profile = {}) {
  const base = Number(member?.satisfaction ?? 65);
  const form = Number(profile?.wins || 0) - Number(profile?.losses || 0);
  const contractPressure = member?.contract_end_date && new Date(member.contract_end_date) - new Date(`${profile.career_date}T00:00:00`) < 45 * 86400000 ? -8 : 0;
  const score = clamp(base + Math.max(-8, Math.min(8, form * 0.2)) + contractPressure);
  return { score: Math.round(score), label: score >= 82 ? 'Muito satisfeito' : score >= 68 ? 'Motivado' : score >= 50 ? 'Estável' : score >= 35 ? 'Preocupado' : 'Insatisfeito' };
}

export function buildStaffMeeting(profile, staff = [], context = {}) {
  const members = staff.filter(active);
  const energy = clamp(profile?.energy);
  const fatigue = clamp(profile?.fatigue);
  const plan = buildStrategicWeeklyPlan(profile, context);
  const notes = [{ role: 'Treinador principal', name: profile?.coach_name || 'Treinador', text: plan.reason }];
  for (const member of members) {
    const role = String(member.role_id || member.role_name || '').toLowerCase();
    let text = `${member.staff_name} acompanha a evolução dentro da sua especialidade.`;
    if (/physio|fisio/.test(role)) text = fatigue >= 65 ? `Fadiga em ${Math.round(fatigue)}%. Recomendo reduzir carga e priorizar prevenção.` : 'Sem sinais importantes de sobrecarga nesta semana.';
    else if (/physical|preparador|fitness/.test(role)) text = energy <= 35 ? `Energia em ${Math.round(energy)}%. A carga física deve ser leve.` : 'A condição permite manter uma sessão física moderada.';
    else if (/psych|psic/.test(role)) text = Number(profile?.confidence ?? 60) < 50 ? 'A confiança precisa de atenção após os resultados recentes.' : 'O estado mental está estável para a próxima etapa.';
    else if (/analyst|analista/.test(role)) text = context.nextTournament ? `Preparar análise para ${context.nextTournament.name}.` : 'Sem adversário imediato; foco em padrões da própria dupla.';
    else if (/nutrition|nutri/.test(role)) text = energy < 55 ? 'A recuperação energética deve ser prioridade nos próximos dias.' : 'Rotina de recuperação adequada para a carga atual.';
    notes.push({ role: member.role_name || 'Especialista', name: member.staff_name, text });
  }
  const moods = members.map((member) => ({ id: member.id, name: member.staff_name, role: member.role_name, ...deriveStaffMood(member, profile) }));
  const synergy = clamp(profile?.staff_synergy ?? profile?.team_synergy ?? (members.length ? 55 + members.length * 5 : 25));
  const moral = moods.length ? Math.round(moods.reduce((sum, item) => sum + item.score, 0) / moods.length) : clamp(profile?.coach_trust ?? 55);
  return { week: weekKey(profile?.career_date), notes, plan, moods, synergy: Math.round(synergy), moral: Math.round(moral), members: members.length };
}

// Onboarding 2.0 + Central de Notificações (docs/ONBOARDING_V3_COMMUNICATIONS.md):
// `ensureWeeklyStaffMeeting` foi removida daqui. Ela cobria basicamente a
// mesma informação passiva do "Relatório semanal da comissão"
// (staffLifecycle.js) — nenhuma decisão real distinguia as duas — e
// disparava no mount de Staff.jsx (toda visita à página), não no ciclo de
// vida do calendário, então cada visita repetida era uma nova chance de
// duplicar (leitura-depois-escrita sem chave estável). As duas mensagens
// foram mescladas numa só, gerada por `processStaffDay` (avanço de dia,
// com upsert por chave estável — nunca duplica). `buildStaffMeeting`
// continua aqui: Staff.jsx ainda a usa para o painel ao vivo da página, e
// `processStaffDay` agora a reaproveita para compor o conteúdo do relatório.
