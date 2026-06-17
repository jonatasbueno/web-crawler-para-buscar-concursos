import * as cheerio from 'cheerio';
import {
  encontrarCidade,
  detectarEscolaridade,
  detectarHomeOffice,
  normalizarTexto
} from '../utils/concursoFilter.js';
import { createHttpClient } from '../utils/httpClient.js';
import { normalizarLinkSeguro, truncarTexto } from '../utils/security.js';
import { buscarHtml, criarConcurso, logTotalEncontrado } from '../utils/spiderHelpers.js';

// Página regional traz só SP (raio 100 km); a nacional alimenta o filtro home office.
const URL_REGIONAL = 'https://jcconcursos.com.br/concursos/inscricoes-abertas/SP';
const URL_NACIONAL = 'https://jcconcursos.com.br/concursos/inscricoes-abertas';
const BASE_ORIGIN = 'https://jcconcursos.com.br';
const FONTE = 'jcConcursos';

const http = createHttpClient();

function extrairTitulo($item) {
  const $titulo = $item.find('h2.preview_text').first().clone();
  $titulo.find('.badge').remove();
  return truncarTexto($titulo.text().trim());
}

/** Extrai campos comuns de um card; null quando inválido, sem link seguro ou encerrado. */
function lerItem($item) {
  const titulo = extrairTitulo($item);
  const href = $item.find('a[href^="/concurso/"]').first().attr('href');

  if (!titulo || !href) return null;

  const link = normalizarLinkSeguro(href, BASE_ORIGIN);
  if (!link) return null;

  const status = truncarTexto($item.find('.badge').first().text().trim());
  if (!status || !normalizarTexto(status).includes('abert')) return null;

  return {
    titulo,
    link,
    status,
    infoTexto: truncarTexto($item.find('h3.preview_text').text().trim())
  };
}

/** Concursos de cidades-alvo no raio de 100 km. */
function extrairRegionais($) {
  const resultados = [];

  $('.row.border-bottom.py-3').each((_, elemento) => {
    const item = lerItem($(elemento));
    if (!item) return;

    const cidade = encontrarCidade(item.titulo, item.infoTexto);
    if (!cidade) return;

    resultados.push(criarConcurso({
      orgao: item.titulo,
      cidade,
      escolaridade: detectarEscolaridade(item.titulo, item.infoTexto),
      status: item.status,
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

  $('.row.border-bottom.py-3').each((_, elemento) => {
    const item = lerItem($(elemento));
    if (!item) return;

    if (!detectarHomeOffice(item.titulo, item.infoTexto)) return;

    resultados.push(criarConcurso({
      orgao: item.titulo,
      cidade: 'Remoto',
      escolaridade: detectarEscolaridade(item.titulo, item.infoTexto),
      status: item.status,
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
