import { TIMEZONE } from '../config/env.js';

export { TIMEZONE };

/** Cidades num raio ~100 km de Capivari-SP (chaves normalizadas, sem acento). */
export const CIDADES_ALVO = new Set([
  'capivari', 'piracicaba', 'campinas', 'sorocaba', 'indaiatuba',
  'americana', 'limeira', 'sumare', 'hortolandia', 'itu',
  'jundiai', 'rio claro', 'santa barbara d\'oeste', 'laranjal paulista', 'tiete',
  'porto feliz', 'tatui', 'salto', 'sao pedro', 'rafard', 'elias fausto'
]);

export const ESCOLARIDADES_ALVO = [
  'fundamental', 'medio', 'tecnico', 'superior', 'medio/tecnico'
];

export const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0'
};

/** Remove acentos e padroniza caixa para comparações de texto. */
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Data local no formato ISO (YYYY-MM-DD) respeitando TIMEZONE. */
export function hojeLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

export function horaLocal() {
  return Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false
  }).format(new Date()));
}

/**
 * Identifica cidade-alvo no texto combinado dos campos do concurso.
 *
 * Cidades são testadas da maior para a menor para evitar match parcial
 * (ex.: "campinas" antes de "campina"). O regex exige delimitadores
 * ao redor do nome — evita falso positivo de "itu" dentro de "instituto".
 */
export function encontrarCidade(...textos) {
  const combinado = normalizarTexto(textos.filter(Boolean).join(' '));
  const cidadesOrdenadas = [...CIDADES_ALVO].sort((a, b) => b.length - a.length);

  return cidadesOrdenadas.find((cidade) => {
    const padrao = escaparRegex(cidade).replace(/\s+/g, '\\s+');
    const delimitador = `(?:^|[\\s,.\\-/]|de\\s+)`;
    const regex = new RegExp(`${delimitador}${padrao}(?:$|[\\s,.\\-/])`);
    return regex.test(combinado);
  }) ?? null;
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectarEscolaridade(...textos) {
  const combinado = normalizarTexto(textos.filter(Boolean).join(' '));
  const nivel = ESCOLARIDADES_ALVO.find((item) => combinado.includes(item));

  return nivel
    ? nivel.charAt(0).toUpperCase() + nivel.slice(1)
    : 'Não especificado (Verificar edital)';
}
