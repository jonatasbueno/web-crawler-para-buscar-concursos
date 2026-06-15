import path from 'path';
import { pathToFileURL } from 'url';
import {
  initDb,
  closeDb,
  jaExecutouHoje,
  reservarExecucao,
  registrarExecucao,
  upsertConcursos,
  listarConcursosRecentes
} from './database/db.js';
import {
  notificarConcursos,
  notificarBloqueio,
  notificarCoberturaVazia,
  notificarRaspagemAvulsa
} from './services/slack.js';
import { BloqueioFonteError } from './utils/spiderHelpers.js';
import { analisarCausaRaiz, ordenarConcursosAvulsa } from './utils/looseScrape.js';
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
  const bloqueios = [];

  for (const spider of spiders) {
    try {
      concursos.push(...await spider.scrape());
    } catch (error) {
      if (error instanceof BloqueioFonteError) {
        bloqueios.push({ fonte: error.fonte, tipo: error.tipo });
      } else {
        falhas.push(`${spider.name}: ${error.message}`);
      }

      console.error(`[${spider.name}] Falha:`, error.message);
    }
  }

  return { concursos, falhas, bloqueios };
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
    const { concursos, falhas, bloqueios } = await coletarConcursos(spiders);

    for (const bloqueio of bloqueios) {
      await notificarBloqueio(bloqueio.fonte, bloqueio.tipo, runDate);
    }

    if (falhas.length === spiders.length && bloqueios.length === 0) {
      throw new Error(falhas.join(' | '));
    }

    const unicos = deduplicarPorLink(concursos);
    const novos = await upsertConcursos(unicos);

    await registrarExecucao({ runDate, status: 'success', total: unicos.length });
    exibirResultados(unicos);

    console.log(`[${motivo}] ${novos.length} concurso(s) novo(s) de ${unicos.length} encontrado(s).`);

    if (unicos.length === 0) {
      await notificarCoberturaVazia(runDate);
    }

    await notificarConcursos(novos, runDate);

    return unicos;
  } catch (error) {
    await registrarExecucao({ runDate, status: 'error', error: error.message });
    console.error(`[${motivo}] Erro na raspagem:`, error.message);
    throw error;
  }
}

export async function executarRaspagemAvulsa(spiders = SPIDERS) {
  const runDate = hojeLocal();

  console.log('[run:loose] Iniciando raspagem avulsa...');

  const { concursos, falhas, bloqueios } = await coletarConcursos(spiders);
  const unicos = ordenarConcursosAvulsa(deduplicarPorLink(concursos));
  const analise = analisarCausaRaiz({
    falhas,
    bloqueios,
    concursos: unicos,
    totalFontes: spiders.length
  });

  exibirResultados(unicos);

  await notificarRaspagemAvulsa({ concursos: unicos, analise, runDate });

  console.log(`[run:loose] ${unicos.length} concurso(s) encontrado(s).`);

  if (falhas.length === spiders.length && bloqueios.length === 0) {
    throw new Error(falhas.join(' | '));
  }

  return { concursos: unicos, falhas, bloqueios };
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
  if (argv.includes('--run-loose')) {
    await executarRaspagemAvulsa();
    return;
  }

  await initDb();

  try {
    if (argv.includes('--list-today')) {
      exibirResultados(await listarConcursosRecentes(hojeLocal()));
      return;
    }

    if (argv.includes('--catch-up')) {
      await verificarExecucaoPendente();
      return;
    }

    await executarRaspagem('systemd-cron');
  } finally {
    await closeDb();
  }
}

/** Detecta se o módulo foi invocado diretamente (node src/cli.js). */
export function isEntryPoint(argv = process.argv, entryUrl = import.meta.url) {
  return Boolean(argv[1] && entryUrl === pathToFileURL(path.resolve(argv[1])).href);
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
