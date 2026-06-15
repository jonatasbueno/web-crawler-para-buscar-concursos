/**
 * Definição das tabelas via Knex Schema Builder.
 * Substitui CREATE TABLE em SQL cru.
 */

export async function criarSchema(knex) {
  const temConcursos = await knex.schema.hasTable('concursos');
  if (!temConcursos) {
    await knex.schema.createTable('concursos', (table) => {
      table.increments('id').primary();
      table.text('link').notNullable().unique();
      table.text('orgao').notNullable();
      table.text('cidade').notNullable();
      table.text('escolaridade');
      table.text('status');
      table.text('fonte').notNullable();
      table.text('first_seen_at').notNullable();
      table.text('last_seen_at').notNullable();
    });
  }

  const temCronRuns = await knex.schema.hasTable('cron_runs');
  if (!temCronRuns) {
    await knex.schema.createTable('cron_runs', (table) => {
      table.increments('id').primary();
      table.text('run_date').notNullable().unique();
      table.text('executed_at').notNullable();
      table.text('status').notNullable();
      table.integer('total_encontrados').defaultTo(0);
      table.text('error_message');
    });
  }
}
