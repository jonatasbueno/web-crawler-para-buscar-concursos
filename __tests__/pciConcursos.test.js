import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const getMock = jest.fn();

jest.unstable_mockModule('../src/utils/httpClient.js', () => ({
  createHttpClient: () => ({ get: getMock })
}));

const pciConcursos = (await import('../src/spiders/pciConcursos.js')).default;

const HTML_PCI_REGIONAL = `
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

// Página nacional: alimenta o filtro home office (qualquer estado).
const HTML_PCI_NACIONAL = `
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/remoto-rj">
  <div class="cc">RJ</div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/remoto-rj" title="Tribunal Federal em regime de teletrabalho">Tribunal Federal</a></div>
  <div class="cd">Superior</div>
  <div class="ce">30/06/2026</div>
</div>
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/remoto-sem-uf">
  <div class="cc"></div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/remoto-sem-uf" title="Autarquia com vagas home office">Autarquia</a></div>
  <div class="cd">Médio</div>
</div>
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/presencial">
  <div class="cc">BA</div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/presencial" title="Prefeitura presencial da Bahia">Prefeitura</a></div>
  <div class="cd">Médio</div>
</div>
<div class="na">
  <div class="cc">PR</div>
  <div class="ca"><a></a></div>
</div>
`;

describe('pciConcursos spider', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation((url) =>
      Promise.resolve(url.includes('/sudeste') ? HTML_PCI_REGIONAL : HTML_PCI_NACIONAL)
    );
  });

  it('extrai concursos de SP e rejeita links inválidos', async () => {
    const resultados = await pciConcursos.scrape();
    const regionais = resultados.filter((item) => item.categoria === 'regional');
    expect(regionais).toHaveLength(3);
    expect(regionais.some((item) => item.cidade === 'PIRACICABA')).toBe(true);
    expect(regionais.some((item) => item.cidade === 'CAMPINAS')).toBe(true);
    expect(regionais.some((item) => item.cidade === 'LIMEIRA')).toBe(true);
    expect(regionais.some((item) => item.status === 'Inscrições Abertas')).toBe(true);
  });

  it('extrai vagas home office nacionais com e sem UF', async () => {
    const resultados = await pciConcursos.scrape();
    const homeOffice = resultados.filter((item) => item.categoria === 'homeoffice');
    expect(homeOffice).toHaveLength(2);
    expect(homeOffice.some((item) => item.cidade === 'REMOTO (RJ)')).toBe(true);
    expect(homeOffice.some((item) => item.cidade === 'REMOTO')).toBe(true);
    expect(homeOffice.some((item) => item.cidade.includes('BA'))).toBe(false);
  });
});
