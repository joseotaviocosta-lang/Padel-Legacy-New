import { localGame } from '@/api/localGameClient.js';

// Playthrough 5.27-M — linha do extrato (FinancialTransaction) para uma
// mudança de saldo feita fora de um lote. `id` estável quando a operação tem
// identidade própria (compra, contrato...), para que um retry não duplique a
// linha. Nunca altera moedas: só registra o que o chamador já debitou/creditou.
export async function recordFinancialEntry({ id = null, profileId, date, type, category, description, amount }) {
  const value = Math.abs(Math.round(Number(amount) || 0));
  if (!profileId || !value) return null;
  const data = { profile_id: profileId, date: String(date || '').slice(0, 10) || null, type, category, description, amount: value };
  try {
    return id ? await localGame.entities.FinancialTransaction.upsert(id, data) : await localGame.entities.FinancialTransaction.create(data);
  } catch (error) {
    // O extrato é derivado: falhar aqui não pode desfazer a operação do jogador.
    console.warn('[financialLedger] linha do extrato não gravada', { category, error: error?.message });
    return null;
  }
}
