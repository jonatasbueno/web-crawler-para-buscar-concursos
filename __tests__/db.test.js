import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  initDb,
  closeDb,
  resetDb,
  jaExecutouHoje,
  reservarExecucao,
  registrarExecucao,
  upsertConcursos,
  listarConcursosRecentes,
  getDbPath,
  __testing
} from '../src/database/db.js';

const concurso = {
  orgao: 'Prefeitura de Piracicaba',
  cidade: 'PIRACICABA',
  escolaridade: 'Superior',
  status: 'Aberto',
  link: 'https://www.pciconcursos.com.br/noticias/teste',
  fonte: 'test'
};

describe('db', () => {
  let tempDbPath;

  beforeEach(async () => {
    tempDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-db-')), 'test.db');
    await resetDb({ path: tempDbPath });
  });

  afterEach(async () => {
    await closeDb();
  });

  it('inicializa banco em arquivo temporário', async () => {
    await initDb({ path: tempDbPath });
    expect(getDbPath()).toBe(tempDbPath);
  });

  it('controla execução diária e lock', async () => {
    const runDate = '2026-06-14';
    expect(await jaExecutouHoje(runDate)).toBe(false);
    expect(await reservarExecucao(runDate)).toBe(true);
    expect(await reservarExecucao(runDate)).toBe(false);

    await registrarExecucao({ runDate, status: 'success', total: 1 });
    expect(await jaExecutouHoje(runDate)).toBe(true);
    expect(await reservarExecucao(runDate)).toBe(false);
  });

  it('permite nova reserva após erro', async () => {
    const runDate = '2026-06-15';
    expect(await reservarExecucao(runDate)).toBe(true);
    await registrarExecucao({ runDate, status: 'error', error: 'falha' });
    expect(await reservarExecucao(runDate)).toBe(true);
  });

  it('faz upsert e retorna apenas concursos novos', async () => {
    const novos1 = await upsertConcursos([concurso]);
    expect(novos1).toHaveLength(1);

    const novos2 = await upsertConcursos([concurso]);
    expect(novos2).toHaveLength(0);
  });

  it('lista concursos vistos na data', async () => {
    await upsertConcursos([concurso]);
    const hoje = new Date().toISOString().slice(0, 10);
    const lista = await listarConcursosRecentes(hoje);
    expect(lista).toHaveLength(1);
    expect(lista[0].cidade).toBe('PIRACICABA');
  });

  it('não reinicializa banco já aberto', async () => {
    await initDb({ path: tempDbPath });
    await initDb({ path: tempDbPath });
    expect(getDbPath()).toBe(tempDbPath);
  });

  it('não reserva quando já houve sucesso', async () => {
    const runDate = '2026-06-16';
    await registrarExecucao({ runDate, status: 'success', total: 1 });
    expect(await reservarExecucao(runDate)).toBe(false);
  });

  it('fecha banco sem instância ativa', async () => {
    await closeDb();
    await expect(closeDb()).resolves.toBeUndefined();
  });

  it('resetDb remove arquivo existente', async () => {
    await closeDb();
    fs.writeFileSync(tempDbPath, 'lixo');
    await resetDb({ path: tempDbPath });
    expect(fs.existsSync(tempDbPath)).toBe(true);
  });

  it('resetDb cria novo arquivo quando inexistente', async () => {
    await closeDb();
    const novoPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-db-new-')), 'fresh.db');
    await resetDb({ path: novoPath });
    expect(fs.existsSync(novoPath)).toBe(true);
  });

  it('resetDb sem options usa caminho padrão', async () => {
    await closeDb();
    await resetDb();
    expect(getDbPath()).toMatch(/data[\\/]concursos\.db$/);
    await closeDb();
  });

  it('resetDb com :memory: não tenta remover arquivo', async () => {
    await closeDb();
    await resetDb({ path: ':memory:' });
    expect(getDbPath()).toBe(':memory:');
  });

  it('initDb usa caminho padrão quando path omitido', async () => {
    await closeDb();
    await initDb();
    expect(getDbPath()).toMatch(/data[\\/]concursos\.db$/);
    await closeDb();
  });

  it('consultas via Knex retornam dados esperados', async () => {
    await upsertConcursos([concurso]);
    const knex = __testing.getKnex();
    const { total } = await knex('concursos').count({ total: '*' }).first();
    expect(Number(total)).toBe(1);

    const links = await knex('concursos').select('link');
    expect(links).toHaveLength(1);
  });

  it('lockExpirado trata data inválida como expirado', () => {
    expect(__testing.lockExpirado('data-invalida')).toBe(true);
  });

  it('libera lock expirado', async () => {
    const runDate = '2020-01-01';
    await reservarExecucao(runDate);

    const expiradoEm = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await __testing.getKnex()('cron_runs')
      .where({ run_date: runDate })
      .update({ executed_at: expiradoEm });

    expect(await reservarExecucao(runDate)).toBe(true);
  });

  it('recusa reserva quando status não permite nova tentativa', async () => {
    const runDate = '2026-06-17';
    await registrarExecucao({ runDate, status: 'success', total: 0 });
    expect(await reservarExecucao(runDate)).toBe(false);
  });

  it('recusa reserva para status desconhecido', async () => {
    const runDate = '2026-06-18';
    await __testing.getKnex()('cron_runs').insert({
      run_date: runDate,
      executed_at: new Date().toISOString(),
      status: 'pendente',
      total_encontrados: 0
    });

    expect(await reservarExecucao(runDate)).toBe(false);
  });
});
