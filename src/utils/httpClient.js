import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pertenceWhitelist } from './security.js';

const execFileAsync = promisify(execFile);

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const CURL_META_RE = /\n__CURL_META__(\d{3})__(.+)__$/s;

/**
 * Valida URL contra a whitelist — última barreira contra SSRF.
 */
export function validarUrlFetch(url) {
  if (!pertenceWhitelist(url)) {
    throw new Error(`URL não permitida: ${url}`);
  }

  return url;
}

async function lerCorpoLimitado(response) {
  const buffer = await response.arrayBuffer();

  if (buffer.byteLength > MAX_BYTES) {
    throw new Error('Resposta excede tamanho máximo permitido');
  }

  return new TextDecoder().decode(buffer);
}

function montarArgsCurl(url, headers = {}) {
  const args = [
    '-sS',
    '-L',
    '--max-redirs',
    String(MAX_REDIRECTS),
    '--max-time',
    String(Math.ceil(TIMEOUT_MS / 1000)),
    '--compressed',
    '-w',
    '\n__CURL_META__%{http_code}__%{url_effective}__'
  ];

  for (const [chave, valor] of Object.entries(headers)) {
    if (valor) args.push('-H', `${chave}: ${valor}`);
  }

  args.push(url);
  return args;
}

function interpretarErroCurl(error) {
  if (error.killed || error.code === 'ABORT_ERR') {
    throw new Error('Timeout na requisição HTTP');
  }

  if (error.code === 28) {
    throw new Error('Timeout na requisição HTTP');
  }

  throw error;
}

function extrairRespostaCurl(stdout) {
  const saida = stdout.toString();
  const match = saida.match(CURL_META_RE);

  if (!match) {
    throw new Error('Resposta inválida do curl');
  }

  const status = Number(match[1]);
  const urlFinal = match[2].trim();
  const corpo = saida.replace(CURL_META_RE, '');

  if (corpo.length > MAX_BYTES) {
    throw new Error('Resposta excede tamanho máximo permitido');
  }

  return { status, urlFinal, corpo };
}

/**
 * Fallback para sites protegidos por Cloudflare que bloqueiam o TLS do Node.js.
 * Usa curl do sistema (fingerprint TLS de cliente real).
 */
async function fetchComCurl(url, options = {}) {
  validarUrlFetch(url);

  try {
    const { stdout } = await execFileAsync(
      'curl',
      montarArgsCurl(url, options.headers),
      { maxBuffer: MAX_BYTES + 256 }
    );

    const { status, urlFinal, corpo } = extrairRespostaCurl(stdout);

    if (!pertenceWhitelist(urlFinal)) {
      throw new Error(`Redirect para URL não permitida: ${urlFinal}`);
    }

    if (status < 200 || status >= 400) {
      throw new Error(`HTTP ${status}`);
    }

    return corpo;
  } catch (error) {
    interpretarErroCurl(error);
  }
}

async function fetchNativo(url, options = {}) {
  validarUrlFetch(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let currentUrl = url;
    let redirects = 0;

    while (true) {
      const response = await fetch(currentUrl, {
        ...options,
        signal: controller.signal,
        redirect: 'manual'
      });

      if (response.status >= 300 && response.status < 400) {
        if (redirects >= MAX_REDIRECTS) {
          throw new Error('Muitos redirects');
        }

        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect sem header Location');

        currentUrl = new URL(location, currentUrl).href;
        validarUrlFetch(currentUrl);
        redirects++;
        continue;
      }

      if (response.status < 200 || response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }

      return lerCorpoLimitado(response);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Timeout na requisição HTTP');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchComLimites(url, options) {
  try {
    return await fetchNativo(url, options);
  } catch (error) {
    if (error.message === 'HTTP 403') {
      return fetchComCurl(url, options);
    }

    throw error;
  }
}

/** Cliente HTTP com limites de tamanho, timeout e redirects. */
export function createHttpClient() {
  return {
    get(url, { headers } = {}) {
      return fetchComLimites(url, { method: 'GET', headers });
    }
  };
}

export { fetchComLimites, fetchComCurl };
