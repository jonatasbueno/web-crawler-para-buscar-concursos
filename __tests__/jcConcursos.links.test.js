import { describe, it, expect, jest } from '@jest/globals';

const getMock = jest.fn();

jest.unstable_mockModule('../src/utils/httpClient.js', () => ({
  createHttpClient: () => ({ get: getMock })
}));

jest.unstable_mockModule('../src/utils/security.js', () => ({
  pertenceWhitelist: (url) => String(url).includes('jcconcursos.com.br'),
  normalizarLinkSeguro: (href) => (href === '/concurso/bloqueado' ? null : `https://jcconcursos.com.br${href}`),
  truncarTexto: (t) => String(t ?? '')
}));

const jcConcursos = (await import('../src/spiders/jcConcursos.js')).default;

const HTML_LINK_BLOQUEADO = `
<div class="row border-bottom py-3">
  <a href="/concurso/bloqueado">
    <h2 class="h4 preview_text">Prefeitura de Piracicaba SP <span class="badge">Concurso Aberto</span></h2>
  </a>
  <h3 class="preview_text">Vagas para nível superior</h3>
</div>
`;

describe('jcConcursos links', () => {
  it('ignora href que falha na normalização segura', async () => {
    getMock.mockResolvedValue(HTML_LINK_BLOQUEADO);
    const resultados = await jcConcursos.scrape();
    expect(resultados).toHaveLength(0);
  });
});
