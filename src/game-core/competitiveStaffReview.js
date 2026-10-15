import { localGame } from '@/api/localGameClient.js';
import { upsertCareerMessage, buildStableMessageId } from '@/lib/careerCommunications.js';
import { getActivePartnership } from '@/lib/partnershipSystem.js';
import {
  buildCompetitiveWeeklyDecision,
  resolveCompetitiveDecisionCta,
  COMPETITIVE_DECISION_STATES,
} from '@/lib/competitiveWeeklyDecision.js';

// Playthrough 5.14, Partes B/C/M/Q/R — a REUNIÃO COMPETITIVA semanal da
// comissão técnica.
//
// Divisão de responsabilidades (princípio da fase):
//   FEDERAÇÃO  — prazo: inscrições abertas, D-7, D-5, D-4, sorteio, chave.
//   COMISSÃO   — decisão: qual torneio disputar, por quê, o que evitar.
//
// Antes desta fase a comissão só mandava relatório de folha/moral
// (`staff-weekly-report`), e a decisão competitiva vivia apenas como estado
// de tela no CareerHub. Na prática o jogador se inscrevia porque a
// Federação avisou do PRAZO, não porque a comissão ajudou a PLANEJAR.
//
// Esta autoridade não escolhe nada por conta própria: consome a projeção
// única (`buildCompetitiveWeeklyDecision`), a mesma que o CareerHub lê.

export const COMPETITIVE_REVIEW_PREFIX = 'staff-competitive-review';

export function competitiveReviewContextKey(week) {
  return `${COMPETITIVE_REVIEW_PREFIX}:${week}`;
}

// Playthrough 5.14 (continuação), Partes B/C — semana ISO-8601 de verdade.
//
// A versão anterior usava `ceil((diasDoAno + diaDaSemanaDe1Jan + 1) / 7)`,
// que NÃO respeita a fronteira semanal: medido no save real, 2026-01-19
// (segunda) caía em W04 e 2026-01-25 (domingo da MESMA semana) caía em W05
// — então a reunião era recriada no meio da semana, com outra chave. É
// metade do "reunião repetida" do playtest.
//
// ISO-8601: a semana começa na SEGUNDA e a semana 1 é a que contém a
// primeira quinta-feira do ano. O ano da chave é o ano ISO, não o civil —
// sem isso a virada de dezembro/janeiro produziria duas chaves para a
// mesma semana.
export function competitiveWeekKey(date) {
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(date || '');
  const target = new Date(parsed.getTime());
  // Desloca para a quinta-feira da mesma semana ISO (dia 4, com domingo=7).
  const dayNumber = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDayNumber);
  const week = 1 + Math.round((target - firstThursday) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function formatAlternative(item) {
  const bits = [item.name];
  if (item.tier) bits.push(`(${item.tier})`);
  if (item.why) bits.push(`— ${item.why}`);
  return bits.join(' ');
}

function buildBody(decision) {
  if (decision.state === COMPETITIVE_DECISION_STATES.NO_EVENT) {
    return decision.reason || 'Nenhuma competição recomendada nesta semana.';
  }
  const target = decision.recommended || decision.committed;
  const lines = [];
  if (decision.state === COMPETITIVE_DECISION_STATES.COMMITTED) {
    lines.push(`Compromisso confirmado: ${target.name}.`);
    if (target.startDate) lines.push(`Estreia em ${target.startDate}.`);
    if (target.drawDate) lines.push(`Sorteio previsto para ${target.drawDate}.`);
  } else {
    lines.push(`Recomendamos ${target.name}${target.tier ? ` (${target.tier})` : ''}.`);
    if (decision.rationale.length) lines.push(decision.rationale.join(' '));
    if (decision.deadline) lines.push(`Inscrição até ${decision.deadline}.`);
  }
  return lines.join(' ');
}

/**
 * Cria — no máximo uma vez por semana — a reunião competitiva da comissão.
 *
 * Parte C: UMA mensagem por semana competitiva. Os avisos de prazo seguem
 * sendo da Federação; a comissão não duplica D-7/D-5/D-4.
 *
 * Parte R: idempotente por `staff-competitive-review:<semana>`. Avançar o
 * mesmo dia, recarregar ou reprocessar a semana não cria uma segunda.
 */
export async function ensureWeeklyCompetitiveStaffReview(profile, currentDate) {
  if (!profile?.id || !currentDate) return { created: false, reason: 'invalid-input' };
  const week = competitiveWeekKey(currentDate);
  const contextKey = competitiveReviewContextKey(week);

  try {
    const [tournaments, registrations, calendarEvents, partnership] = await Promise.all([
      localGame.entities.Tournament.list('start_date', 3000).catch(() => []),
      localGame.entities.TournamentRegistration.filter({ profile_id: profile.id }).catch(() => []),
      localGame.entities.CalendarEvent.filter({ profile_id: profile.id }).catch(() => []),
      getActivePartnership(profile.id).catch(() => null),
    ]);

    let partner = null;
    if (partnership?.partner_bot_id) {
      partner = await localGame.entities.AthleteProfile.get(partnership.partner_bot_id).catch(() => null);
    }

    const decision = buildCompetitiveWeeklyDecision(
      { ...profile, career_date: currentDate },
      {
        tournaments: tournaments || [],
        registrations: registrations || [],
        calendarEvents: calendarEvents || [],
        teamRank: Number(profile.world_ranking ?? profile.ranking_position) || 0,
        partner,
        partnership,
      },
    );

    const target = decision.recommended || decision.committed;
    const cta = resolveCompetitiveDecisionCta(decision);

    // Parte U — distinguir PLANEJAMENTO COMPETITIVO de desenvolvimento
    // interno da comissão: título e categoria próprios, nunca "sua equipe
    // pede atenção".
    const subject = decision.state === COMPETITIVE_DECISION_STATES.COMMITTED
      ? `Compromisso confirmado — ${target.name}`
      : decision.state === COMPETITIVE_DECISION_STATES.NO_EVENT
        ? 'Semana sem competição recomendada'
        : `Reunião da comissão — ${target.name}`;

    const body = buildBody(decision);

    // Playthrough 5.14 (continuação), Partes D/F — a segunda metade do
    // "reunião repetida todo dia".
    //
    // `upsertCareerMessage` grava por id estável, então a LINHA nunca
    // duplicava — mas ele reescreve `career_date` e força
    // `is_read:false, is_new:true` a cada chamada. Como a autoridade roda no
    // tick diário, a mesma reunião voltava ao topo da Central marcada como
    // nova todos os dias: medido 6 de 6 dias, com a data avançando
    // 19→20→21→...  Para o jogador, isso é indistinguível de uma mensagem
    // nova por dia.
    //
    // Agora a mensagem só é reescrita quando há mudança SUBSTANTIVA de
    // estado (recomendação → compromisso → sorteada, ou troca do torneio
    // recomendado). Reexecuções triviais não tocam na linha: nada de
    // ressurgir como não lida, nada de renumerar a data. Quando a mudança é
    // real, a reescrita volta a marcar como não lida — que é o
    // comportamento desejado para "seu compromisso mudou de estado".
    const signature = [
      decision.state,
      target?.id || 'none',
      cta?.id || 'none',
      target?.drawn ? 'drawn' : 'not-drawn',
    ].join('|');

    const messageId = buildStableMessageId(profile.id, contextKey);
    const existing = await localGame.entities.CareerMessage.get(messageId).catch(() => null);
    if (existing && existing.metadata?.decision_signature === signature) {
      return { created: false, unchanged: true, week, contextKey, decision, message: existing };
    }

    // Playthrough 5.16, Partes F/G/H — a outra metade do "compromisso vira
    // spam semanal".
    //
    // A guarda acima compara a assinatura dentro da MESMA semana, e o id da
    // mensagem vem de `staff-competitive-review:<semana>`. Quando a semana
    // virava, a chave mudava, `existing` voltava null e nascia uma mensagem
    // NOVA com assinatura idêntica — "Compromisso confirmado — Londres"
    // outra vez, sem nada ter mudado. A identidade era da SEMANA; o
    // compromisso, porém, atravessa semanas.
    //
    // Regra da Parte G: depois de inscrito, virar segunda-feira não é fato
    // competitivo. Só uma mudança SUBSTANTIVA fala de novo — e o que é
    // substantivo já está codificado na assinatura (estado, torneio, CTA,
    // sorteada). Se a última reunião competitiva emitida diz exatamente a
    // mesma coisa, a comissão fica em silêncio e a mensagem anterior segue
    // valendo na Central.
    const history = await localGame.entities.CareerMessage
      .filter({ profile_id: profile.id }, '-created_date', 120)
      .catch(() => []);
    const lastReview = (history || [])
      .filter((item) => item?.metadata?.competitive_review && item.metadata.decision_signature)
      .sort((a, b) => String(b.metadata.context_key || '').localeCompare(String(a.metadata.context_key || '')))[0] || null;
    if (lastReview && lastReview.metadata.decision_signature === signature) {
      return {
        created: false, unchanged: true, silenced: true, week, contextKey, decision, message: lastReview,
      };
    }

    const message = await upsertCareerMessage(profile.id, contextKey, {
      sender_name: profile.coach_name || 'Comissão técnica',
      sender_type: 'sistema',
      subject,
      title: subject,
      body,
      content: body,
      message_type: 'staff_competitive_review',
      notification_type: 'STAFF',
      destination: { type: 'STAFF', route: '/staff' },
      career_date: existing?.career_date || currentDate,
      priority: decision.state === COMPETITIVE_DECISION_STATES.DECISION ? 'alta' : 'normal',
      actions: cta ? [{ id: cta.id, label: cta.label }] : [],
      // Parte N — o deep link reaproveita o mecanismo da 5.13: a rota ganha
      // `?report=<context_key>` automaticamente em notificationDestinations.
      metadata: {
        competitive_review: true,
        decision_signature: signature,
        decision_state: decision.state,
        recommended_tournament_id: target?.id || null,
        recommended_tournament_name: target?.name || null,
        recommended_tier: target?.tier || null,
        deadline: decision.deadline || null,
        start_date: target?.startDate || null,
        cta_id: cta?.id || null,
        cta_label: cta?.label || null,
        recommendations: decision.rationale,
        alternatives: (decision.alternatives || []).map(formatAlternative),
        no_event_reason: decision.reason || null,
      },
    });

    return { created: true, week, contextKey, decision, message };
  } catch (error) {
    console.warn('[Comissão competitiva] reunião semanal não criada:', error);
    return { created: false, week, contextKey, error };
  }
}
