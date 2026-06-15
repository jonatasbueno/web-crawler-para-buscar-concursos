import { HTTP_HEADERS } from './geoFilter.js';
import { pertenceWhitelist } from './security.js';

const PADROES_BLOQUEIO = [
  { tipo: 'reCAPTCHA', re: /g-recaptcha|google\.com\/recaptcha|recaptcha\/api/i },
  { tipo: 'Cloudflare Turnstile', re: /cf-turnstile|challenges\.cloudflare\.com/i },
  { tipo: 'hCaptcha', re: /hcaptcha\.com|h-captcha/i },
  { tipo: 'Cloudflare', re: /cf-browser-verification|challenge-platform|__cf_chl/i },
  { tipo: 'Captcha genérico', re: /<title[^>]*>.*captcha.*<\/title>/i },
  { tipo: 'Acesso negado', re: /access denied|acesso negado|403 forbidden/i },
  { tipo: 'Verificação anti-bot', re: /bot detection|verifica[cç][aã]o de seguran[cç]a|security check/i }
];

export class BloqueioFonteError extends Error {
  constructor(fonte, tipo) {
    super(`Bloqueio detectado em ${fonte}: ${tipo}`);
    this.name = 'BloqueioFonteError';
    this.fonte = fonte;
    this.tipo = tipo;
  }
}

export function detectarBloqueio(html) {
  if (typeof html !== 'string' || !html.trim()) return null;

  for (const { tipo, re } of PADROES_BLOQUEIO) {
    if (re.test(html)) return tipo;
  }

  return null;
}

/**
 * Baixa HTML de uma fonte pré-aprovada na whitelist de segurança.
 * Centraliza validação + log para evitar repetição nos spiders.
 */
export async function buscarHtml(http, url, fonte) {
  if (!pertenceWhitelist(url)) {
    throw new Error(`Fonte não permitida: ${url}`);
  }

  console.log(`[${fonte}] Iniciando scraping em ${url}...`);
  const html = await http.get(url, { headers: HTTP_HEADERS });

  const bloqueio = detectarBloqueio(html);
  if (bloqueio) {
    throw new BloqueioFonteError(fonte, bloqueio);
  }

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
