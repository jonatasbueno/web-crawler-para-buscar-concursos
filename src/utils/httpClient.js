import { pertenceWhitelist } from './security.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

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

async function fetchComLimites(url, options = {}) {
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

/** Cliente HTTP com limites de tamanho, timeout e redirects. */
export function createHttpClient() {
  return {
    get(url, { headers } = {}) {
      return fetchComLimites(url, { method: 'GET', headers });
    }
  };
}

export { fetchComLimites };
