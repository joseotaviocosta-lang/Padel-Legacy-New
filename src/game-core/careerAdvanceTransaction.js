/**
 * Restaura o snapshot integral quando qualquer etapa do avanço diário falha.
 * A função é pequena e injetável para que a garantia de rollback seja testada
 * sem depender do filesystem Tauri.
 */
export async function restoreCareerSnapshotOnFailure({ snapshot, restore }) {
  if (!snapshot?.career_id || typeof restore !== 'function') {
    return { rollbackApplied: false, rollbackError: null };
  }
  try {
    await restore(snapshot);
    return { rollbackApplied: true, rollbackError: null };
  } catch (rollbackError) {
    return { rollbackApplied: false, rollbackError };
  }
}
