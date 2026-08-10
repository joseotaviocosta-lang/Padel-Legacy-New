import { localGame } from '@/api/localGameClient.js';
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

export async function ensureWeeklyStaffMeeting(profile, staff = [], context = {}) {
  if (!profile?.id) return null;
  const meeting = buildStaffMeeting(profile, staff, context);
  const contextKey = `staff-weekly-meeting:${meeting.week}`;
  const rows = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }, '-created_date', 200).catch(() => []);
  if ((rows || []).some((row) => row.metadata?.context_key === contextKey)) return null;
  const content = meeting.notes.map((note) => `${note.role} — ${note.text}`).join('\n\n');
  return localGame.entities.CareerMessage.create({
    profile_id: profile.id,
    message_type: 'reuniao_comissao', sender_type: 'treinador', sender_name: profile.coach_name || 'Comissão técnica',
    title: 'Reunião semanal da comissão', content, status: 'nao_lida', priority: meeting.moral < 45 ? 'alta' : 'normal', career_date: profile.career_date,
    is_read: false, is_new: true, related_entity_type: 'staff', destination: { type: 'STAFF', route: '/staff' },
    actions: [{ id: 'open_training_plan', label: 'Revisar planejamento', route: '/game/training' }],
    metadata: { context_key: contextKey, meeting_week: meeting.week, synergy: meeting.synergy, moral: meeting.moral, proposed_plan: meeting.plan.plan },
  }).catch(() => null);
}
