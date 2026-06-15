import { describe, it, expect, jest } from '@jest/globals';

const createMock = jest.fn(() => ({
  interceptors: { request: { use: jest.fn() } },
  get: jest.fn()
}));

jest.unstable_mockModule('axios', () => ({
  default: { create: createMock }
}));

const { createHttpClient, validateRequestConfig, attachRequestGuard } = await import('../src/utils/httpClient.js');

describe('httpClient', () => {
  it('registra guard no cliente', () => {
    const useMock = jest.fn();
    const client = attachRequestGuard({
      interceptors: { request: { use: useMock } }
    });

    expect(useMock).toHaveBeenCalled();
    const guard = useMock.mock.calls[0][0];
    expect(guard({ url: 'https://jcconcursos.com.br/x' }).url).toContain('jcconcursos');
    expect(client.interceptors).toBeDefined();
  });

  it('cria cliente HTTP configurado', () => {
    const client = createHttpClient();
    const options = createMock.mock.calls[0][0];
    expect(options.validateStatus(200)).toBe(true);
    expect(options.validateStatus(400)).toBe(false);
    expect(createMock).toHaveBeenCalled();
    expect(client.interceptors).toBeDefined();
  });

  it('rejeita configuração sem URL válida', () => {
    expect(() => validateRequestConfig({})).toThrow('URL não permitida');
  });

  it('aceita configuração com URL absoluta permitida', () => {
    const config = validateRequestConfig({ url: 'https://jcconcursos.com.br/concursos/sp' });
    expect(config.url).toContain('jcconcursos');
  });

  it('monta URL relativa com baseURL permitida', () => {
    const config = validateRequestConfig({
      baseURL: 'https://jcconcursos.com.br',
      url: '/concursos/sp'
    });
    expect(config.baseURL).toBe('https://jcconcursos.com.br');
  });
});
