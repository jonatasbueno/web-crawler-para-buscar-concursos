import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const getMock = jest.fn();

jest.unstable_mockModule('../src/utils/httpClient.js', () => ({
  createHttpClient: () => ({ get: getMock })
}));

const jcConcursos = (await import('../src/spiders/jcConcursos.js')).default;

const HTML_JC = `
<div class="col-12 broken-news-item">
  <h2>Concurso Prefeitura de Piracicaba SP</h2>
  <a href="/concursos/piracicaba">ver</a>
  <div class="status-execucao">info</div>
  <span class="badge">Inscrições Abertas</span>
</div>
<div class="col-12 broken-news-item">
  <h2>Concurso Evil</h2>
  <a href="https://evil.com/x">ver</a>
  <div class="status-execucao"></div>
  <span class="badge">Inscrições Abertas</span>
</div>
<div class="col-12 broken-news-item">
  <h2>Concurso Fechado em Campinas</h2>
  <a href="/concursos/campinas">ver</a>
  <div class="status-execucao"></div>
  <span class="badge">Encerrado</span>
</div>
<div class="col-12 broken-news-item">
  <h2></h2>
  <a href="/concursos/vazio">ver</a>
  <span class="badge">Inscrições Abertas</span>
</div>
`;

describe('jcConcursos spider', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(HTML_JC);
  });

  it('extrai concursos válidos e ignora links maliciosos', async () => {
    const resultados = await jcConcursos.scrape();
    expect(resultados).toHaveLength(1);
    expect(resultados[0].cidade).toBe('PIRACICABA');
    expect(resultados[0].link).toContain('jcconcursos.com.br');
  });

  it('ignora cards sem inscrição aberta ou sem cidade alvo', async () => {
    const resultados = await jcConcursos.scrape();
    expect(resultados.some((item) => item.cidade === 'CAMPINAS')).toBe(false);
  });
});
