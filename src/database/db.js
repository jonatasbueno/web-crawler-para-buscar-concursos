import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'concursos.db');

let dbInstance = null;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export async function initDb() {
  if (dbInstance) return;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  dbInstance = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });

  await run(`
    CREATE TABLE IF NOT EXISTS concursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link TEXT NOT NULL UNIQUE,
      orgao TEXT NOT NULL,
      cidade TEXT NOT NULL,
      escolaridade TEXT,
      status TEXT,
      fonte TEXT NOT NULL,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_date TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL,
      status TEXT NOT NULL,
      total_encontrados INTEGER DEFAULT 0,
      error_message TEXT
    )
  `);
}

export async function jaExecutouHoje(runDate) {
  const row = await get(
    `SELECT 1 AS ok FROM cron_runs WHERE run_date = ? AND status = 'success'`,
    [runDate]
  );
  return Boolean(row);
}

export async function registrarExecucao({ runDate, status, total = 0, error = null }) {
  await run(
    `
      INSERT INTO cron_runs (run_date, executed_at, status, total_encontrados, error_message)
      VALUES (?, datetime('now'), ?, ?, ?)
      ON CONFLICT(run_date) DO UPDATE SET
        executed_at = excluded.executed_at,
        status = excluded.status,
        total_encontrados = excluded.total_encontrados,
        error_message = excluded.error_message
    `,
    [runDate, status, total, error]
  );
}

export async function upsertConcursos(concursos) {
  for (const concurso of concursos) {
    await run(
      `
        INSERT INTO concursos (link, orgao, cidade, escolaridade, status, fonte, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(link) DO UPDATE SET
          orgao = excluded.orgao,
          cidade = excluded.cidade,
          escolaridade = excluded.escolaridade,
          status = excluded.status,
          fonte = excluded.fonte,
          last_seen_at = datetime('now')
      `,
      [
        concurso.link,
        concurso.orgao,
        concurso.cidade,
        concurso.escolaridade,
        concurso.status,
        concurso.fonte
      ]
    );
  }
}

export async function listarConcursosRecentes(runDate) {
  return all(
    `
      SELECT orgao, cidade, escolaridade, status, link, fonte
      FROM concursos
      WHERE date(last_seen_at) = ?
      ORDER BY cidade, orgao
    `,
    [runDate]
  );
}

export function getDbPath() {
  return DB_PATH;
}
