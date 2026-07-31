import { localDatabase } from '@/local/localDatabase.js';
import { isNewCareerSystemEnabled } from '../config/featureFlags.js';
import { CareerEntityRepository } from '../repositories/CareerEntityRepository.js';

const repository = new CareerEntityRepository();

export function createEntityAdapter(entityName) {
  const legacy = {
    list: (sort, limit) => localDatabase.list(entityName, sort, limit),
    filter: (query, sort, limit) => localDatabase.filter(entityName, query, sort, limit),
    get: (id) => localDatabase.get(entityName, id),
    create: (data) => localDatabase.create(entityName, data),
    update: (id, data) => localDatabase.update(entityName, id, data),
    delete: (id) => localDatabase.delete(entityName, id),
    bulkCreate: (data) => localDatabase.bulkCreate(entityName, data),
    bulkUpdate: (data) => localDatabase.bulkUpdate(entityName, data),
    count: (query) => localDatabase.count(entityName, query),
  };
  const modern = {
    list: (sort, limit) => repository.list(entityName, sort, limit),
    filter: (query, sort, limit) => repository.filter(entityName, query, sort, limit),
    get: (id) => repository.get(entityName, id),
    create: (data) => repository.create(entityName, data),
    update: (id, data) => repository.update(entityName, id, data),
    delete: (id) => repository.delete(entityName, id),
    bulkCreate: (data) => repository.bulkCreate(entityName, data),
    bulkUpdate: (data) => repository.bulkUpdate(entityName, data),
    count: (query) => repository.count(entityName, query),
  };
  const choose = (method) => (...args) => (isNewCareerSystemEnabled() ? modern[method](...args) : legacy[method](...args));
  return {
    list: choose('list'), filter: choose('filter'), get: choose('get'), create: choose('create'),
    update: choose('update'), delete: choose('delete'), bulkCreate: choose('bulkCreate'),
    bulkUpdate: choose('bulkUpdate'), count: choose('count'), subscribe: () => () => {},
  };
}
