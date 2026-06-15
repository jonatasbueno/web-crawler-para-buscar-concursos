import { describe, it, expect } from '@jest/globals';
import { criarSchema } from '../src/database/schema.js';
import { criarConexao } from '../src/database/knex.js';

describe('schema', () => {
  it('cria tabelas quando ainda não existem', async () => {
    const knex = criarConexao(':memory:');
    await criarSchema(knex);
    expect(await knex.schema.hasTable('concursos')).toBe(true);
    expect(await knex.schema.hasTable('cron_runs')).toBe(true);
    await knex.destroy();
  });

  it('não recria tabelas já existentes', async () => {
    const knex = criarConexao(':memory:');
    await criarSchema(knex);
    await criarSchema(knex);
    expect(await knex.schema.hasTable('concursos')).toBe(true);
    await knex.destroy();
  });
});
