import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  HTTP_HEADERS,
  encontrarCidade,
  detectarEscolaridade
} from '../utils/geoFilter.js';

const URL_FONTE = 'https://www.pciconcursos.com.br/concursos/sudeste';
const FONTE = 'pciConcursos';

async function scrape() {
  console.log(`[${FONTE}] Iniciando scraping em ${URL_FONTE}...`);

  const { data: html } = await axios.get(URL_FONTE, { headers: HTTP_HEADERS });
  const $ = cheerio.load(html);
  const resultados = [];

  $('.na').each((_, elemento) => {
    const $el = $(elemento);
    if ($el.find('.cc').text().trim() !== 'SP') return;

    const orgao = $el.find('.ca a').text().trim();
    const titulo = $el.find('.ca a').attr('title') || orgao;
    const link = $el.attr('data-url') || $el.find('.ca a').attr('href');
    if (!orgao || !link) return;

    const infoTexto = $el.find('.cd').text().trim();
    const prazo = $el.find('.ce').text().trim();
    const cidadeEncontrada = encontrarCidade(titulo, orgao, link);

    if (!cidadeEncontrada) return;

    resultados.push({
      orgao,
      cidade: cidadeEncontrada.toUpperCase(),
      escolaridade: detectarEscolaridade(titulo, infoTexto),
      status: prazo ? `Inscrições abertas (até ${prazo.replace(/\s+/g, ' ')})` : 'Inscrições Abertas',
      link,
      fonte: FONTE
    });
  });

  console.log(`[${FONTE}] ${resultados.length} concursos encontrados.`);
  return resultados;
}

export default { name: FONTE, scrape };
