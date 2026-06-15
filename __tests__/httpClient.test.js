import { describe, it, expect, jest } from '@jest/globals';

const fetchMock = jest.fn();

global.fetch = fetchMock;

const { createHttpClient, validarUrlFetch, fetchComLimites } = await import('../src/utils/httpClient.js');

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
    fetchMock.mockResolvedValue(mockResponse());
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
