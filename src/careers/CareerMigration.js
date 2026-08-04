import { CAREER_INDEX_SCHEMA_VERSION, CAREER_SAVE_SCHEMA_VERSION } from './careerSchema.js';
import { normalizeCharacterCustomization } from '../lib/characterCustomization.js';
import { repairTournamentCollection } from '../lib/tournamentIntegrity.js';
import { normalizeTutorialState } from '../onboarding/tutorialState.js';
import { normalizeAthlete } from '../players/athleteSchema.js';
import { buildInitialProfile } from '../lib/initialCareerProfiles.js';
import { migrateTrainingReference } from '../lib/trainingCatalog.js';

function cloneDeep(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function migrateCareer(career) {
  const data = cloneDeep(career);
  const fromVersion = Number(data.save_schema_version ?? 1);
  const toVersion = CAREER_SAVE_SCHEMA_VERSION;
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new Error(`Versão de carreira inválida: ${data.save_schema_version}.`);
  }
  if (fromVersion > toVersion) throw new Error(`Versão futura desconhecida de carreira: ${fromVersion}.`);
  let version = fromVersion;
  if (version < 2) {
    if (!data.entities || typeof data.entities !== 'object' || Array.isArray(data.entities)) data.entities = {};
    data.save_schema_version = 2;
    version = 2;
  }
  if (version < 3) {
    const validSides = ['direita', 'esquerda'];
    const legacySide = validSides.includes(data.player?.court_side)
      ? data.player.court_side
      : validSides.includes(data.player?.position) ? data.player.position : null;
    const canonicalSide = data.metadata?.side_selected === true || legacySide
      ? (legacySide || data.metadata?.court_side || null)
      : null;

    data.player = { ...(data.player || {}), court_side: canonicalSide };
    delete data.player.position;
    data.metadata = {
      ...(data.metadata || {}),
      court_side: canonicalSide,
      play_style: data.player.play_style || (data.metadata?.style_selected ? data.metadata?.play_style : null),
      side_selected: Boolean(canonicalSide),
      style_selected: Boolean(data.player.play_style || data.metadata?.style_selected),
    };
    data.save_schema_version = 3;
    version = 3;
  }
  if (version < 4) {
    data.career_name = String(data.career_name || data.save_name || data.metadata?.player_name || 'Carreira importada').trim();
    data.calendar = {
      ...(data.calendar || {}),
      preferences: data.calendar?.preferences || { default_view: 'week' },
    };
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    data.save_schema_version = 4;
    version = 4;
  }
  if (version < 5) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    data.entities.PressJournalist = Array.isArray(data.entities.PressJournalist)
      ? data.entities.PressJournalist.filter(item => item?.id && item?.name)
      : [];

    const persistedIds = new Set(data.entities.PressJournalist.map(item => item.id));
    const canonicalTemplateId = value => /^j(?:[1-9]|1[0-2])$/.test(String(value || ''));
    const referenceKeys = ['pressJournalistId', 'press_journalist_id', 'active_journalist_id'];
    for (const container of [data.metadata, data.player, data.world]) {
      if (!container || typeof container !== 'object') continue;
      for (const key of referenceKeys) {
        const value = container[key];
        if (value && !persistedIds.has(value) && !canonicalTemplateId(value)) delete container[key];
      }
    }
    data.save_schema_version = 5;
    version = 5;
  }
  if (version < 6) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    const playerId = data.player?.id || '';
    const rows = Array.isArray(data.entities.CharacterCustomization)
      ? data.entities.CharacterCustomization.filter(item => item && typeof item === 'object')
      : [];
    if (rows.length > 0) {
      data.entities.CharacterCustomization = rows.map(item => normalizeCharacterCustomization(item, item.profile_id || playerId));
    } else if (playerId) {
      const legacyAppearance = data.player?.appearance || data.player?.customization || null;
      data.entities.CharacterCustomization = [normalizeCharacterCustomization({
        ...(legacyAppearance && typeof legacyAppearance === 'object' ? legacyAppearance : {}),
        id: `character-customization-${playerId}`,
        profile_id: playerId,
      }, playerId)];
    } else {
      data.entities.CharacterCustomization = [];
    }
    data.save_schema_version = 6;
    version = 6;
  }
  if (version < 7) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    const repair = repairTournamentCollection(data.entities.Tournament || []);
    data.entities.Tournament = repair.tournaments;

    if (repair.remaps.length > 0) {
      for (const rows of Object.values(data.entities)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          for (const remap of repair.remaps) {
            const sameNamedEdition = !remap.tournamentName || row.tournament_name === remap.tournamentName;
            for (const key of ['tournament_id', 'tournamentId', 'related_tournament_id']) {
              if (row[key] === remap.oldId && sameNamedEdition) row[key] = remap.newId;
            }
            if (row.related_id === remap.oldId && sameNamedEdition && ['tournament', 'torneio'].includes(row.event_type)) {
              row.related_id = remap.newId;
            }
          }
        }
      }
    }
    data.save_schema_version = 7;
    version = 7;
  }
  if (version < 8) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    const tutorial = normalizeTutorialState(data.tutorial || data.player?.tutorial_onboarding, data, {
      tutorialFinished: Boolean(data.player?.onboarding_completed || Number(data.player?.matches_played || 0) > 0 || (data.entities?.Match || []).length > 0),
    });
    data.tutorial = tutorial;
    data.player = { ...(data.player || {}), tutorial_onboarding: tutorial };
    data.save_schema_version = 8;
    version = 8;
  }
  if (version < 9) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    const athletes = Array.isArray(data.entities.AthleteProfile) ? data.entities.AthleteProfile : [];
    const remaps = new Map();
    const unique = new Map();
    for (const athlete of athletes) {
      if (!athlete || typeof athlete !== 'object') continue;
      const normalized = normalizeAthlete(athlete);
      if (athlete.id && athlete.id !== normalized.id) remaps.set(athlete.id, normalized.id);
      const previous = unique.get(normalized.id);
      unique.set(normalized.id, previous ? { ...previous, ...normalized, attributes: { ...previous.attributes, ...normalized.attributes } } : normalized);
    }
    data.entities.AthleteProfile = [...unique.values()];
    if (remaps.size > 0) {
      for (const rows of Object.values(data.entities)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          for (const key of ['athlete_id', 'partner_id', 'partner_bot_id', 'current_partner_id', 'player1_id', 'player2_id']) {
            if (remaps.has(row[key])) row[key] = remaps.get(row[key]);
          }
        }
      }
      for (const key of ['partner_id', 'current_partner_id']) {
        if (remaps.has(data.player?.[key])) data.player[key] = remaps.get(data.player[key]);
      }
    }
    data.save_schema_version = 9;
    version = 9;
  }
  if (version < 10) {
    const tutorial = normalizeTutorialState(data.tutorial || data.player?.tutorial_onboarding, data, {
      tutorialFinished: Boolean(data.player?.onboarding_completed || Number(data.player?.matches_played || 0) > 0 || (data.entities?.Match || []).length > 0),
    });
    data.tutorial = tutorial;
    data.player = {
      ...(data.player || {}),
      tutorial_onboarding: tutorial,
      onboarding_completed: tutorial.status === 'completed',
      onboarding_stage: tutorial.currentStepId,
    };
    data.metadata = { ...(data.metadata || {}), onboarding_completed: tutorial.status === 'completed' };
    data.save_schema_version = 10;
    version = 10;
  }
  if (version < 11) {
    const player = { ...(data.player || {}) };
    const styleAliases = { agressivo: 'ofensivo', técnico: 'construtor', tecnico: 'construtor', defensive: 'defensivo', control: 'controle', balanced: 'equilibrado', offensive: 'ofensivo' };
    const rawStyle = String(player.play_style || '').trim().toLowerCase();
    const mappedStyle = styleAliases[rawStyle] || rawStyle || null;
    player.handedness = ['right', 'left'].includes(player.handedness) ? player.handedness : 'right';
    player.dominant_hand = player.handedness;
    player.handedness_inferred = !['right', 'left'].includes(data.player?.handedness);
    if (mappedStyle) player.play_style = mappedStyle;
    if (player.court_side && mappedStyle) {
      try {
        const build = buildInitialProfile({ handedness: player.handedness, preferredSide: player.court_side, playStyle: mappedStyle });
        player.tactical_role = player.tactical_role || build.tactical_role;
        player.archetype_id = player.archetype_id || build.archetype_id;
        player.archetype_label = player.archetype_label || build.archetype_label;
        player.recommended_training_attributes = player.recommended_training_attributes || build.recommended_attributes;
      } catch { /* Preserve unknown legacy combinations without changing attributes. */ }
    }
    data.player = player;
    data.metadata = { ...data.metadata, play_style: mappedStyle || data.metadata?.play_style || null };
    data.save_schema_version = 11;
    version = 11;
  }
  if (version < 12) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    data.entities.TrainingSession = (Array.isArray(data.entities.TrainingSession) ? data.entities.TrainingSession : []).map(migrateTrainingReference);
    data.entities.CalendarEvent = (Array.isArray(data.entities.CalendarEvent) ? data.entities.CalendarEvent : []).map(event => {
      const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
      return metadata.training_activity_id
        ? { ...event, metadata: { ...metadata, training_activity_id: migrateTrainingReference({ activity_id: metadata.training_activity_id }).activity_id, training_schema_version: 2 } }
        : event;
    });
    const player = { ...(data.player || {}) };
    if (player.weekly_training_plan && typeof player.weekly_training_plan === 'object') {
      player.weekly_training_plan = Object.fromEntries(Object.entries(player.weekly_training_plan).map(([day, entry]) => [day, migrateTrainingReference(entry)]));
    }
    player.attribute_progress = player.attribute_progress && typeof player.attribute_progress === 'object' ? player.attribute_progress : {};
    player.training_schema_version = 2;
    data.player = player;
    data.save_schema_version = 12;
    version = 12;
  }
  if (version < 13) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    const tournaments = new Map((Array.isArray(data.entities.Tournament) ? data.entities.Tournament : []).map(item => [item.id, item]));
    const existing = Array.isArray(data.entities.TournamentRegistration) ? data.entities.TournamentRegistration : [];
    const legacyEvents = (Array.isArray(data.entities.CalendarEvent) ? data.entities.CalendarEvent : []).filter(event => event?.event_type === 'tournament' && event?.related_id);
    const candidates = [...existing, ...legacyEvents.map(event => ({
      id: `registration-${data.player?.id || event.profile_id}-${event.related_id}`,
      profile_id: event.profile_id || data.player?.id,
      player_id: event.profile_id || data.player?.id,
      partner_id: event.metadata?.partner_id || data.player?.partner_id || null,
      tournament_id: event.related_id,
      tournament_name: event.related_name || event.title,
      status: event.status === 'cancelled' ? 'cancelled' : event.status === 'completed' ? 'completed' : 'confirmed',
      registered_at: event.created_date || data.player?.career_date,
      entry_fee_paid: Number(event.coin_cost) || 0,
    }))];
    const unique = new Map();
    for (const registration of candidates) {
      if (!registration?.profile_id || !registration?.tournament_id) continue;
      const key = `${registration.profile_id}:${registration.tournament_id}`;
      if (unique.has(key)) continue;
      const tournament = tournaments.get(registration.tournament_id) || {};
      unique.set(key, {
        ...registration,
        id: registration.id || `registration-${registration.profile_id}-${registration.tournament_id}`,
        status: ['pending', 'confirmed', 'cancelled', 'withdrawn', 'rejected', 'completed'].includes(registration.status) ? registration.status : 'confirmed',
        effective_start_date: registration.effective_start_date || tournament.qualifying_start_date || tournament.start_date || null,
        effective_end_date: registration.effective_end_date || tournament.end_date || tournament.start_date || null,
        registration_schema_version: 2,
      });
    }
    data.entities.TournamentRegistration = [...unique.values()];
    data.registration_migration_warnings = [];
    const active = data.entities.TournamentRegistration.filter(item => ['pending', 'confirmed'].includes(item.status));
    for (let i = 0; i < active.length; i += 1) for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]; const b = active[j];
      const shared = [a.profile_id, a.partner_id].filter(Boolean).some(id => id === b.profile_id || id === b.partner_id);
      const overlap = a.effective_start_date && b.effective_start_date && a.effective_start_date <= b.effective_end_date && b.effective_start_date <= a.effective_end_date;
      if (shared && overlap && a.tournament_id !== b.tournament_id) data.registration_migration_warnings.push({ code: 'LEGACY_DATE_CONFLICT', registration_ids: [a.id, b.id] });
    }
    data.save_schema_version = 13;
    version = 13;
  }
  if (version < 14) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    const profileId = data.player?.id;
    const messages = Array.isArray(data.entities.CareerMessage) ? data.entities.CareerMessage : [];
    const existingOffers = Array.isArray(data.entities.PartnerOffer) ? data.entities.PartnerOffer : [];
    const offers = new Map(existingOffers.filter(item => item?.profile_id && (item?.candidate_player_id || item?.athlete_id)).map(item => {
      const candidateId = item.candidate_player_id || item.athlete_id;
      const statusAliases = { aceita: 'accepted', recusada: 'rejected', pendente: 'pending' };
      const normalized = { ...item, candidate_player_id: candidateId, status: statusAliases[item.status] || item.status || 'pending', candidate_snapshot: item.candidate_snapshot || { id: candidateId, name: item.athlete_name } };
      return [`${item.profile_id}:${candidateId}`, normalized];
    }));
    for (const message of messages.filter(item => item?.message_type === 'proposta_parceria')) {
      const oldPayload = message.actions?.find(action => action?.payload?.bot)?.payload;
      const candidate = oldPayload?.bot || message.metadata?.candidate_snapshot || null;
      const candidateId = candidate?.id || (message.related_entity_type !== 'partner_offer' ? message.related_entity_id : null);
      if (!profileId || !candidateId) continue;
      const key = `${profileId}:${candidateId}`;
      const offerId = `partner-offer-${profileId}-${candidateId}`;
      const matchesCurrent = data.player?.partner_id === candidateId;
      const inferredStatus = matchesCurrent ? 'accepted' : message.chosen_action_id === 'decline' ? 'rejected' : message.status === 'decisao_pendente' ? 'pending' : 'withdrawn';
      const prior = offers.get(key);
      offers.set(key, { ...prior, id: prior?.id || offerId, profile_id: profileId, candidate_player_id: candidateId, status: matchesCurrent ? 'accepted' : (prior?.status || inferredStatus), created_career_date: prior?.created_career_date || message.career_date || data.player?.career_date, expires_career_date: prior?.expires_career_date || message.expires_career_date, source: prior?.source || 'legacy-inbox-migration', candidate_snapshot: prior?.candidate_snapshot || candidate || { id: candidateId, name: message.related_entity_name || message.sender_name }, contract: prior?.contract || { type: 'temporary', durationDays: oldPayload?.duration || message.metadata?.duration || 60, prizeSplit: oldPayload?.split || message.metadata?.split || 50, conditions: [] }, schema_version: 1 });
      message.related_entity_type = 'partner_offer'; message.related_entity_id = offerId;
      message.metadata = { ...(message.metadata || {}), offer_id: offerId };
      if (matchesCurrent) { message.status = 'resolvida'; message.chosen_action_id = 'accept'; message.actions = []; }
      else if (message.status === 'decisao_pendente') message.actions = [{ id: 'view_offer', label: 'Analisar na área de Parceiros', type: 'view_partner_offer', payload: { offerId } }];
    }
    if (data.player?.partner_id) for (const offer of offers.values()) if (offer.candidate_player_id !== data.player.partner_id && offer.status === 'accepted') offer.status = 'withdrawn';
    data.entities.PartnerOffer = [...offers.values()];
    data.save_schema_version = 14;
    version = 14;
  }
  return { migrated: version !== fromVersion, fromVersion, toVersion, data };
}

export function migrateIndex(index) {
  const data = cloneDeep(index);
  const fromVersion = Number(data.schema_version ?? 1);
  const toVersion = CAREER_INDEX_SCHEMA_VERSION;
  if (fromVersion > toVersion) throw new Error(`Versão futura desconhecida do índice: ${fromVersion}.`);
  let version = fromVersion;
  if (version < 2) {
    data.careers = (data.careers || []).map((item, position) => ({
      ...item,
      save_name: String(item.save_name || item.career_name || item.player_name || `Carreira ${position + 1}`).trim(),
    }));
    data.schema_version = 2;
    version = 2;
  }
  return { migrated: version !== fromVersion, fromVersion, toVersion, data };
}
