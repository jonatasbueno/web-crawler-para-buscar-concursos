import knex from 'knex';

/** Cria instância Knex configurada para SQLite. */
export function criarConexao(caminho) {
  return knex({
    client: 'sqlite3',
    connection: { filename: caminho },
    useNullAsDefault: true
  });
}
