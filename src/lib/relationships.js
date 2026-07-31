import { base44 } from '@/api/base44Client';
import { generateInterviewQuote, getInterviewStyle } from '@/lib/personalityTraits';

// ─── Relationship Types ────────────────────────────────────────────────────

export const REL_TYPES = {
  inimigo: { label: 'Inimigo', min: -100, max: -50, color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30', icon: 'Skull' },
  rival: { label: 'Rival', min: -49, max: -20, color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30', icon: 'Swords' },
  neutro: { label: 'Neutro', min: -19, max: 19, color: 'text-slate-400', bg: 'bg-slate-500/15', border: 'border-slate-500/30', icon: 'Minus' },
  respeito: { label: 'Respeito', min: 20, max: 39, color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30', icon: 'Handshake' },
  amigo: { label: 'Amigo', min: 40, max: 69, color: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/30', icon: 'Heart' },
  parceiro: { label: 'Parceiro', min: 70, max: 100, color: 'text-primary', bg: 'bg-primary/15', border: 'border-primary/30', icon: 'Users' },
  mentor: { label: 'Mentor', min: 50, max: 100, color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', icon: 'GraduationCap' },
};

export function getRelationshipType(score, isMentor = false) {
  if (isMentor && score >= 50) return 'mentor';
  for (const [id, type] of Object.entries(REL_TYPES)) {
    if (id === 'mentor') continue;
    if (score >= type.min && score <= type.max) return id;
  }
  return 'neutro';
}

export function getRelTypeMeta(typeId) {
  return REL_TYPES[typeId] || REL_TYPES.neutro;
}

// ─── Core CRUD ──────────────────────────────────────────────────────────────

export async function getPlayerRelationships(profileId) {
  if (!profileId) return [];
  try {
    return await base44.entities.Relationship.filter({ profile_id: profileId }, '-score', 100);
  } catch { return []; }
}

export async function getOrCreateRelationship(profileId, athleteId, athleteName, country) {
  if (!profileId || !athleteName) return null;
  try {
    let existing = await base44.entities.Relationship.filter({ profile_id: profileId, target_athlete_id: athleteId || athleteName }, null, 1);
    if (existing && existing.length > 0) return existing[0];

    const created = await base44.entities.Relationship.create({
      profile_id: profileId,
      target_athlete_id: athleteId || athleteName,
      target_name: athleteName,
      target_country: country || '',
      relationship_type: 'neutro',
      score: 0,
      chemistry: 0,
      shared_matches: 0,
      shared_wins: 0,
      shared_losses: 0,
      history: [],
    });
    return created;
  } catch (e) { console.error('getOrCreateRelationship', e); return null; }
}

export async function updateRelationshipScore(relId, scoreChange, event, description, extra = {}) {
  try {
    const rel = await base44.entities.Relationship.get(relId);
    if (!rel) return null;

    const newScore = Math.max(-100, Math.min(100, (rel.score || 0) + scoreChange));
    const newType = getRelationshipType(newScore, extra.isMentor);

    const history = [...(rel.history || []), {
      date: new Date().toISOString().slice(0, 10),
      event,
      score_change: scoreChange,
      description,
    }].slice(-20); // keep last 20 entries

    const updates = {
      score: newScore,
      relationship_type: newType,
      history,
      last_interaction_date: new Date().toISOString().slice(0, 10),
      ...extra,
    };

    // Update chemistry based on positive interactions
    if (scoreChange > 0 && newScore > 20) {
      updates.chemistry = Math.min(100, (rel.chemistry || 0) + Math.round(scoreChange * 0.5));
    }

    return await base44.entities.Relationship.update(relId, updates);
  } catch (e) { console.error('updateRelationshipScore', e); return null; }
}

// ─── Match Processing ───────────────────────────────────────────────────────

export async function processMatchRelationships(profileId, opponentNames = [], partnerName, won) {
  if (!profileId) return;

  // Update relationship with partner
  if (partnerName) {
    const rel = await getOrCreateRelationship(profileId, partnerName, partnerName);
    if (rel) {
      const change = won ? 5 : 2;
      await updateRelationshipScore(
        rel.id, change, won ? 'match_win_together' : 'match_loss_together',
        won ? `Vitória jogando juntos contra ${opponentNames[0] || 'adversários'}` : `Derrota jogando juntos`,
        {
          shared_matches: (rel.shared_matches || 0) + 1,
          shared_wins: won ? (rel.shared_wins || 0) + 1 : rel.shared_wins,
          shared_losses: !won ? (rel.shared_losses || 0) + 1 : rel.shared_losses,
        }
      );
    }
  }

  // Update relationships with opponents
  for (const oppName of opponentNames) {
    if (!oppName || oppName === partnerName) continue;
    const rel = await getOrCreateRelationship(profileId, oppName, oppName);
    if (rel) {
      const change = won ? -3 : -1; // beating someone creates tension, losing slightly more
      const isRivalry = rel.score < -20;
      const finalChange = isRivalry ? change * 1.5 : change;
      await updateRelationshipScore(
        rel.id, finalChange, won ? 'match_win_vs' : 'match_loss_vs',
        won ? `Vitória contra ${oppName}` : `Derrota para ${oppName}`,
        { shared_matches: (rel.shared_matches || 0) + 1 }
      );
    }
  }
}

// ─── Social Interactions ────────────────────────────────────────────────────

export async function interactSocially(profileId, athleteId, athleteName, interactionType) {
  const rel = await getOrCreateRelationship(profileId, athleteId, athleteName);
  if (!rel) return null;

  const INTERACTIONS = {
    elogiar: { change: 4, event: 'social_praise', desc: 'Elogiou em entrevista' },
    provocar: { change: -6, event: 'social_provoke', desc: 'Provocação pública' },
    convidar_treino: { change: 6, event: 'social_train_invite', desc: 'Convidou para treinar' },
    presente: { change: 8, event: 'social_gift', desc: 'Presenteou com equipamento' },
    ignorar: { change: -2, event: 'social_ignore', desc: 'Ignorou em evento social' },
    apoiar: { change: 5, event: 'social_support', desc: 'Apoio público em dificuldade' },
  };

  const action = INTERACTIONS[interactionType];
  if (!action) return null;

  return await updateRelationshipScore(rel.id, action.change, action.event, action.desc);
}

// ─── Effects on Performance ─────────────────────────────────────────────────

export function getRelationshipEffects(relationships = []) {
  const effects = {
    moraleBonus: 0,
    performanceBonus: 0,
    sponsorBonus: 0,
    fanBonus: 0,
    injuryRiskMod: 1.0,
    chemistryBonus: 0,
  };

  for (const rel of relationships) {
    const score = rel.score || 0;
    switch (rel.relationship_type) {
      case 'amigo':
        effects.moraleBonus += 2;
        effects.fanBonus += 1;
        break;
      case 'parceiro':
        effects.moraleBonus += 3;
        effects.chemistryBonus += 5;
        effects.fanBonus += 2;
        break;
      case 'rival':
        effects.performanceBonus += 3; // rivalry boosts intensity
        effects.sponsorBonus += 2; // rivalries attract sponsors
        effects.fanBonus += 3;
        break;
      case 'inimigo':
        effects.performanceBonus += 1; // intensity but stress
        effects.moraleBonus -= 2;
        effects.sponsorBonus += 1; // drama sells
        break;
      case 'mentor':
        effects.moraleBonus += 2;
        effects.performanceBonus += 2; // guidance improves play
        break;
      case 'respeito':
        effects.moraleBonus += 1;
        break;
    }
  }

  return effects;
}

export function getPartnerChemistryBonus(relationships, partnerName) {
  const partner = relationships.find(r => r.target_name === partnerName);
  if (!partner) return 0;
  if (partner.relationship_type === 'parceiro') return 15;
  if (partner.relationship_type === 'amigo') return 10;
  if (partner.relationship_type === 'respeito') return 5;
  if (partner.relationship_type === 'inimigo') return -10;
  if (partner.relationship_type === 'rival') return -5;
  return 0;
}

// ─── Interview Generation ──────────────────────────────────────────────────

export function generateRelationshipInterview(relationship, context = 'neutral', targetTraits = []) {
  if (!relationship) return generateInterviewQuote(targetTraits, context);

  const type = relationship.relationship_type;
  const name = relationship.target_name;

  const QUOTES = {
    rival: {
      win: [`${name} é duro, mas hoje fui melhor. Sempre bom vencer um rival.`, `Adoro jogar contra ${name}. Sempre é guerra.`],
      lose: [`${name} mereceu. Mas a guerra não acabou.`, `Perdi para ${name} hoje. Na próxima, pago.`],
      neutral: [`${name} é um grande adversário. Sempre jogos duros.`, `Tenho respeito por ${name}, mas dentro da quadra é guerra.`],
    },
    inimigo: {
      win: [`Mandei ${name} de volta para casa. Perfeito.`, `${name} fala demais. Hoje respondi em quadra.`],
      lose: [`${name} teve sorte. Sempre sorte.`, `Não aceito perder para ${name}. Nunca.`],
      neutral: [`${name}? Não tenho nada a dizer.`, `Prefiro não falar sobre ${name}.`],
    },
    amigo: {
      win: [`Que bom vencer! ${name} é grande amigo, mas dentro da quadra é jogo.`, `Adversário de respeito e amigo de fora da quadra. ${name} é incrível.`],
      lose: [`${name} me venceu, mas nossa amizade continua.`, `Parabéns a ${name}. Amigo e craque.`],
      neutral: [`${name} é como irmão. Sempre nos apoiamos.`, `Tenho carinho enorme por ${name}.`],
    },
    parceiro: {
      win: [`Jogar com ${name} é fácil. Entrosamento total.`, `${name} é o parceiro perfeito. Mais uma juntos!`],
      lose: [`Faltou um pouco de sorte. ${name} e eu vamos melhorar.`, `Com ${name}, sempre há próxima. Vamos treinar mais.`],
      neutral: [`${name} é meu parceiro ideal. Quero jogar muito mais juntos.`, `A química com ${name} é natural.`],
    },
    mentor: {
      win: [`Tudo que aprendi com ${name} apliquei hoje. Gratidão.`, `${name} me ensinou muito. Hoje colhi frutos.`],
      lose: [`${name} me ensinou que derrota é aprendizado.`, `A lição de ${name}: cair e levantar.`],
      neutral: [`${name} é meu mentor. Tudo que sou devo a ele.`, `Aprendo com ${name} todos os dias.`],
    },
    respeito: {
      win: [`Vitória suada. ${name} é excelente adversário.`, `Respeito total por ${name}. Hoje foi minha vez.`],
      lose: [`${name} jogou muito. Respeito.`, `Parabéns a ${name}. Jogador de alto nível.`],
      neutral: [`${name} é um profissional exemplar.`, `Tenho enorme respeito por ${name} e seu jogo.`],
    },
    neutro: {
      win: [`Boa partida. ${name} é bom adversário.`, `Vitória justa contra ${name}.`],
      lose: [`${name} foi melhor hoje.`, `Aprenderei com esta derrota.`],
      neutral: [`Conheço pouco ${name}, mas parece forte.`, `Sem muita história com ${name}.`],
    },
  };

  const typeQuotes = QUOTES[type] || QUOTES.neutro;
  const contextQuotes = typeQuotes[context] || typeQuotes.neutral;
  return contextQuotes[Math.floor(Math.random() * contextQuotes.length)];
}

// ─── Special Events ─────────────────────────────────────────────────────────

export function checkSpecialRelationshipEvents(relationships = []) {
  const events = [];

  for (const rel of relationships) {
    if (rel.relationship_type === 'rival' && rel.shared_matches >= 5) {
      events.push({
        type: 'rivalry_escalation',
        title: 'Rivalidade Acesa',
        description: `A rivalidade com ${rel.target_name} atingiu novo nível após ${rel.shared_matches} confrontos. A torcida está excitada!`,
        effect: 'Aumento de audiência e interesse de patrocinadores.',
      });
    }
    if (rel.relationship_type === 'inimigo' && rel.score <= -80) {
      events.push({
        type: 'feud',
        title: 'Inimizade Pública',
        description: `O conflito com ${rel.target_name} virou caso de imprensa. Redes sociais em ebulição.`,
        effect: 'Aumento de exposição, mas risco de penalidade disciplinar.',
      });
    }
    if (rel.relationship_type === 'parceiro' && rel.chemistry >= 80) {
      events.push({
        type: 'golden_duo',
        title: 'Dupla de Ouro',
        description: `A parceria com ${rel.target_name} está em sintonia total. Química excepcional!`,
        effect: 'Bônus de desempenho em partidas em dupla.',
      });
    }
    if (rel.relationship_type === 'mentor' && rel.shared_matches >= 3) {
      events.push({
        type: 'mentorship_bearing',
        title: 'Frutos do Mentorado',
        description: `Os conselhos de ${rel.target_name} estão refletindo no seu jogo.`,
        effect: 'Bônus de evolução de atributos.',
      });
    }
  }

  return events;
}

// ─── Initial Seeding ────────────────────────────────────────────────────────

export async function seedInitialRelationships(profileId, athleteProfiles = []) {
  if (!profileId || !athleteProfiles || athleteProfiles.length === 0) return;

  const existing = await getPlayerRelationships(profileId);
  if (existing.length >= 10) return; // Already seeded

  // Pick top athletes as initial rivals and friends based on rating proximity
  const sorted = [...athleteProfiles].sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
  const toCreate = [];

  // 2 rivals (similar rating)
  const rivals = sorted.slice(0, 6);
  for (const r of rivals.slice(0, 2)) {
    if (existing.find(e => e.target_athlete_id === r.bot_id)) continue;
    toCreate.push({
      profile_id: profileId,
      target_athlete_id: r.bot_id,
      target_name: r.name,
      target_country: r.country,
      relationship_type: 'rival',
      score: -28 - (String(r.bot_id || r.name).length % 10),
      chemistry: 0,
      shared_matches: String(r.bot_id || r.name).length % 3,
      history: [{ date: new Date().toISOString().slice(0, 10), event: 'initial_seed', score_change: 0, description: 'Rivalidade natural do circuito' }],
      last_interaction_date: new Date().toISOString().slice(0, 10),
    });
  }

  // 2 friends (any rating)
  const friends = sorted.slice(4, 10);
  for (const f of friends.slice(0, 2)) {
    if (existing.find(e => e.target_athlete_id === f.bot_id)) continue;
    toCreate.push({
      profile_id: profileId,
      target_athlete_id: f.bot_id,
      target_name: f.name,
      target_country: f.country,
      relationship_type: 'amigo',
      score: 42 + (String(f.bot_id || f.name).length % 12),
      chemistry: 20,
      shared_matches: String(f.bot_id || f.name).length % 2,
      history: [{ date: new Date().toISOString().slice(0, 10), event: 'initial_seed', score_change: 0, description: 'Amizade do circuito' }],
      last_interaction_date: new Date().toISOString().slice(0, 10),
    });
  }

  // 1 mentor (older, higher rated)
  const mentors = sorted.filter(a => (a.age || 0) > 30);
  if (mentors.length > 0) {
    const m = mentors[0];
    if (!existing.find(e => e.target_athlete_id === m.bot_id)) {
      toCreate.push({
        profile_id: profileId,
        target_athlete_id: m.bot_id,
        target_name: m.name,
        target_country: m.country,
        relationship_type: 'mentor',
        score: 58 + (String(m.bot_id || m.name).length % 10),
        chemistry: 10,
        shared_matches: 0,
        history: [{ date: new Date().toISOString().slice(0, 10), event: 'initial_seed', score_change: 0, description: 'Mentor do circuito' }],
        last_interaction_date: new Date().toISOString().slice(0, 10),
      });
    }
  }

  if (toCreate.length > 0) {
    if (base44.entities.Relationship.bulkCreate) {
      try {
        await base44.entities.Relationship.bulkCreate(toCreate);
        return;
      } catch (error) {
        console.warn('seedInitialRelationships bulkCreate falhou; usando criação individual.', error);
      }
    }
    for (const item of toCreate) {
      try { await base44.entities.Relationship.create(item); } catch (error) { console.warn('Falha ao criar relacionamento inicial', error); }
    }
  }
}