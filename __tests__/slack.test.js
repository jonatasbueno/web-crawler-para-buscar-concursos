import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const postMock = jest.fn().mockResolvedValue({ status: 200 });
const createMock = jest.fn(() => ({ post: postMock }));
const AgentMock = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    create: createMock,
    isAxiosError: (error) => Boolean(error?.isAxiosError)
  }
}));

jest.unstable_mockModule('node:https', () => ({
  default: { Agent: AgentMock }
}));

const {
  notificarConcursos,
  notificarHomeOffice,
  notificarBloqueio,
  notificarRaspagemAvulsa
} = await import('../src/services/slack.js');

const concurso = {
  orgao: 'Prefeitura <Teste>',
  cidade: 'PIRACICABA',
  escolaridade: 'Superior',
  status: 'Aberto',
  link: 'https://www.pciconcursos.com.br/noticias/teste',
  fonte: 'pciConcursos'
};

describe('slack', () => {
  beforeEach(() => {
    postMock.mockClear();
    postMock.mockResolvedValue({ status: 200 });
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it('configura cliente axios sem keep-alive', () => {
    expect(AgentMock).toHaveBeenCalledWith({ keepAlive: false });
    const options = createMock.mock.calls[0][0];
    expect(options).toMatchObject({ timeout: 15_000, maxRedirects: 0 });
    expect(options.validateStatus(200)).toBe(true);
    expect(options.validateStatus(500)).toBe(false);
  });

  it('ignora quando webhook não está configurado', async () => {
    await notificarConcursos([concurso], '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('bloqueia webhook inválido', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.SLACK_WEBHOOK_URL = 'https://evil.com/hook';
    await notificarConcursos([concurso], '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[slack] Webhook inválido — notificação bloqueada por segurança.'
    );
    errorSpy.mockRestore();
  });

  it('avisa quando não há concursos novos na região', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarConcursos([], '2026-06-14');
    expect(postMock).toHaveBeenCalledTimes(1);
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks[1].text.text).toContain('Nenhum novo concurso encontrado num raio de 100 km de Capivari-SP');
    expect(logSpy).toHaveBeenCalledWith('[slack] Aviso de nenhum concurso novo na região enviado.');
    logSpy.mockRestore();
  });

  it('avisa quando não há vagas home office novas', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarHomeOffice([], '2026-06-14');
    expect(postMock).toHaveBeenCalledTimes(1);
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks[1].text.text).toContain('Nenhum novo concurso com cargos home office encontrado');
    expect(logSpy).toHaveBeenCalledWith('[slack] Aviso de nenhuma vaga home office nova enviado.');
    logSpy.mockRestore();
  });

  it('não avisa nada sem webhook configurado', async () => {
    await notificarConcursos([], '2026-06-14');
    await notificarHomeOffice([], '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('envia notificação sanitizada para webhook válido', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarConcursos([concurso], '2026-06-14');
    expect(postMock).toHaveBeenCalledTimes(1);
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks[2].text.text).toContain('&lt;Teste&gt;');
    expect(payload.blocks[2].text.text).toContain('PCI Concursos');
    expect(logSpy).toHaveBeenCalledWith('[slack] Notificação enviada (1 concursos).');
    logSpy.mockRestore();
  });

  it('limita blocos e adiciona contexto extra', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    const muitos = Array.from({ length: 21 }, (_, i) => ({
      ...concurso,
      link: `https://www.pciconcursos.com.br/noticias/teste-${i}`
    }));

    await notificarConcursos(muitos, '2026-06-14');
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks.some((b) => b.type === 'context')).toBe(true);
  });

  it('omite link não permitido', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarConcursos([{ ...concurso, link: 'https://evil.com/x' }], '2026-06-14');
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks[2].text.text).toContain('Link indisponível');
  });

  it('envia mensagem separada de vagas home office', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarHomeOffice([{ ...concurso, cidade: 'REMOTO (RJ)' }], '2026-06-14');
    expect(postMock).toHaveBeenCalledTimes(1);
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks[0].text.text).toContain('home office no Brasil');
    expect(payload.blocks[2].text.text).toContain('REMOTO (RJ)');
    expect(logSpy).toHaveBeenCalledWith('[slack] Notificação home office enviada (1 vagas).');
    logSpy.mockRestore();
  });

  it('limita vagas home office e adiciona contexto extra', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    const muitos = Array.from({ length: 21 }, (_, i) => ({
      ...concurso,
      cidade: 'REMOTO',
      link: `https://www.pciconcursos.com.br/noticias/remoto-${i}`
    }));
    await notificarHomeOffice(muitos, '2026-06-14');
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks.some((b) => b.elements?.[0]?.text?.includes('vagas home office adicionais'))).toBe(true);
  });

  it('ignora notificação home office sem webhook', async () => {
    await notificarHomeOffice([concurso], '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('ignora alerta de bloqueio sem webhook', async () => {
    await notificarBloqueio('jcConcursos', 'reCAPTCHA', '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('envia alerta de bloqueio', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarBloqueio('jcConcursos', 'reCAPTCHA', '2026-06-14');
    expect(postMock).toHaveBeenCalledTimes(1);
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks[0].text.text).toContain('Bloqueio');
    expect(logSpy).toHaveBeenCalledWith('[slack] Alerta de bloqueio enviado (jcConcursos: reCAPTCHA).');
    logSpy.mockRestore();
  });

  it('bloqueia webhook inválido em alertas', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.SLACK_WEBHOOK_URL = 'https://evil.com/hook';
    await notificarBloqueio('jcConcursos', 'reCAPTCHA', '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('lança erro quando Slack responde com falha', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    postMock.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });
    await expect(notificarConcursos([concurso], '2026-06-14')).rejects.toThrow('Slack respondeu HTTP 500');
  });

  it('envia raspagem avulsa com diagnóstico e concursos', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';

    await notificarRaspagemAvulsa({
      concursos: [concurso],
      analise: ['Raspagem parcial — resultados podem estar incompletos'],
      runDate: '2026-06-14'
    });

    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks[0].text.text).toBe('Raspagem avulsa de regras de armazenamento');
    expect(payload.blocks.some((b) => b.text?.text?.includes('Diagnóstico'))).toBe(true);
    expect(payload.blocks.some((b) => b.text?.text?.includes('PCI'))).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('[slack] Raspagem avulsa enviada (1 concursos).');
    logSpy.mockRestore();
  });

  it('envia raspagem avulsa sem concursos', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';

    await notificarRaspagemAvulsa({
      concursos: [],
      analise: ['Nenhum concurso na região'],
      runDate: '2026-06-14'
    });

    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks.some((b) => b.text?.text?.includes('Nenhum concurso encontrado'))).toBe(true);
  });

  it('ignora raspagem avulsa sem webhook', async () => {
    await notificarRaspagemAvulsa({
      concursos: [concurso],
      analise: [],
      runDate: '2026-06-14'
    });

    expect(postMock).not.toHaveBeenCalled();
  });

  it('limita concursos na raspagem avulsa', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    const concursos = Array.from({ length: 21 }, (_, i) => ({
      ...concurso,
      orgao: `Prefeitura ${i}`,
      link: `https://www.pciconcursos.com.br/noticias/teste-${i}`
    }));

    await notificarRaspagemAvulsa({
      concursos,
      analise: [],
      runDate: '2026-06-14'
    });

    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks.some((b) => b.elements?.[0]?.text?.includes('+1 concursos adicionais'))).toBe(true);
  });

  it('omite link não permitido na raspagem avulsa', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarRaspagemAvulsa({
      concursos: [{ ...concurso, link: 'https://evil.com/x', fonte: 'jcConcursos' }],
      analise: [],
      runDate: '2026-06-14'
    });

    const payload = postMock.mock.calls[0][1];
    const bloco = payload.blocks.find((b) => b.text?.text?.includes('JC'));
    expect(bloco.text.text).toContain('Link indisponível');
  });

  it('propaga erro de rede do axios', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    postMock.mockRejectedValue(new Error('timeout'));
    await expect(notificarConcursos([concurso], '2026-06-14')).rejects.toThrow('timeout');
  });
});
