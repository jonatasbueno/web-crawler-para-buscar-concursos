import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  HTTP_HEADERS,
  encontrarCidade,
  detectarEscolaridade,
  normalizarTexto
} from '../utils/geoFilter.js';

const URL_FONTE = 'https://jcconcursos.com.br/concursos/sp';
const FONTE = 'jcConcursos';

async function scrape() {
  console.log(`[${FONTE}] Iniciando scraping em ${URL_FONTE}...`);

  const { data: html } = await axios.get(URL_FONTE, { headers: HTTP_HEADERS });
  const $ = cheerio.load(html);
  const resultados = [];

  $('.col-12.broken-news-item').each((_, elemento) => {
    const titulo = $(elemento).find('h2').text().trim();
    const href = $(elemento).find('a').attr('href');
    if (!titulo || !href) return;

    const link = href.startsWith('http') ? href : `https://jcconcursos.com.br${href}`;
    const infoTexto = $(elemento).find('.status-execucao').text().trim();
    const status = $(elemento).find('.badge').text().trim();
    const cidadeEncontrada = encontrarCidade(titulo, infoTexto);

    if (!cidadeEncontrada || !normalizarTexto(status).includes('aberta')) return;

    resultados.push({
      orgao: titulo,
      cidade: cidadeEncontrada.toUpperCase(),
      escolaridade: detectarEscolaridade(titulo, infoTexto),
      status,
      link,
      fonte: FONTE
    });
  });

  console.log(`[${FONTE}] ${resultados.length} concursos encontrados.`);
  return resultados;
}

export default { name: FONTE, scrape };
