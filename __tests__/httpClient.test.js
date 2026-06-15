import { describe, it, expect, jest } from '@jest/globals';

const fetchMock = jest.fn();
const execFileMock = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  execFile: execFileMock
}));

global.fetch = fetchMock;

const { createHttpClient, validarUrlFetch, fetchComLimites, fetchComCurl } = await import('../src/utils/httpClient.js');

function mockResponse({ status = 200, body = '<html></html>', headers = {} } = {}) {
  return {
    status,
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null
    },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer
  };
}

describe('httpClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    execFileMock.mockReset();
    fetchMock.mockResolvedValue(mockResponse());
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      callback(null, { stdout: '<html>curl</html>\n__CURL_META__200__https://jcconcursos.com.br/x__' });
    });
  });

  it('cria cliente HTTP com método get', async () => {
    const client = createHttpClient();
    const html = await client.get('https://jcconcursos.com.br/concursos/sp');
    expect(html).toBe('<html></html>');
    expect(fetchMock).toHaveBeenCalled();
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('GET');
  });

  it('rejeita URL não permitida', () => {
    expect(() => validarUrlFetch('https://evil.com/x')).toThrow('URL não permitida');
  });

  it('aceita URL absoluta permitida', () => {
    expect(validarUrlFetch('https://jcconcursos.com.br/concursos/sp')).toContain('jcconcursos');
  });

  it('segue redirect validado', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 302, headers: { location: '/concursos/sp' } }))
      .mockResolvedValueOnce(mockResponse({ body: '<html>ok</html>' }));

    const client = createHttpClient();
    const html = await client.get('https://jcconcursos.com.br/');
    expect(html).toBe('<html>ok</html>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('usa curl como fallback em HTTP 403', async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: 403 }));
    const client = createHttpClient();
    const html = await client.get('https://jcconcursos.com.br/concursos/sp', {
      headers: { 'User-Agent': 'test' }
    });
    expect(html).toBe('<html>curl</html>');
    expect(execFileMock).toHaveBeenCalled();
  });

  it('rejeita redirect do curl para host não permitido', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      callback(null, { stdout: '<html></html>\n__CURL_META__200__https://evil.com/x__' });
    });

    await expect(fetchComCurl('https://jcconcursos.com.br/x')).rejects.toThrow('URL não permitida');
  });

  it('rejeita corpo acima do limite no curl', async () => {
    const huge = 'x'.repeat(5 * 1024 * 1024 + 1);
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      callback(null, { stdout: `${huge}\n__CURL_META__200__https://jcconcursos.com.br/x__` });
    });

    await expect(fetchComCurl('https://jcconcursos.com.br/x')).rejects.toThrow('tamanho máximo');
  });

  it('rejeita HTTP de erro retornado pelo curl', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      callback(null, { stdout: '<html></html>\n__CURL_META__500__https://jcconcursos.com.br/x__' });
    });

    await expect(fetchComCurl('https://jcconcursos.com.br/x')).rejects.toThrow('HTTP 500');
  });

  it('rejeita timeout do curl', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      const error = new Error('timeout');
      error.code = 28;
      callback(error);
    });

    await expect(fetchComCurl('https://jcconcursos.com.br/x')).rejects.toThrow('Timeout');
  });

  it('ignora headers vazios no curl', async () => {
    execFileMock.mockImplementation((_cmd, args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      expect(args.filter((arg) => arg === '-H')).toHaveLength(1);
      callback(null, { stdout: '<html>curl</html>\n__CURL_META__200__https://jcconcursos.com.br/x__' });
    });

    await fetchComCurl('https://jcconcursos.com.br/x', { headers: { 'User-Agent': 'test', 'X-Empty': '' } });
  });

  it('rejeita curl interrompido', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      const error = new Error('killed');
      error.killed = true;
      callback(error);
    });

    await expect(fetchComCurl('https://jcconcursos.com.br/x')).rejects.toThrow('Timeout');
  });

  it('rejeita resposta inválida do curl', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      callback(null, { stdout: '<html>sem meta</html>' });
    });

    await expect(fetchComCurl('https://jcconcursos.com.br/x')).rejects.toThrow('Resposta inválida do curl');
  });

  it('rejeita resposta HTTP de erro', async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: 500 }));
    const client = createHttpClient();
    await expect(client.get('https://jcconcursos.com.br/x')).rejects.toThrow('HTTP 500');
  });

  it('rejeita corpo acima do limite', async () => {
    const huge = 'x'.repeat(5 * 1024 * 1024 + 1);
    fetchMock.mockResolvedValue(mockResponse({ body: huge }));
    const client = createHttpClient();
    await expect(client.get('https://jcconcursos.com.br/x')).rejects.toThrow('tamanho máximo');
  });

  it('rejeita excesso de redirects', async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: 302, headers: { location: '/loop' } }));
    const client = createHttpClient();
    await expect(client.get('https://jcconcursos.com.br/')).rejects.toThrow('Muitos redirects');
  });

  it('rejeita redirect sem Location', async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: 302 }));
    const client = createHttpClient();
    await expect(client.get('https://jcconcursos.com.br/')).rejects.toThrow('Redirect sem header');
  });

  it('aceita fetch sem options explícitas', async () => {
    fetchMock.mockResolvedValue(mockResponse());
    const html = await fetchComLimites('https://jcconcursos.com.br/x');
    expect(html).toBe('<html></html>');
  });

  it('propaga erro genérico de rede', async () => {
    fetchMock.mockRejectedValue(new Error('falha de rede'));
    const client = createHttpClient();
    await expect(client.get('https://jcconcursos.com.br/x')).rejects.toThrow('falha de rede');
  });

  it('rejeita timeout', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const client = createHttpClient();
    await expect(client.get('https://jcconcursos.com.br/x')).rejects.toThrow('Timeout');
  });

  it('executa callback de timeout', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb) => {
      cb();
      return 1;
    });
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    await expect(createHttpClient().get('https://jcconcursos.com.br/x')).rejects.toThrow('Timeout');
    setTimeoutSpy.mockRestore();
  });
});
