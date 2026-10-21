import { localGame } from '@/api/localGameClient.js';

// LOCAL-8G (8D, data do computador) — a data da CARREIRA é a autoridade para
// tudo que é registro esportivo (históricos de relacionamento, conflitos de
// dupla, reações de fãs…). Funções de biblioteca que não recebem o perfil
// leem a data da carreira ativa aqui, em vez de `new Date()` (relógio do
// computador). O relógio real só é usado se não houver carreira ativa.
export async function getActiveCareerDate() {
  const profiles = await localGame.entities.PlayerProfile.list('-created_date', 1).catch(() => []);
  const date = profiles?.[0]?.career_date;
  return /^\d{4}-\d{2}-\d{2}/.test(String(date || '')) ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);
}
