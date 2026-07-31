export const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
export const todayForProfile = (profile) => profile?.career_date || new Date().toISOString().slice(0, 10);
export const safeName = (profile) => profile?.sport_name || profile?.name || 'Jogador';
