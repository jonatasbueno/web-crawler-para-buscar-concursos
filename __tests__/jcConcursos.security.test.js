import { describe, it, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../src/utils/security.js', () => ({
  pertenceWhitelist: () => false,
  normalizarLinkSeguro: () => null,
  truncarTexto: (t) => String(t ?? '')
}));

const jcConcursos = (await import('../src/spiders/jcConcursos.js')).default;

describe('jcConcursos segurança', () => {
  it('rejeita fonte não permitida', async () => {
    await expect(jcConcursos.scrape()).rejects.toThrow('Fonte não permitida');
  });
});
