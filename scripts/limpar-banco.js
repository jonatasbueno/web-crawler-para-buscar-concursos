#!/usr/bin/env node
/**
 * Remove todos os registros do banco SQLite (concursos e cron_runs).
 * Uso: npm run db:clear -- --yes
 */
import { initDb, closeDb, limparRegistros, getDbPath } from '../src/database/db.js';

const args = process.argv.slice(2);
const confirmado = args.includes('--yes') || args.includes('-y');

if (!confirmado) {
  console.error('Esta operação remove todos os registros do banco de dados.');
  console.error('Para confirmar, execute: npm run db:clear -- --yes');
  process.exit(1);
}

try {
  await initDb();
  const removidos = await limparRegistros();

  console.log(`Banco em ${getDbPath()} limpo.`);
  console.log(`  concursos: ${removidos.concursos} removido(s)`);
  console.log(`  cron_runs: ${removidos.cronRuns} removido(s)`);
} catch (error) {
  console.error('Falha ao limpar banco:', error.message);
  process.exit(1);
} finally {
  await closeDb();
}
