import axios from 'axios';
import { isAllowedFetchUrl } from './security.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

/**
 * Monta URL final da requisição (absoluta ou relativa ao baseURL)
 * e bloqueia hosts fora da whitelist — última barreira contra SSRF.
 */
export function validateRequestConfig(config) {
  const url = config.url?.startsWith('http')
    ? config.url
    : `${config.baseURL ?? ''}${config.url ?? ''}`;

  if (!isAllowedFetchUrl(url)) {
    throw new Error(`URL não permitida: ${url}`);
  }

  return config;
}

export function attachRequestGuard(client) {
  client.interceptors.request.use(validateRequestConfig);
  return client;
}

/** Cliente HTTP com limites de tamanho, timeout e redirects. */
export function createHttpClient() {
  return attachRequestGuard(axios.create({
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
    timeout: TIMEOUT_MS,
    maxRedirects: 3,
    validateStatus: (status) => status >= 200 && status < 400
  }));
}
