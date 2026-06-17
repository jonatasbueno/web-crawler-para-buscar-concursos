import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const getMock = jest.fn();

jest.unstable_mockModule('../src/utils/httpClient.js', () => ({
  createHttpClient: () => ({ get: getMock })
}));

const jcConcursos = (await import('../src/spiders/jcConcursos.js')).default;

const HTML_JC_REGIONAL = `
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
<div class="row border-bottom py-3">
  <div class="col-12 col-sm-10">
    <a href="/concurso/concurso-manaus-321">
      <h2 class="h4 preview_text">Prefeitura de Manaus AM <span class="badge">Concurso Aberto</span></h2>
    </a>
  </div>
</div>
`;

// Página nacional: alimenta o filtro home office (qualquer estado).
const HTML_JC_NACIONAL = `
<div class="row border-bottom py-3">
  <div class="col-12 col-sm-10">
    <a href="/concurso/concurso-remoto-999">
      <h2 class="h4 preview_text">Tribunal Regional Federal — Teletrabalho <span class="badge">Concurso Aberto</span></h2>
    </a>
    <h3 class="h5 preview_text">Vagas em regime remoto</h3>
  </div>
</div>
<div class="row border-bottom py-3">
  <div class="col-12 col-sm-10">
    <a href="/concurso/concurso-presencial-bahia">
      <h2 class="h4 preview_text">Prefeitura presencial da Bahia <span class="badge">Concurso Aberto</span></h2>
    </a>
  </div>
</div>
`;

describe('jcConcursos spider', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation((url) =>
      Promise.resolve(url.endsWith('/SP') ? HTML_JC_REGIONAL : HTML_JC_NACIONAL)
    );
  });

  it('extrai concursos válidos e ignora links maliciosos', async () => {
    const resultados = await jcConcursos.scrape();
    const regionais = resultados.filter((item) => item.categoria === 'regional');
    expect(regionais).toHaveLength(2);
    expect(regionais[0].cidade).toBe('PIRACICABA');
    expect(regionais[0].orgao).toBe('Prefeitura de Piracicaba SP');
    expect(regionais[0].orgao).not.toContain('Concurso Aberto');
    expect(regionais[0].link).toContain('jcconcursos.com.br');
    expect(regionais.some((item) => item.cidade === 'LIMEIRA')).toBe(true);
  });

  it('ignora cards sem inscrição aberta ou sem cidade alvo', async () => {
    const resultados = await jcConcursos.scrape();
    expect(resultados.some((item) => item.cidade === 'CAMPINAS')).toBe(false);
  });

  it('extrai vagas home office nacionais em regime remoto', async () => {
    const resultados = await jcConcursos.scrape();
    const homeOffice = resultados.filter((item) => item.categoria === 'homeoffice');
    expect(homeOffice).toHaveLength(1);
    expect(homeOffice[0].cidade).toBe('REMOTO');
    expect(homeOffice[0].orgao).toContain('Teletrabalho');
  });
});
