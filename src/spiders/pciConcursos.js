import * as cheerio from 'cheerio';
import {
  encontrarCidade,
  detectarEscolaridade,
  detectarHomeOffice
} from '../utils/concursoFilter.js';
import { createHttpClient } from '../utils/httpClient.js';
import { normalizarLinkSeguro, truncarTexto } from '../utils/security.js';
import { buscarHtml, criarConcurso, logTotalEncontrado } from '../utils/spiderHelpers.js';

// Página regional cobre o raio de 100 km (apenas SP); a nacional alimenta o filtro home office.
const URL_REGIONAL = 'https://www.pciconcursos.com.br/concursos/sudeste';
const URL_NACIONAL = 'https://www.pciconcursos.com.br/concursos/';
const BASE_ORIGIN = 'https://www.pciconcursos.com.br';
const FONTE = 'pciConcursos';

const http = createHttpClient();

function formatarStatus(prazo) {
  if (!prazo) return 'Inscrições Abertas';
  return `Inscrições abertas (até ${prazo.replace(/\s+/g, ' ')})`;
}

/** Extrai os campos comuns de um card `.na`, ou null quando inválido/sem link seguro. */
function lerItem($el) {
  const orgao = truncarTexto($el.find('.ca a').text().trim());
  const titulo = truncarTexto($el.find('.ca a').attr('title') || orgao);
  const href = $el.attr('data-url') || $el.find('.ca a').attr('href');

  if (!orgao || !href) return null;

  const link = normalizarLinkSeguro(href, BASE_ORIGIN);
  if (!link) return null;

  return {
    orgao,
    titulo,
    link,
    uf: $el.find('.cc').text().trim(),
    infoTexto: truncarTexto($el.find('.cd').text().trim()),
    prazo: truncarTexto($el.find('.ce').text().trim())
  };
}

/** Concursos de cidades-alvo no raio de 100 km (somente SP). */
function extrairRegionais($) {
  const resultados = [];

  $('.na').each((_, elemento) => {
    const $el = $(elemento);

    // PCI lista concursos de vários estados — filtramos apenas SP
    if ($el.find('.cc').text().trim() !== 'SP') return;

    const item = lerItem($el);
    if (!item) return;

    const cidade = encontrarCidade(item.titulo, item.orgao, item.link);
    if (!cidade) return;

    resultados.push(criarConcurso({
      orgao: item.orgao,
      cidade,
      escolaridade: detectarEscolaridade(item.titulo, item.infoTexto),
      status: formatarStatus(item.prazo),
      link: item.link,
      fonte: FONTE,
      categoria: 'regional'
    }));
  });

  return resultados;
}

/** Concursos em regime remoto de qualquer lugar do Brasil (sem filtro geográfico). */
function extrairHomeOffice($) {
  const resultados = [];

  $('.na').each((_, elemento) => {
    const $el = $(elemento);
    const item = lerItem($el);
    if (!item) return;

    if (!detectarHomeOffice(item.titulo, item.orgao, item.infoTexto)) return;

    resultados.push(criarConcurso({
      orgao: item.orgao,
      cidade: item.uf ? `Remoto (${item.uf})` : 'Remoto',
      escolaridade: detectarEscolaridade(item.titulo, item.infoTexto),
      status: formatarStatus(item.prazo),
      link: item.link,
      fonte: FONTE,
      categoria: 'homeoffice'
    }));
  });

  return resultados;
}

async function scrape() {
  const [htmlRegional, htmlNacional] = await Promise.all([
    buscarHtml(http, URL_REGIONAL, FONTE),
    buscarHtml(http, URL_NACIONAL, FONTE)
  ]);

  const resultados = [
    ...extrairRegionais(cheerio.load(htmlRegional)),
    ...extrairHomeOffice(cheerio.load(htmlNacional))
  ];

  logTotalEncontrado(FONTE, resultados.length);
  return resultados;
}

export default { name: FONTE, scrape };
