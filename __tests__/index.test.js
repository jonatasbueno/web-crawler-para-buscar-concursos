import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'path';
import { pathToFileURL } from 'url';
import { BloqueioFonteError } from '../src/utils/spiderHelpers.js';

const postMock = jest.fn().mockResolvedValue({ status: 200 });
const getMock = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    create: jest.fn(() => ({ post: postMock })),
    isAxiosError: (error) => Boolean(error?.isAxiosError)
  }
}));

jest.unstable_mockModule('node:https', () => ({
  default: { Agent: jest.fn() }
}));

jest.unstable_mockModule('../src/utils/httpClient.js', () => ({
  createHttpClient: () => ({ get: getMock })
}));

const db = await import('../src/database/db.js');
const index = await import('../src/index.js');

const HTML_PCI = `
<div class="na" data-url="https://www.pciconcursos.com.br/noticias/novo">
  <div class="cc">SP</div>
  <div class="ca"><a href="https://www.pciconcursos.com.br/noticias/novo" title="Prefeitura de Piracicaba">FUMEP Piracicaba</a></div>
  <div class="cd">Superior</div>
  <div class="ce">15/06/2026</div>
</div>
`;

const spiderOk = {
  name: 'mockSpider',
  scrape: jest.fn().mockResolvedValue([{
    orgao: 'Prefeitura de Piracicaba',
    cidade: 'PIRACICABA',
    escolaridade: 'Superior',
    status: 'Aberto',
    link: 'https://www.pciconcursos.com.br/noticias/novo',
    fonte: 'mock'
  }])
};

const spiderFail = {
  name: 'failSpider',
  scrape: jest.fn().mockRejectedValue(new Error('falha'))
};

const spiderBloqueado = {
  name: 'blockedSpider',
  scrape: jest.fn().mockRejectedValue(new BloqueioFonteError('blockedSpider', 'reCAPTCHA'))
};

const spiderVazio = {
  name: 'emptySpider',
  scrape: jest.fn().mockResolvedValue([])
};

describe('index', () => {
  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'table').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    postMock.mockClear();
    getMock.mockReset();
    getMock.mockResolvedValue(HTML_PCI);
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await db.resetDb({ path: ':memory:' });
    spiderOk.scrape.mockClear();
    spiderFail.scrape.mockClear();
    spiderBloqueado.scrape.mockClear();
    spiderVazio.scrape.mockClear();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    delete process.env.SLACK_WEBHOOK_URL;
    await db.closeDb();
  });

  it('deduplica por link', () => {
    const lista = index.deduplicarPorLink([
      { link: 'a', orgao: '1' },
      { link: 'a', orgao: '2' },
      { link: 'b', orgao: '3' }
    ]);
    expect(lista).toHaveLength(2);
    expect(lista.find((c) => c.link === 'a').orgao).toBe('2');
  });

  it('exibe mensagem quando não há concursos', () => {
    index.exibirResultados([]);
    expect(console.log).toHaveBeenCalled();
  });

  it('exibe tabela quando há concursos', () => {
    index.exibirResultados([{
      cidade: 'PIRACICABA',
      orgao: 'Teste',
      escolaridade: 'Superior',
      fonte: 'mock',
      link: 'https://www.pciconcursos.com.br/noticias/x'
    }]);
    expect(console.table).toHaveBeenCalled();
  });

  it('continua quando apenas um spider falha', async () => {
    const resultado = await index.executarRaspagem('teste', [spiderOk, spiderFail]);
    expect(resultado).toHaveLength(1);
  });

  it('executa raspagem com motivo padrão', async () => {
    const { hojeLocal } = await import('../src/utils/geoFilter.js');
    const runDate = hojeLocal();
    await db.reservarExecucao(runDate);
    await db.registrarExecucao({ runDate, status: 'error', error: 'x' });
    await expect(index.executarRaspagem(undefined, [spiderOk])).resolves.toHaveLength(1);
  });

  it('raspagem avulsa falha quando todas as fontes falham', async () => {
    const spiderFail2 = {
      name: 'failSpider2',
      scrape: jest.fn().mockRejectedValue(new Error('outra falha'))
    };

    await expect(index.executarRaspagemAvulsa([spiderFail, spiderFail2])).rejects.toThrow('falha');
  });

  it('executa raspagem avulsa sem persistir no banco', async () => {
    const resultado = await index.executarRaspagemAvulsa([spiderOk]);

    expect(resultado.concursos).toHaveLength(1);
    expect(postMock).toHaveBeenCalled();

    const payload = postMock.mock.calls.at(-1)[1];
    expect(payload.blocks[0].text.text).toBe('Raspagem avulsa de regras de armazenamento');
  });

  it('raspagem avulsa roda mesmo após execução diária', async () => {
    await index.executarRaspagem('teste', [spiderOk]);
    postMock.mockClear();

    const resultado = await index.executarRaspagemAvulsa([spiderOk]);
    expect(resultado.concursos).toHaveLength(1);
    expect(postMock).toHaveBeenCalled();
  });

  it('main executa flag run-loose', async () => {
    postMock.mockClear();
    await index.main(['node', 'cli.js', '--run-loose']);
    expect(postMock).toHaveBeenCalled();
  });

  it('executa raspagem completa com spider mockado', async () => {
    const resultado = await index.executarRaspagem('teste', [spiderOk]);
    expect(resultado).toHaveLength(1);
    expect(postMock).toHaveBeenCalled();
  });

  it('main usa argv padrão', async () => {
    await index.main();
  });

  it('não executa novamente no mesmo dia', async () => {
    await index.executarRaspagem('teste', [spiderOk]);
    const segundo = await index.executarRaspagem('teste', [spiderOk]);
    expect(segundo).toEqual([]);
  });

  it('bloqueia execução concorrente', async () => {
    const { hojeLocal } = await import('../src/utils/geoFilter.js');
    const runDate = hojeLocal();
    await db.reservarExecucao(runDate);
    const resultado = await index.executarRaspagem('teste', [spiderOk]);
    expect(resultado).toEqual([]);
  });

  it('notifica bloqueio e cobertura vazia', async () => {
    await index.executarRaspagem('teste', [spiderBloqueado, spiderVazio]);
    expect(postMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('notifica cobertura vazia sem concursos', async () => {
    await index.executarRaspagem('teste', [spiderVazio]);
    const payloads = postMock.mock.calls.map((call) => call[1]);
    expect(payloads.some((p) => p.blocks[0].text.text.includes('Cobertura vazia'))).toBe(true);
  });

  it('registra erro quando todos os spiders falham', async () => {
    await expect(index.executarRaspagem('teste', [spiderFail])).rejects.toThrow('falha');
  });

  it('verifica catch-up antes das 10h', async () => {
    await index.verificarExecucaoPendente([spiderOk], { data: '2099-01-02', hora: 9 });
    expect(spiderOk.scrape).not.toHaveBeenCalled();
  });

  it('executa catch-up após as 10h', async () => {
    await index.verificarExecucaoPendente([spiderOk], { data: '2099-01-03', hora: 11 });
    expect(spiderOk.scrape).toHaveBeenCalled();
  });

  it('catch-up ignora dia já concluído', async () => {
    await db.registrarExecucao({ runDate: '2099-01-04', status: 'success', total: 0 });
    await index.verificarExecucaoPendente([spiderOk], { data: '2099-01-04', hora: 11 });
    expect(spiderOk.scrape).not.toHaveBeenCalled();
  });

  it('main respeita flags de CLI', async () => {
    await index.main(['node', 'index.js', '--list-today']);
    await index.main(['node', 'index.js', '--catch-up']);
    await index.main(['node', 'index.js']);
    expect(console.log).toHaveBeenCalled();
  });

  it('identifica entrypoint', () => {
    const cliUrl = pathToFileURL(path.resolve('src/cli.js')).href;
    expect(index.isEntryPoint(['node', '/tmp/outro.js'], cliUrl)).toBe(false);
    expect(index.isEntryPoint(['node', 'src/cli.js'], cliUrl)).toBe(true);
    expect(typeof index.isEntryPoint()).toBe('boolean');
  });

  it('runCli usa parâmetros padrão', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    await index.runCli(['node', 'src/index.js', '--list-today']);
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('runCli sem argumentos usa argv, exit e runner padrão', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const runner = jest.fn();
    await index.runCli(undefined, exitSpy, runner);
    expect(runner).toHaveBeenCalledWith(process.argv);
    exitSpy.mockRestore();
  });

  it('runCli usa exit padrão quando omitido', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    await index.runCli(['node', 'src/index.js', '--list-today'], undefined, async () => {});
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('runCli usa exit e runner padrão', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    await index.runCli(['node', 'src/index.js', '--list-today'], exitSpy);
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('runCli encerra com sucesso', async () => {
    const exit = jest.fn();
    await index.runCli(['node', 'src/index.js', '--list-today'], exit);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('runCli encerra com erro', async () => {
    const exit = jest.fn();
    await index.runCli(['node', 'src/index.js'], exit, async () => {
      throw new Error('boom');
    });
    expect(exit).toHaveBeenCalledWith(1);
  });
});
