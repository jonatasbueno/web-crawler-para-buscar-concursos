import { HTTP_HEADERS } from './geoFilter.js';
import { isAllowedFetchUrl } from './security.js';

/**
 * Baixa HTML de uma fonte pré-aprovada na whitelist de segurança.
 * Centraliza validação + log para evitar repetição nos spiders.
 */
export async function buscarHtml(http, url, fonte) {
  if (!isAllowedFetchUrl(url)) {
    throw new Error(`Fonte não permitida: ${url}`);
  }

  console.log(`[${fonte}] Iniciando scraping em ${url}...`);
  const { data: html } = await http.get(url, { headers: HTTP_HEADERS });
  return html;
}

/** Monta objeto de concurso com campos normalizados para persistência. */
export function criarConcurso({ orgao, cidade, escolaridade, status, link, fonte }) {
  return {
    orgao,
    cidade: cidade.toUpperCase(),
    escolaridade,
    status,
    link,
    fonte
  };
}

export function logTotalEncontrado(fonte, total) {
  console.log(`[${fonte}] ${total} concursos encontrados.`);
}
