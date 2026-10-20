// Fase 5.32-C.1 — informações essenciais de um candidato a parceiro.
//
// Idade na DATA DA CARREIRA (nunca a data do computador), pela mesma regra
// de idade do jogo (`ageAtDate`, lib/padel.js) quando há data de nascimento;
// sem ela, a idade gravada no registro do atleta/proposta; sem nenhuma das
// duas, null — a interface não exibe idade (nada inventado).
import { ageAtDate } from './padel.js';

export function candidateAgeAt(candidate, careerDate) {
  const birth = candidate?.birth_date || candidate?.date_of_birth || null;
  if (birth && careerDate && /^\d{4}-\d{2}-\d{2}/.test(String(birth))) {
    const age = ageAtDate(String(birth).slice(0, 10), String(careerDate).slice(0, 10));
    if (Number.isFinite(age) && age > 0) return age;
  }
  const stored = Number(candidate?.age);
  return Number.isFinite(stored) && stored > 0 ? Math.trunc(stored) : null;
}

const SIDE = { left: 'Esquerda', esquerda: 'Esquerda', right: 'Direita', direita: 'Direita', flex: 'Ambos os lados', ambos: 'Ambos os lados', both: 'Ambos os lados' };
/** Lado de jogo registrado (null quando não registrado). */
export function candidateSide(candidate) {
  const raw = String(candidate?.preferred_side || candidate?.court_side || '').trim().toLowerCase();
  return SIDE[raw] || null;
}

/** "Argentina · 22 anos · Direita" — só o que existe no registro. */
export function candidateIdentityLine(candidate, careerDate) {
  const age = candidateAgeAt(candidate, careerDate);
  return [candidate?.country || candidate?.nationality || null, age ? `${age} anos` : null, candidateSide(candidate)].filter(Boolean).join(' · ');
}
