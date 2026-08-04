import { validateReplay } from '../ReplayValidator.js';
import { checksumReplay } from './ReplayChecksum.js';
import { createReplayMetadata, shouldAutoSave } from './ReplayMetadata.js';
import { createReplayBackend } from './ReplayLibraryBackend.js';
import { normalizeReplay } from '../ReplayMigration.js';

const INDEX_PATH = 'replays/replay-index.json';
const BACKUP_PATH = 'replays/replay-index.backup.json';
const INDEX_VERSION = 1;
const clean = (value) => String(value || 'external').replace(/[^a-zA-Z0-9_-]/g, '_');
const replayPath = (careerId, replayId) => `replays/${clean(careerId)}/${clean(replayId)}.json`;
const emptyIndex = () => ({ index_version: INDEX_VERSION, updated_at: new Date().toISOString(), replays: [] });

export class ReplayLibraryError extends Error { constructor(message, code, details) { super(message); this.name = 'ReplayLibraryError'; this.code = code; this.details = details; } }

export class ReplayLibrary {
  constructor({ backend = createReplayBackend() } = {}) { this.backend = backend; this.queue = Promise.resolve(); }
  serialize(task) { const result = this.queue.then(task, task); this.queue = result.catch(() => {}); return result; }
  async readIndex() {
    try {
      const parsed = JSON.parse(await this.backend.read(INDEX_PATH));
      if (parsed.index_version > INDEX_VERSION) throw new ReplayLibraryError('Índice criado por uma versão mais nova.', 'FUTURE_INDEX_VERSION');
      return { ...emptyIndex(), ...parsed, replays: Array.isArray(parsed.replays) ? parsed.replays : [] };
    } catch (error) {
      if (error.code === 'FUTURE_INDEX_VERSION') throw error;
      try { return JSON.parse(await this.backend.read(BACKUP_PATH)); } catch { return emptyIndex(); }
    }
  }
  async writeIndex(index) {
    const next = { ...index, index_version: INDEX_VERSION, updated_at: new Date().toISOString() };
    const current = await this.backend.exists(INDEX_PATH) ? await this.backend.read(INDEX_PATH) : null;
    if (current) await this.backend.write(BACKUP_PATH, current);
    const temp = `${INDEX_PATH}.tmp`;
    await this.backend.write(temp, JSON.stringify(next));
    if (await this.backend.exists(INDEX_PATH)) await this.backend.remove(INDEX_PATH);
    await this.backend.rename(temp, INDEX_PATH);
    return next;
  }
  async save(replay, context = {}, options = {}) {
    return this.serialize(async () => {
      const validation = validateReplay(replay);
      if (!validation.valid) throw new ReplayLibraryError('Replay inválido.', 'INVALID_REPLAY', validation.errors);
      const metadata = createReplayMetadata(replay, context);
      if (!options.force && !shouldAutoSave(metadata, options.policy)) return { saved: false, reason: 'policy', metadata };
      const payload = structuredClone(replay);
      payload.checksum = await checksumReplay(payload);
      const path = replayPath(metadata.career_id, replay.replay_id);
      const temp = `${path}.tmp`;
      await this.backend.write(temp, JSON.stringify(payload));
      if (await this.backend.exists(path)) await this.backend.remove(path);
      await this.backend.rename(temp, path);
      const index = await this.readIndex();
      index.replays = index.replays.filter((item) => item.replay_id !== metadata.replay_id || item.career_id !== metadata.career_id);
      index.replays.push({ ...metadata, checksum: payload.checksum, path });
      await this.writeIndex(index);
      return { saved: true, metadata: index.replays.at(-1) };
    });
  }
  async list(careerId, filters = {}) {
    const index = await this.readIndex();
    let items = index.replays.filter((item) => item.career_id === String(careerId));
    if (filters.search) { const q = filters.search.toLowerCase(); items = items.filter((item) => JSON.stringify([item.tournament_name,item.team_a?.names,item.team_b?.names,item.score]).toLowerCase().includes(q)); }
    if (filters.tournament) items = items.filter((item) => item.tournament_id === filters.tournament || item.tournament_name === filters.tournament);
    if (filters.season != null && filters.season !== '') items = items.filter((item) => String(item.season) === String(filters.season));
    if (filters.favorites) items = items.filter((item) => item.is_favorite);
    if (filters.historical) items = items.filter((item) => item.is_historical);
    const sort = filters.sort || 'newest';
    items.sort(sort === 'importance' ? (a,b) => b.importance_score-a.importance_score : sort === 'oldest' ? (a,b) => String(a.played_at).localeCompare(String(b.played_at)) : (a,b) => String(b.played_at).localeCompare(String(a.played_at)));
    const total = items.length; const offset = Math.max(0, filters.offset || 0); const limit = Math.min(100, filters.limit || 50);
    return { items: items.slice(offset, offset + limit), total, offset, limit };
  }
  async load(careerId, replayId) {
    const index = await this.readIndex();
    const metadata = index.replays.find((item) => item.career_id === String(careerId) && item.replay_id === replayId);
    if (!metadata) throw new ReplayLibraryError('Replay não disponível para esta partida.', 'REPLAY_NOT_FOUND');
    try {
      const rawReplay = JSON.parse(await this.backend.read(metadata.path));
      const checksum = await checksumReplay(rawReplay);
      if (metadata.checksum && checksum !== metadata.checksum) throw new Error('checksum');
      const normalized = normalizeReplay(rawReplay);
      if (!normalized.available) throw new ReplayLibraryError('Replay indisponível. Esta partida foi concluída antes de o sistema de replay ser registrado.', 'REPLAY_UNAVAILABLE');
      const replay = normalized.replay;
      const validation = validateReplay(replay);
      if (!validation.valid) throw new Error('schema');
      return replay;
    } catch (error) {
      if (error instanceof ReplayLibraryError && error.code === 'REPLAY_UNAVAILABLE') throw error;
      metadata.integrity = 'corrupted'; await this.writeIndex(index);
      throw new ReplayLibraryError('Este replay está corrompido, mas os demais continuam disponíveis.', 'CORRUPTED_REPLAY', error);
    }
  }
  async favorite(careerId, replayId, value = true) { return this.serialize(async () => { const index=await this.readIndex(); const item=index.replays.find((x)=>x.career_id===String(careerId)&&x.replay_id===replayId); if(!item) throw new ReplayLibraryError('Replay não encontrado.','REPLAY_NOT_FOUND'); item.is_favorite=Boolean(value); await this.writeIndex(index); return item; }); }
  async remove(careerId, replayId) { return this.serialize(async () => { const index=await this.readIndex(); const item=index.replays.find((x)=>x.career_id===String(careerId)&&x.replay_id===replayId); if(!item) return false; await this.backend.remove(item.path); index.replays=index.replays.filter((x)=>x!==item); await this.writeIndex(index); return true; }); }
  async export(careerId, replayId) { const replay=await this.load(careerId,replayId); return JSON.stringify({ format:'padel-legacy-replay', exported_at:new Date().toISOString(), replay },null,2); }
  async import(serialized, careerId) { let wrapper; try { wrapper=typeof serialized==='string'?JSON.parse(serialized):serialized; } catch { throw new ReplayLibraryError('Arquivo JSON inválido.','INVALID_IMPORT'); } const normalized=normalizeReplay(wrapper?.replay||wrapper);if(!normalized.available)throw new ReplayLibraryError('Replay sem timeline reproduzível.','REPLAY_UNAVAILABLE');return this.save(normalized.replay,{career_id:careerId,is_external:true},{force:true}); }
  async storage(careerId) { const {items,total}=await this.list(careerId,{limit:100000}); return { bytes:items.reduce((sum,x)=>sum+(x.storage_size_bytes||0),0), count:total }; }
  async cleanup(careerId, limitBytes) { return this.serialize(async () => { const index=await this.readIndex(); const own=index.replays.filter((x)=>x.career_id===String(careerId)); let bytes=own.reduce((s,x)=>s+(x.storage_size_bytes||0),0); const removed=[]; for(const item of own.filter((x)=>!x.is_favorite&&!x.is_historical).sort((a,b)=>String(a.played_at).localeCompare(String(b.played_at)))) { if(bytes<=limitBytes) break; await this.backend.remove(item.path); bytes-=item.storage_size_bytes||0; removed.push(item.replay_id); } index.replays=index.replays.filter((x)=>!removed.includes(x.replay_id)||x.career_id!==String(careerId)); await this.writeIndex(index); return { bytes,removed,limitRespected:bytes<=limitBytes }; }); }
  async findOrphans() { const index=await this.readIndex(); const known=new Set(index.replays.map((x)=>x.path)); return (await this.backend.list('replays/')).filter((path)=>path.endsWith('.json')&&!path.includes('replay-index')&&!known.has(path)); }
}

export const replayLibrary = new ReplayLibrary();
