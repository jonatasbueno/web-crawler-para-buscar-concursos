import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Formato IANA simplificado — ex.: America/Sao_Paulo */
const TIMEZONE_RE = /^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)+$/;

/**
 * Garante fuso horário válido antes de usar em Intl.DateTimeFormat.
 * Valores inválidos caem no padrão para evitar crash na inicialização.
 */
export function validarTimezone(timezone) {
  if (typeof timezone !== 'string' || !TIMEZONE_RE.test(timezone.trim())) {
    return DEFAULT_TIMEZONE;
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone.trim() });
    return timezone.trim();
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function lerSlackWebhookUrl() {
  const url = process.env.SLACK_WEBHOOK_URL;
  return typeof url === 'string' ? url : '';
}

export function carregarEnv(envPath = path.join(__dirname, '../../.env')) {
  dotenv.config({ path: envPath, quiet: true, override: true });
  return {
    TIMEZONE: validarTimezone(process.env.TIMEZONE ?? DEFAULT_TIMEZONE),
    SLACK_WEBHOOK_URL: lerSlackWebhookUrl()
  };
}

/** Carregado uma vez na importação do módulo. */
export const { TIMEZONE } = carregarEnv();
