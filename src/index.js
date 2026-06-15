import path from 'path';
import { pathToFileURL } from 'url';
import {
  initDb,
  jaExecutouHoje,
  reservarExecucao,
  registrarExecucao,
  upsertConcursos,
  listarConcursosRecentes
} from './database/db.js';
import { notificarConcursos } from './services/slack.js';
import jcConcursos from './spiders/jcConcursos.js';
import pciConcursos from './spiders/pciConcursos.js';
import { hojeLocal, horaLocal } from './utils/geoFilter.js';

export const SPIDERS = [jcConcursos, pciConcursos];
export const HORA_AGENDADA = 10;

const COLUNAS_EXIBICAO = ['cidade', 'orgao', 'escolaridade', 'fonte', 'link'];

/** Mantém o último registro quando o mesmo link aparece em fontes diferentes. */
export function deduplicarPorLink(concursos) {
  const porLink = new Map(concursos.map((c) => [c.link, c]));
  return [...porLink.values()];
}

/**
 * Executa todos os spiders, tolerando falha parcial.
 * Só aborta quando nenhuma fonte responde.
 */
async function coletarConcursos(spiders) {
  const concursos = [];
  const falhas = [];

  for (const spider of spiders) {
    try {
      concursos.push(...await spider.scrape());
    } catch (error) {
      falhas.push(`${spider.name}: ${error.message}`);
      console.error(`[${spider.name}] Falha:`, error.message);
    }
  }

  return { concursos, falhas };
}

export async function executarRaspagem(motivo = 'manual', spiders = SPIDERS) {
  const runDate = hojeLocal();

  if (await jaExecutouHoje(runDate)) {
    console.log(`[${motivo}] Raspagem de ${runDate} já concluída.`);
    return [];
  }

  if (!(await reservarExecucao(runDate))) {
    console.log(`[${motivo}] Execução já em andamento ou concluída para ${runDate}.`);
    return [];
  }

  console.log(`[${motivo}] Iniciando raspagem diária (${runDate})...`);

  try {
    const { concursos, falhas } = await coletarConcursos(spiders);

    if (falhas.length === spiders.length) {
      throw new Error(falhas.join(' | '));
    }

    const unicos = deduplicarPorLink(concursos);
    const novos = await upsertConcursos(unicos);

    await registrarExecucao({ runDate, status: 'success', total: unicos.length });
    exibirResultados(unicos);

    console.log(`[${motivo}] ${novos.length} concurso(s) novo(s) de ${unicos.length} encontrado(s).`);
    await notificarConcursos(novos, runDate);

    return unicos;
  } catch (error) {
    await registrarExecucao({ runDate, status: 'error', error: error.message });
    console.error(`[${motivo}] Erro na raspagem:`, error.message);
    throw error;
  }
}

/**
 * Catch-up no boot: se passou das 10h e o dia ainda não rodou, executa agora.
 * Antes das 10h delega ao timer do systemd.
 */
export async function verificarExecucaoPendente(
  spiders = SPIDERS,
  agora = { data: hojeLocal(), hora: horaLocal() }
) {
  if (await jaExecutouHoje(agora.data)) {
    console.log(`[catch-up] Raspagem de ${agora.data} já concluída.`);
    return;
  }

  if (agora.hora < HORA_AGENDADA) {
    console.log(`[catch-up] Antes das ${HORA_AGENDADA}h (${agora.hora}h agora) — timer do sistema executará.`);
    return;
  }

  await executarRaspagem('catch-up boot', spiders);
}

export function exibirResultados(concursos) {
  console.log(`\n--- CONCURSOS ENCONTRADOS NO RAIO DE 100KM (${concursos.length}) ---`);

  if (concursos.length === 0) {
    console.log('Nenhum concurso com inscrições abertas nesta região hoje.');
    return;
  }

  console.table(concursos, COLUNAS_EXIBICAO);
}

export async function main(argv = process.argv) {
  await initDb();

  if (argv.includes('--list-today')) {
    exibirResultados(await listarConcursosRecentes(hojeLocal()));
    return;
  }

  if (argv.includes('--catch-up')) {
    await verificarExecucaoPendente();
    return;
  }

  await executarRaspagem('systemd-cron');
}

/** Detecta se o módulo foi invocado diretamente (node src/cli.js). */
export function isEntryPoint(argv = process.argv) {
  return Boolean(argv[1] && import.meta.url === pathToFileURL(path.resolve(argv[1])).href);
}

export async function runCli(argv = process.argv, exit = process.exit.bind(process), runner = main) {
  try {
    await runner(argv);
    exit(0);
  } catch (err) {
    console.error('Falha fatal:', err.message);
    exit(1);
  }
}
