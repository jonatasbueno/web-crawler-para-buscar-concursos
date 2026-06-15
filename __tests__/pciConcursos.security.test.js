import { describe, it, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../src/utils/security.js', () => ({
  isAllowedFetchUrl: () => false,
  isAllowedLinkUrl: () => false,
  normalizarLinkSeguro: () => null,
  truncarTexto: (t) => String(t ?? '')
}));

const pciConcursos = (await import('../src/spiders/pciConcursos.js')).default;

describe('pciConcursos segurança', () => {
  it('rejeita fonte não permitida', async () => {
    await expect(pciConcursos.scrape()).rejects.toThrow('Fonte não permitida');
  });
});
