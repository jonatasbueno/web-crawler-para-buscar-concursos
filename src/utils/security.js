/**
 * Camada de segurança contra SSRF, links maliciosos e injeção no Slack.
 * Somente domínios explicitamente listados podem ser buscados ou exibidos.
 */

const ALLOWED_HOSTS = new Set([
  'jcconcursos.com.br',
  'www.jcconcursos.com.br',
  'pciconcursos.com.br',
  'www.pciconcursos.com.br'
]);

/** Webhook Slack: impede redirecionar notificações para servidores arbitrários. */
const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9_-]+$/;

const MAX_TEXTO = 2000;
const MAX_SLACK_TEXTO = 500;

const PROTOCOLOS_PERIGOSOS = /^(javascript|data|vbscript):/i;

/**
 * Parseia URL restrita a HTTPS sem credenciais embutidas.
 * Retorna null para qualquer entrada inválida ou suspeita.
 */
function parseHttpsUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;

  const urlLimpa = url.trim();

  let parsed;

  try {
    parsed = new URL(urlLimpa);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;

  return parsed;
}

export function pertenceWhitelist(url) {
  const parsed = parseHttpsUrl(url);
  return parsed ? ALLOWED_HOSTS.has(parsed.hostname) : false;
}

export function validateSlackWebhook(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  return SLACK_WEBHOOK_RE.test(url.trim());
}

export function truncarTexto(texto, max = MAX_TEXTO) {
  return String(texto ?? '').slice(0, max);
}

/** Escapa caracteres especiais do mrkdwn do Slack. */
export function sanitizeSlackText(texto, max = MAX_SLACK_TEXTO) {
  return truncarTexto(texto, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Converte href relativo em URL absoluta e valida contra a whitelist.
 * Rejeita protocolos perigosos (javascript:, data:, etc.).
 */
export function normalizarLinkSeguro(href, baseOrigin) {
  if (typeof href !== 'string' || !href.trim()) return null;

  const trimmed = href.trim();
  if (PROTOCOLOS_PERIGOSOS.test(trimmed)) return null;

  const absoluto = resolverUrlAbsoluta(trimmed, baseOrigin);
  return pertenceWhitelist(absoluto) ? absoluto : null;
}

function resolverUrlAbsoluta(href, baseOrigin) {
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `${baseOrigin}${href}`;
  return href;
}
