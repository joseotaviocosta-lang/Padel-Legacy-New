// Aparência — Fase A: trava de altura/biotipo pós-criação.
// Decisões confirmadas: (1) height_cm + build travam, resto livre; (2) a
// trava aciona no primeiro save de verdade de CharacterCustomization, não
// no onboarding de estilo/lado (sistema separado); (3) trava rígida, sem
// resgate nesta fase. Prova a infra genérica (characterFieldLocks.js) e sua
// integração com normalizeCharacterCustomization — isolado, sem I/O nem
// montar a página inteira.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { LOCKED_FIELDS, isFieldLocked, lockPhysicalFieldsIfNeeded, preserveLockedFieldsOnReset } =
    await vite.ssrLoadModule('/src/lib/characterFieldLocks.js');
  const { DEFAULT_CHARACTER_CUSTOMIZATION, normalizeCharacterCustomization } =
    await vite.ssrLoadModule('/src/lib/characterCustomization.js');

  // ─── Lista de campos travados (decisão 1) ───────────────────────────────
  gate('LOCKED_FIELDS é exatamente [height_cm, build] — decisão confirmada',
    LOCKED_FIELDS.length === 2 && LOCKED_FIELDS.includes('height_cm') && LOCKED_FIELDS.includes('build'));
  gate('LOCKED_FIELDS não inclui campos de estética pura (skin_tone/hair/eye/face_type)',
    !LOCKED_FIELDS.includes('skin_tone') && !LOCKED_FIELDS.includes('hair_color') &&
    !LOCKED_FIELDS.includes('eye_color') && !LOCKED_FIELDS.includes('face_type'));

  // ─── isFieldLocked: pura leitura de locked_fields, sem side effects ─────
  gate('isFieldLocked: customização sem locked_fields nunca está travada',
    !isFieldLocked({ height_cm: 178 }, 'height_cm'));
  gate('isFieldLocked: locked_fields presente mas sem o campo → não travado',
    !isFieldLocked({ locked_fields: ['build'] }, 'height_cm'));
  gate('isFieldLocked: campo listado em locked_fields → travado',
    isFieldLocked({ locked_fields: ['height_cm', 'build'] }, 'height_cm') &&
    isFieldLocked({ locked_fields: ['height_cm', 'build'] }, 'build'));
  gate('isFieldLocked: locked_fields malformado (não-array) não quebra, trata como destravado',
    !isFieldLocked({ locked_fields: 'height_cm' }, 'height_cm') && !isFieldLocked(null, 'height_cm'));

  // ─── Gatilho: primeiro save (decisão 2) ─────────────────────────────────
  // Uma customização nunca salva (sem id, locked_fields=[] vindo do
  // default) NÃO deve estar travada até o momento exato do save.
  const neverSaved = normalizeCharacterCustomization(null, 'profile-1');
  gate('Customização nunca salva (sem id) não está travada antes do primeiro save',
    !isFieldLocked(neverSaved, 'height_cm') && !isFieldLocked(neverSaved, 'build'));

  // Simula exatamente o que handleSave() faz no momento da criação
  // (payload sem id → lockPhysicalFieldsIfNeeded aplicado antes do create).
  const draftBeforeFirstSave = { ...neverSaved, height_cm: 192, build: 'musculoso' };
  const payloadAtCreation = lockPhysicalFieldsIfNeeded(draftBeforeFirstSave);
  gate('No primeiro save (payload sem id), lockPhysicalFieldsIfNeeded trava height_cm e build',
    isFieldLocked(payloadAtCreation, 'height_cm') && isFieldLocked(payloadAtCreation, 'build'));
  gate('A trava no primeiro save preserva o valor que o jogador acabou de escolher (192cm/musculoso)',
    payloadAtCreation.height_cm === 192 && payloadAtCreation.build === 'musculoso');

  // ─── Migração: carreira existente sem locked_fields (decisão 2 + item 3 da entrega) ─
  const legacyRow = { id: 'existing-row', profile_id: 'profile-2', height_cm: 165, build: 'magro' };
  const migrated = lockPhysicalFieldsIfNeeded(legacyRow);
  gate('Migração de linha já persistida sem locked_fields: trava imediatamente',
    isFieldLocked(migrated, 'height_cm') && isFieldLocked(migrated, 'build'));
  gate('Migração usa o valor JÁ salvo como base travada, sem forçar redefinição (165cm/magro preservados)',
    migrated.height_cm === 165 && migrated.build === 'magro');
  gate('Migração detectável por mudança de referência (para o load() saber se precisa persistir)',
    migrated !== legacyRow && migrated.locked_fields !== legacyRow.locked_fields);

  // ─── Idempotência: já travado não é re-travado nem sobrescrito ─────────
  const alreadyLocked = { id: 'row-2', height_cm: 200, build: 'robusto', locked_fields: ['height_cm', 'build'] };
  const reapplied = lockPhysicalFieldsIfNeeded(alreadyLocked);
  gate('lockPhysicalFieldsIfNeeded em linha já travada é no-op — mesma referência (load() não precisa persistir de novo)',
    reapplied === alreadyLocked);

  // Só um dos dois campos travado ainda conta como "já tem locked_fields
  // não-vazio" — a função nunca fica adicionando campo por campo depois do
  // primeiro save (trava é tudo-ou-nada, coerente com "primeiro save").
  const partiallyLocked = { height_cm: 180, build: 'atletico', locked_fields: ['height_cm'] };
  const reappliedPartial = lockPhysicalFieldsIfNeeded(partiallyLocked);
  gate('locked_fields não-vazio (mesmo que só 1 campo) nunca é expandido depois — decisão 3, trava rígida sem ajuste posterior',
    reappliedPartial === partiallyLocked);

  // ─── normalizeCharacterCustomization: locked_fields sobrevive e é sane ──
  gate('DEFAULT_CHARACTER_CUSTOMIZATION começa com locked_fields vazio',
    Array.isArray(DEFAULT_CHARACTER_CUSTOMIZATION.locked_fields) && DEFAULT_CHARACTER_CUSTOMIZATION.locked_fields.length === 0);
  const normalizedWithLock = normalizeCharacterCustomization({ locked_fields: ['height_cm', 'build', 'height_cm'] }, 'profile-3');
  gate('normalizeCharacterCustomization dedupa locked_fields',
    normalizedWithLock.locked_fields.length === 2);
  const normalizedMalformed = normalizeCharacterCustomization({ locked_fields: 'height_cm' }, 'profile-4');
  gate('normalizeCharacterCustomization corrige locked_fields malformado (não-array) para []',
    Array.isArray(normalizedMalformed.locked_fields) && normalizedMalformed.locked_fields.length === 0);

  // ─── Reset não pode ser porta dos fundos pra redefinir campo travado ────
  const lockedCustomization = normalizeCharacterCustomization({
    id: 'row-3', height_cm: 205, build: 'robusto', hair_color: 'ruivo',
    locked_fields: ['height_cm', 'build'],
  }, 'profile-5');
  const resetPayload = preserveLockedFieldsOnReset(lockedCustomization, DEFAULT_CHARACTER_CUSTOMIZATION);
  const afterReset = normalizeCharacterCustomization(resetPayload, 'profile-5');
  gate('Reset preserva o VALOR de campos travados (205cm/robusto sobrevivem ao "Restaurar padrão")',
    afterReset.height_cm === 205 && afterReset.build === 'robusto');
  gate('Reset restaura campos NÃO travados ao default (hair_color volta a "preto")',
    afterReset.hair_color === 'preto');
  gate('Reset preserva a própria lista locked_fields (continua travado depois do reset)',
    isFieldLocked(afterReset, 'height_cm') && isFieldLocked(afterReset, 'build'));
  gate('Reset preserva o id (comportamento pré-existente, não regrediu)',
    afterReset.id === 'row-3');

  // Reset de uma customização NUNCA travada continua resetando altura/build
  // normalmente (sem locked_fields, não há nada a preservar além do id).
  const unlockedCustomization = normalizeCharacterCustomization({ id: 'row-4', height_cm: 205, build: 'robusto' }, 'profile-6');
  const resetPayloadUnlocked = preserveLockedFieldsOnReset(unlockedCustomization, DEFAULT_CHARACTER_CUSTOMIZATION);
  const afterResetUnlocked = normalizeCharacterCustomization(resetPayloadUnlocked, 'profile-6');
  gate('Reset de customização nunca travada continua resetando height_cm/build ao default (178cm/atletico) — sem regressão',
    afterResetUnlocked.height_cm === 178 && afterResetUnlocked.build === 'atletico');

  console.log(`\n${gates} gates executados, todos PASS — Aparência Fase A (trava de campos físicos).`);
} finally {
  await vite.close();
}
