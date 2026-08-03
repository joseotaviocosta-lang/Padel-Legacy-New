import { CareerEntityRepository } from '../repositories/CareerEntityRepository.js';

const repository = new CareerEntityRepository();

export function createEntityAdapter(entityName) {
  return {
    list: (sort, limit) => repository.list(entityName, sort, limit),
    filter: (query, sort, limit) => repository.filter(entityName, query, sort, limit),
    get: (id) => repository.get(entityName, id),
    create: (data) => repository.create(entityName, data),
    update: (id, data) => repository.update(entityName, id, data),
    upsert: (id, data) => repository.upsert(entityName, id, data),
    delete: (id) => repository.delete(entityName, id),
    bulkCreate: (data) => repository.bulkCreate(entityName, data),
    bulkUpdate: (data) => repository.bulkUpdate(entityName, data),
    count: (query) => repository.count(entityName, query),
    subscribe: () => () => {},
  };
}
