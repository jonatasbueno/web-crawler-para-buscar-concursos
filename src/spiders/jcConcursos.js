import * as cheerio from 'cheerio';
import {
  encontrarCidade,
  detectarEscolaridade,
  normalizarTexto
} from '../utils/geoFilter.js';
import { createHttpClient } from '../utils/httpClient.js';
import { normalizarLinkSeguro, truncarTexto } from '../utils/security.js';
import { buscarHtml, criarConcurso, logTotalEncontrado } from '../utils/spiderHelpers.js';

const URL_FONTE = 'https://jcconcursos.com.br/concursos/inscricoes-abertas/SP';
const BASE_ORIGIN = 'https://jcconcursos.com.br';
const FONTE = 'jcConcursos';

const http = createHttpClient();

function extrairConcursos($) {
  const resultados = [];

  $('.row.border-bottom.py-3').each((_, elemento) => {
    const $item = $(elemento);
    const titulo = truncarTexto($item.find('h2.preview_text').text().trim());
    const href = $item.find('a[href^="/concurso/"]').first().attr('href');

    if (!titulo || !href) return;

    const link = normalizarLinkSeguro(href, BASE_ORIGIN);
    if (!link) return;

    const infoTexto = truncarTexto($item.find('h3.preview_text').text().trim());
    const status = truncarTexto($item.find('.badge').first().text().trim());

    if (!status || !normalizarTexto(status).includes('abert')) return;

    const cidade = encontrarCidade(titulo, infoTexto);
    if (!cidade) return;

    resultados.push(criarConcurso({
      orgao: titulo,
      cidade,
      escolaridade: detectarEscolaridade(titulo, infoTexto),
      status,
      link,
      fonte: FONTE
    }));
  });

  return resultados;
}

async function scrape() {
  const html = await buscarHtml(http, URL_FONTE, FONTE);
  const resultados = extrairConcursos(cheerio.load(html));
  logTotalEncontrado(FONTE, resultados.length);
  return resultados;
}

export default { name: FONTE, scrape };
