import { describe, it, expect, jest } from '@jest/globals';
import {
  detectarBloqueio,
  BloqueioFonteError,
  buscarHtml
} from '../src/utils/spiderHelpers.js';

describe('spiderHelpers', () => {
  it('detecta reCAPTCHA no HTML', () => {
    expect(detectarBloqueio('<div class="g-recaptcha"></div>')).toBe('reCAPTCHA');
  });

  it('detecta Cloudflare', () => {
    expect(detectarBloqueio('<div id="cf-browser-verification"></div>')).toBe('Cloudflare');
  });

  it('retorna null para HTML vazio ou inválido', () => {
    expect(detectarBloqueio('')).toBeNull();
    expect(detectarBloqueio('   ')).toBeNull();
    expect(detectarBloqueio(null)).toBeNull();
  });

  it('detecta demais padrões de bloqueio', () => {
    expect(detectarBloqueio('<div class="cf-turnstile"></div>')).toBe('Cloudflare Turnstile');
    expect(detectarBloqueio('<title>Complete o captcha</title>')).toBe('Captcha genérico');
    expect(detectarBloqueio('<h1>Access Denied</h1>')).toBe('Acesso negado');
    expect(detectarBloqueio('<p>verificação de segurança</p>')).toBe('Verificação anti-bot');
  });

  it('detecta hCaptcha', () => {
    expect(detectarBloqueio('<script src="https://hcaptcha.com/1/api.js"></script>')).toBe('hCaptcha');
  });

  it('lança BloqueioFonteError quando bloqueio é detectado', async () => {
    const http = {
      get: jest.fn().mockResolvedValue('<script src="https://www.google.com/recaptcha/api.js"></script>')
    };

    await expect(
      buscarHtml(http, 'https://jcconcursos.com.br/concursos/sp', 'jcConcursos')
    ).rejects.toBeInstanceOf(BloqueioFonteError);
  });

  it('rejeita fonte não permitida', async () => {
    const http = { get: jest.fn() };
    await expect(
      buscarHtml(http, 'https://evil.com/x', 'evil')
    ).rejects.toThrow('Fonte não permitida');
  });
});
