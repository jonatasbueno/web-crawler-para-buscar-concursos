import {
  initDb,
  jaExecutouHoje,
  registrarExecucao,
  upsertConcursos,
  listarConcursosRecentes
} from './database/db.js';
import { notificarConcursos } from './services/slack.js';
import jcConcursos from './spiders/jcConcursos.js';
import pciConcursos from './spiders/pciConcursos.js';
import { hojeLocal, horaLocal } from './utils/geoFilter.js';

const SPIDERS = [jcConcursos, pciConcursos];
const HORA_AGENDADA = 10;

function deduplicarPorLink(concursos) {
  const mapa = new Map();
  for (const concurso of concursos) {
    mapa.set(concurso.link, concurso);
  }
  return [...mapa.values()];
}

export async function executarRaspagem(motivo = 'manual') {
  const runDate = hojeLocal();

  if (await jaExecutouHoje(runDate)) {
    console.log(`[${motivo}] Raspagem de ${runDate} já concluída.`);
    return [];
  }

  console.log(`[${motivo}] Iniciando raspagem diária (${runDate})...`);

  try {
    const todos = [];
    const erros = [];

    for (const spider of SPIDERS) {
      try {
        const items = await spider.scrape();
        todos.push(...items);
      } catch (error) {
        erros.push(`${spider.name}: ${error.message}`);
        console.error(`[${spider.name}] Falha:`, error.message);
      }
    }

    if (erros.length === SPIDERS.length) {
      throw new Error(erros.join(' | '));
    }

    const unicos = deduplicarPorLink(todos);
    await upsertConcursos(unicos);
    await registrarExecucao({ runDate, status: 'success', total: unicos.length });

    exibirResultados(unicos);
    await notificarConcursos(unicos, runDate);

    return unicos;
  } catch (error) {
    await registrarExecucao({
      runDate,
      status: 'error',
      error: error.message
    });
    console.error(`[${motivo}] Erro na raspagem:`, error.message);
    throw error;
  }
}

async function verificarExecucaoPendente() {
  const runDate = hojeLocal();
  if (await jaExecutouHoje(runDate)) {
    console.log(`[catch-up] Raspagem de ${runDate} já concluída.`);
    return;
  }

  if (horaLocal() < HORA_AGENDADA) {
    console.log(`[catch-up] Antes das ${HORA_AGENDADA}h (${horaLocal()}h agora) — timer do sistema executará.`);
    return;
  }

  await executarRaspagem('catch-up boot');
}

function exibirResultados(concursos) {
  console.log(`\n--- CONCURSOS ENCONTRADOS NO RAIO DE 100KM (${concursos.length}) ---`);
  if (concursos.length === 0) {
    console.log('Nenhum concurso com inscrições abertas nesta região hoje.');
    return;
  }
  console.table(concursos, ['cidade', 'orgao', 'escolaridade', 'fonte', 'link']);
}

async function main() {
  await initDb();

  if (process.argv.includes('--list-today')) {
    exibirResultados(await listarConcursosRecentes(hojeLocal()));
    return;
  }

  if (process.argv.includes('--catch-up')) {
    await verificarExecucaoPendente();
    return;
  }

  await executarRaspagem('systemd-cron');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha fatal:', err.message);
    process.exit(1);
  });
