import * as cheerio from 'cheerio';
import {
  encontrarCidade,
  detectarEscolaridade
} from '../utils/geoFilter.js';
import { createHttpClient } from '../utils/httpClient.js';
import { normalizarLinkSeguro, truncarTexto } from '../utils/security.js';
import { buscarHtml, criarConcurso, logTotalEncontrado } from '../utils/spiderHelpers.js';

const URL_FONTE = 'https://www.pciconcursos.com.br/concursos/sudeste';
const BASE_ORIGIN = 'https://www.pciconcursos.com.br';
const FONTE = 'pciConcursos';

const http = createHttpClient();

function formatarStatus(prazo) {
  if (!prazo) return 'Inscrições Abertas';
  return `Inscrições abertas (até ${prazo.replace(/\s+/g, ' ')})`;
}

function extrairConcursos($) {
  const resultados = [];

  $('.na').each((_, elemento) => {
    const $el = $(elemento);

    // PCI lista concursos de vários estados — filtramos apenas SP
    if ($el.find('.cc').text().trim() !== 'SP') return;

    const orgao = truncarTexto($el.find('.ca a').text().trim());
    const titulo = truncarTexto($el.find('.ca a').attr('title') || orgao);
    const href = $el.attr('data-url') || $el.find('.ca a').attr('href');

    if (!orgao || !href) return;

    const link = normalizarLinkSeguro(href, BASE_ORIGIN);
    if (!link) return;

    const infoTexto = truncarTexto($el.find('.cd').text().trim());
    const prazo = truncarTexto($el.find('.ce').text().trim());
    const cidade = encontrarCidade(titulo, orgao, link);

    if (!cidade) return;

    resultados.push(criarConcurso({
      orgao,
      cidade,
      escolaridade: detectarEscolaridade(titulo, infoTexto),
      status: formatarStatus(prazo),
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
