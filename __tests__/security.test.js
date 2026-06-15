import { describe, it, expect } from '@jest/globals';
import {
  isAllowedFetchUrl,
  isAllowedLinkUrl,
  validateSlackWebhook,
  truncarTexto,
  sanitizeSlackText,
  normalizarLinkSeguro
} from '../src/utils/security.js';

describe('security', () => {
  it('valida URLs de fetch permitidas', () => {
    expect(isAllowedFetchUrl('ht!tp://bad')).toBe(false);
    expect(isAllowedFetchUrl('https://jcconcursos.com.br/concursos/sp')).toBe(true);
    expect(isAllowedFetchUrl('https://www.pciconcursos.com.br/concursos/sudeste')).toBe(true);
    expect(isAllowedFetchUrl('http://jcconcursos.com.br/x')).toBe(false);
    expect(isAllowedFetchUrl('https://evil.com/x')).toBe(false);
    expect(isAllowedFetchUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedFetchUrl('')).toBe(false);
    expect(isAllowedFetchUrl(null)).toBe(false);
    expect(isAllowedFetchUrl('https://user:pass@jcconcursos.com.br/x')).toBe(false);
  });

  it('valida links permitidos', () => {
    expect(isAllowedLinkUrl('https://www.pciconcursos.com.br/noticias/x')).toBe(true);
    expect(isAllowedLinkUrl('https://localhost/x')).toBe(false);
    expect(isAllowedLinkUrl('invalido')).toBe(false);
  });

  it('valida webhook do Slack', () => {
    const ok = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    expect(validateSlackWebhook(ok)).toBe(true);
    expect(validateSlackWebhook('https://evil.com/hook')).toBe(false);
    expect(validateSlackWebhook('')).toBe(false);
    expect(validateSlackWebhook(null)).toBe(false);
  });

  it('trunca e sanitiza texto', () => {
    expect(truncarTexto('abcdef', 3)).toBe('abc');
    expect(truncarTexto(null, 3)).toBe('');
    expect(sanitizeSlackText('<script>&')).toBe('&lt;script&gt;&amp;');
    expect(sanitizeSlackText('x'.repeat(600), 10)).toHaveLength(10);
  });

  it('normaliza links seguros', () => {
    expect(normalizarLinkSeguro('/concursos/sp', 'https://jcconcursos.com.br')).toBe(
      'https://jcconcursos.com.br/concursos/sp'
    );
    expect(normalizarLinkSeguro('//www.pciconcursos.com.br/x', 'https://jcconcursos.com.br')).toBe(
      'https://www.pciconcursos.com.br/x'
    );
    expect(normalizarLinkSeguro('https://jcconcursos.com.br/x', 'https://jcconcursos.com.br')).toBe(
      'https://jcconcursos.com.br/x'
    );
    expect(normalizarLinkSeguro('https://jcconcursos.com.br/x')).toBe(
      'https://jcconcursos.com.br/x'
    );
    expect(normalizarLinkSeguro('javascript:alert(1)', 'https://jcconcursos.com.br')).toBeNull();
    expect(normalizarLinkSeguro('data:text/html,x', 'https://jcconcursos.com.br')).toBeNull();
    expect(normalizarLinkSeguro('https://evil.com', 'https://jcconcursos.com.br')).toBeNull();
    expect(normalizarLinkSeguro('', 'https://jcconcursos.com.br')).toBeNull();
    expect(normalizarLinkSeguro(null, 'https://jcconcursos.com.br')).toBeNull();
  });
});
