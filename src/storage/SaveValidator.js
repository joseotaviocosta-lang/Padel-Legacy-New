import { StorageError } from './StorageError.js';

export function validateStoragePayload(value, { requireObject = true, requiredFields = [] } = {}) {
  if (value === null) {
    throw new StorageError('Os dados não podem ser null.', 'INVALID_STORAGE_DATA');
  }
  if (typeof value === 'undefined') {
    throw new StorageError('Os dados não podem ser undefined.', 'INVALID_STORAGE_DATA');
  }

  if (requireObject && (typeof value !== 'object' || Array.isArray(value))) {
    throw new StorageError('Os dados devem ser um objeto.', 'INVALID_STORAGE_DATA');
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const field of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(value, field) || value[field] === undefined || value[field] === null) {
        throw new StorageError(`O objeto precisa do campo obrigatório "${field}".`, 'INVALID_REQUIRED_FIELD');
      }
    }
  }

  try {
    JSON.stringify(value);
  } catch (error) {
    throw new StorageError('Os dados não são serializáveis em JSON.', 'INVALID_JSON_SERIALIZATION');
  }

  return value;
}

export function validateSaveData(value) {
  const validated = validateStoragePayload(value, { requireObject: true, requiredFields: ['id', 'database'] });
  if (typeof validated.id !== 'string' || !validated.id.trim()) {
    throw new StorageError('O save deve conter um id de carreira válido.', 'INVALID_SAVE_ID');
  }
  if (!validated.database || typeof validated.database !== 'object' || Array.isArray(validated.database)) {
    throw new StorageError('O save deve conter um objeto de database válido.', 'INVALID_SAVE_DATABASE');
  }
  return {
    ...validated,
    id: String(validated.id),
    database: validated.database,
  };
}

export function normalizeCareerMetadata(metadata = {}) {
  return {
    id: String(metadata.id || ''),
    name: String(metadata.name || 'Carreira nativa'),
    type: String(metadata.type || 'native'),
    created_at: metadata.created_at || new Date().toISOString(),
    updated_at: metadata.updated_at || new Date().toISOString(),
    player_name: String(metadata.player_name || ''),
    description: String(metadata.description || ''),
  };
}
