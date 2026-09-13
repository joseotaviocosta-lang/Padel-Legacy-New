// Aparência — trava de campos físicos pós-criação (Fase A). Mecanismo
// genérico e reutilizável: qualquer campo listado no array `locked_fields`
// de uma CharacterCustomization fica fixo — a UI (AppearanceEditor.jsx) e o
// update() de CharacterEditor.jsx só precisam checar essa lista, não sabem
// quais campos são nem por quê.
//
// Gatilho (decisão confirmada): a trava é aplicada no primeiro save de
// verdade de CharacterCustomization (criação da linha), não amarrada ao
// onboarding de estilo/lado — esse é um sistema separado, já fragmentado em
// vocabulários inconsistentes entre si, que pode ser reconciliado numa fase
// futura sem precisar tocar nesta trava. Carreiras existentes sem
// `locked_fields` são migradas na primeira leitura, usando os valores JÁ
// salvos como base travada (sem forçar redefinição).
//
// Fase A é trava rígida, sem resgate — nenhuma função de destravar existe
// de propósito; uma feature futura (kit de loja, ciclo de temporada) pode
// adicionar uma sem redesenhar este mecanismo.
export const LOCKED_FIELDS = Object.freeze(['height_cm', 'build']);

export function isFieldLocked(customization, field) {
  return Array.isArray(customization?.locked_fields) && customization.locked_fields.includes(field);
}

// Só deve ser chamado no momento de criação (handleSave, payload ainda sem
// id) e na migração de carreiras existentes sem `locked_fields` — nunca a
// cada edição de campo, ou o jogador nunca conseguiria salvar pela primeira
// vez. Não sobrescreve uma lista já travada (idempotente).
export function lockPhysicalFieldsIfNeeded(customization) {
  if (Array.isArray(customization?.locked_fields) && customization.locked_fields.length > 0) return customization;
  return { ...customization, locked_fields: [...LOCKED_FIELDS] };
}

// Usado por "Restaurar padrão" (CharacterEditor.jsx handleReset): garante
// que campos travados — e a própria trava — sobrevivem ao reset. Sem isso,
// "restaurar padrão" seria uma porta dos fundos para redefinir altura/
// biotipo mesmo já travados (o reset troca o estado inteiro direto, sem
// passar por update()/isFieldLocked).
export function preserveLockedFieldsOnReset(customization, defaults) {
  const preserved = { ...defaults, id: customization?.id };
  for (const field of customization?.locked_fields || []) {
    preserved[field] = customization[field];
  }
  if (customization?.locked_fields) preserved.locked_fields = customization.locked_fields;
  return preserved;
}
