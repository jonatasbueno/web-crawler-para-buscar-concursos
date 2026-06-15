import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const getMock = jest.fn();

jest.unstable_mockModule('../src/utils/httpClient.js', () => ({
  createHttpClient: () => ({ get: getMock })
}));

const pciConcursos = (await import('../src/spiders/pciConcursos.js')).default;

const HTML_PCI = `
<div class="na">
  <div class="cc">SP</div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/somente-href" title="Prefeitura de Limeira">Prefeitura de Limeira</a></div>
  <div class="cd">Médio</div>
  <div class="ce">20/06/2026</div>
</div>
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/fumep">
  <div class="cc">SP</div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/fumep" title="FUMEP Piracicaba">FUMEP - Fundação Municipal de Ensino de Piracicaba</a></div>
  <div class="cd">Superior</div>
  <div class="ce">15/06/2026</div>
</div>
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/sem-prazo">
  <div class="cc">SP</div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/sem-prazo" title="Prefeitura de Campinas">Prefeitura de Campinas</a></div>
  <div class="cd">Superior</div>
</div>
<div class="na" data-url="https://evil.com/x">
  <div class="cc">SP</div>
  <div class="ca"><a href="https://evil.com/x">Evil</a></div>
</div>
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/rj">
  <div class="cc">RJ</div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/rj">RJ</a></div>
</div>
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/sem-orgao">
  <div class="cc">SP</div>
  <div class="ca"><a></a></div>
</div>
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/sem-cidade">
  <div class="cc">SP</div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/sem-cidade" title="Orgão sem cidade">Orgão sem cidade</a></div>
  <div class="cd">Superior</div>
</div>
`;

describe('pciConcursos spider', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({ data: HTML_PCI });
  });

  it('extrai concursos de SP e rejeita links inválidos', async () => {
    const resultados = await pciConcursos.scrape();
    expect(resultados).toHaveLength(3);
    expect(resultados.some((item) => item.cidade === 'PIRACICABA')).toBe(true);
    expect(resultados.some((item) => item.cidade === 'CAMPINAS')).toBe(true);
    expect(resultados.some((item) => item.cidade === 'LIMEIRA')).toBe(true);
    expect(resultados.some((item) => item.status === 'Inscrições Abertas')).toBe(true);
  });
});
