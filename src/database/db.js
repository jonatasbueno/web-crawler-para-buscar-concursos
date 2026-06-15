import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { criarConexao } from './knex.js';
import { criarSchema } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '../../data/concursos.db');

/** Lock expirado após esse tempo — recupera execuções interrompidas (crash, kill). */
const STALE_LOCK_MINUTES = 30;

const TABELAS = {
  CONCURSOS: 'concursos',
  CRON_RUNS: 'cron_runs'
};

const STATUS = {
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error'
};

let knexInstance = null;
let dbPath = DEFAULT_DB_PATH;

function agoraIso() {
  return new Date().toISOString();
}

function lockExpirado(executedAt) {
  const executadoEm = new Date(executedAt).getTime();
  if (Number.isNaN(executadoEm)) return true;

  const limite = Date.now() - STALE_LOCK_MINUTES * 60 * 1000;
  return executadoEm < limite;
}

export async function initDb(options = {}) {
  if (knexInstance) return;

  dbPath = options.path ?? DEFAULT_DB_PATH;

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  knexInstance = criarConexao(dbPath);
  await criarSchema(knexInstance);
}

export async function closeDb() {
  if (!knexInstance) return;

  await knexInstance.destroy();
  knexInstance = null;
}

export async function resetDb(options = {}) {
  await closeDb();
  dbPath = options.path ?? DEFAULT_DB_PATH;

  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  await initDb({ path: dbPath });
}

export async function jaExecutouHoje(runDate) {
  const registro = await knexInstance(TABELAS.CRON_RUNS)
    .where({ run_date: runDate, status: STATUS.SUCCESS })
    .first();

  return Boolean(registro);
}

/**
 * Adquire lock diário para evitar execuções concorrentes.
 *
 * Fluxo: sucesso prévio → recusa; lock ativo recente → recusa;
 * lock expirado ou status error → permite nova tentativa.
 */
export async function reservarExecucao(runDate) {
  if (await jaExecutouHoje(runDate)) return false;

  const registro = await knexInstance(TABELAS.CRON_RUNS)
    .where({ run_date: runDate })
    .first();

  if (registro?.status === STATUS.RUNNING && !lockExpirado(registro.executed_at)) {
    return false;
  }

  if (!registro) {
    await knexInstance(TABELAS.CRON_RUNS).insert({
      run_date: runDate,
      executed_at: agoraIso(),
      status: STATUS.RUNNING,
      total_encontrados: 0
    });
    return true;
  }

  if (registro.status === STATUS.ERROR || registro.status === STATUS.RUNNING) {
    const atualizados = await knexInstance(TABELAS.CRON_RUNS)
      .where({ run_date: runDate })
      .whereIn('status', [STATUS.ERROR, STATUS.RUNNING])
      .update({
        executed_at: agoraIso(),
        status: STATUS.RUNNING,
        error_message: null
      });

    return atualizados > 0;
  }

  return false;
}

export async function registrarExecucao({ runDate, status, total = 0, error = null }) {
  const dados = {
    run_date: runDate,
    executed_at: agoraIso(),
    status,
    total_encontrados: total,
    error_message: error
  };

  await knexInstance(TABELAS.CRON_RUNS)
    .insert(dados)
    .onConflict('run_date')
    .merge({
      executed_at: dados.executed_at,
      status: dados.status,
      total_encontrados: dados.total_encontrados,
      error_message: dados.error_message
    });
}

/** Persiste concursos e retorna apenas os que ainda não existiam (para notificar Slack). */
export async function upsertConcursos(concursos) {
  const novos = [];

  for (const concurso of concursos) {
    const existente = await knexInstance(TABELAS.CONCURSOS)
      .where({ link: concurso.link })
      .first();

    const agora = agoraIso();
    const dados = {
      link: concurso.link,
      orgao: concurso.orgao,
      cidade: concurso.cidade,
      escolaridade: concurso.escolaridade,
      status: concurso.status,
      fonte: concurso.fonte,
      last_seen_at: agora
    };

    if (!existente) {
      await knexInstance(TABELAS.CONCURSOS).insert({
        ...dados,
        first_seen_at: agora
      });
      novos.push(concurso);
      continue;
    }

    await knexInstance(TABELAS.CONCURSOS)
      .where({ link: concurso.link })
      .update(dados);
  }

  return novos;
}

export async function listarConcursosRecentes(runDate) {
  return knexInstance(TABELAS.CONCURSOS)
    .select('orgao', 'cidade', 'escolaridade', 'status', 'link', 'fonte')
    .where('last_seen_at', 'like', `${runDate}%`)
    .orderBy(['cidade', 'orgao']);
}

export function getDbPath() {
  return dbPath;
}

/** @internal exportado apenas para testes */
export const __testing = {
  getKnex: () => knexInstance,
  lockExpirado
};
