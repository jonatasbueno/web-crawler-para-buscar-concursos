import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const getMock = jest.fn();

jest.unstable_mockModule('../src/utils/httpClient.js', () => ({
  createHttpClient: () => ({ get: getMock })
}));

const jcConcursos = (await import('../src/spiders/jcConcursos.js')).default;

const HTML_JC = `
<div class="row border-bottom py-3">
  <div class="col-12 col-sm-10">
    <a href="/concurso/concurso-piracicaba-123">
      <h2 class="h4 font-weight-bold mb-2 preview_text">
        Prefeitura de Piracicaba SP
        <span class="badge badge-jcstatus-3">Concurso Aberto</span>
      </h2>
    </a>
    <h3 class="h5 font-weight-normal mb-0 preview_text">Vagas para nível superior</h3>
  </div>
</div>
<div class="row border-bottom py-3">
  <div class="col-12 col-sm-10">
    <a href="https://evil.com/x">
      <h2 class="h4 preview_text">Concurso Evil <span class="badge">Concurso Aberto</span></h2>
    </a>
  </div>
</div>
<div class="row border-bottom py-3">
  <div class="col-12 col-sm-10">
    <a href="/concurso/concurso-campinas-456">
      <h2 class="h4 preview_text">Prefeitura de Campinas <span class="badge">Encerrado</span></h2>
    </a>
  </div>
</div>
<div class="row border-bottom py-3">
  <div class="col-12 col-sm-10">
    <a href="/concurso/concurso-vazio">
      <h2 class="h4 preview_text"><span class="badge">Concurso Aberto</span></h2>
    </a>
  </div>
</div>
<div class="row border-bottom py-3">
  <div class="col-12 col-sm-10">
    <h2 class="h4 preview_text">Prefeitura de Limeira SP <span class="badge">Concurso Aberto</span></h2>
    <a href="/concurso/concurso-limeira-789">detalhes</a>
  </div>
</div>
`;

describe('jcConcursos spider', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(HTML_JC);
  });

  it('extrai concursos válidos e ignora links maliciosos', async () => {
    const resultados = await jcConcursos.scrape();
    expect(resultados).toHaveLength(2);
    expect(resultados[0].cidade).toBe('PIRACICABA');
    expect(resultados[0].orgao).toBe('Prefeitura de Piracicaba SP');
    expect(resultados[0].orgao).not.toContain('Concurso Aberto');
    expect(resultados[0].link).toContain('jcconcursos.com.br');
    expect(resultados.some((item) => item.cidade === 'LIMEIRA')).toBe(true);
  });

  it('ignora cards sem inscrição aberta ou sem cidade alvo', async () => {
    const resultados = await jcConcursos.scrape();
    expect(resultados.some((item) => item.cidade === 'CAMPINAS')).toBe(false);
  });
});
