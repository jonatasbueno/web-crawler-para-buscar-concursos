import { describe, it, expect, jest, beforeEach } from '@jest/globals';

function criarKnexMock(overrides = {}) {
  const builder = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue(1),
    insert: jest.fn().mockReturnThis(),
    onConflict: jest.fn().mockReturnThis(),
    merge: jest.fn().mockResolvedValue(),
    count: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(undefined),
    ...overrides.builder
  };

  const knexFn = jest.fn().mockReturnValue(builder);
  knexFn.schema = {
    hasTable: jest.fn().mockResolvedValue(true),
    createTable: jest.fn().mockResolvedValue(),
    ...overrides.schema
  };
  knexFn.destroy = overrides.destroy ?? jest.fn().mockResolvedValue();

  return { knexFn, builder };
}

async function importarDbComMock(knexFn) {
  jest.unstable_mockModule('../src/database/knex.js', () => ({
    criarConexao: () => knexFn
  }));
  return import('../src/database/db.js');
}

describe('db erros do Knex', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('propaga falha em jaExecutouHoje', async () => {
    const { knexFn, builder } = criarKnexMock();
    builder.first.mockRejectedValue(new Error('consulta fail'));

    const db = await importarDbComMock(knexFn);
    await db.initDb({ path: ':memory:' });
    await expect(db.jaExecutouHoje('2026-01-01')).rejects.toThrow('consulta fail');
    await db.closeDb();
  });

  it('propaga falha em registrarExecucao', async () => {
    const { knexFn, builder } = criarKnexMock();
    builder.merge.mockRejectedValue(new Error('insert fail'));

    const db = await importarDbComMock(knexFn);
    await db.initDb({ path: ':memory:' });
    await expect(
      db.registrarExecucao({ runDate: '2026-01-01', status: 'success' })
    ).rejects.toThrow('insert fail');
    await db.closeDb();
  });

  it('propaga falha em listarConcursosRecentes', async () => {
    const { knexFn, builder } = criarKnexMock();
    builder.orderBy.mockRejectedValue(new Error('select fail'));

    const db = await importarDbComMock(knexFn);
    await db.initDb({ path: ':memory:' });
    await expect(db.listarConcursosRecentes('2026-01-01')).rejects.toThrow('select fail');
    await db.closeDb();
  });

  it('propaga falha ao fechar conexão', async () => {
    const { knexFn } = criarKnexMock({
      destroy: jest.fn().mockRejectedValue(new Error('destroy fail'))
    });

    const db = await importarDbComMock(knexFn);
    await db.initDb({ path: ':memory:' });
    await expect(db.closeDb()).rejects.toThrow('destroy fail');
  });

  it('propaga falha ao criar schema', async () => {
    const { knexFn } = criarKnexMock({
      schema: { hasTable: jest.fn().mockRejectedValue(new Error('schema fail')) }
    });

    const db = await importarDbComMock(knexFn);
    await expect(db.initDb({ path: ':memory:' })).rejects.toThrow('schema fail');
  });
});
