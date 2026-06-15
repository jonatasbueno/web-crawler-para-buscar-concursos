import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const postMock = jest.fn().mockResolvedValue({ status: 200 });

jest.unstable_mockModule('axios', () => ({
  default: { post: postMock }
}));

const { notificarConcursos } = await import('../src/services/slack.js');

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
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it('ignora quando webhook não está configurado', async () => {
    await notificarConcursos([concurso], '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('bloqueia webhook inválido', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://evil.com/hook';
    await notificarConcursos([concurso], '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('omite notificação sem concursos novos', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarConcursos([], '2026-06-14');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('envia notificação sanitizada para webhook válido', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarConcursos([concurso], '2026-06-14');
    expect(postMock).toHaveBeenCalledTimes(1);
    const payload = postMock.mock.calls[0][1];
    expect(payload.blocks[2].text.text).toContain('&lt;Teste&gt;');
  });

  it('limita blocos e adiciona contexto extra', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    const muitos = Array.from({ length: 21 }, (_, i) => ({
      ...concurso,
      link: `https://www.pciconcursos.com.br/noticias/teste-${i}`
    }));

    await notificarConcursos(muitos, '2026-06-14');
    expect(postMock.mock.calls[0][1].blocks.some((b) => b.type === 'context')).toBe(true);
  });

  it('omite link não permitido', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx';
    await notificarConcursos([{ ...concurso, link: 'https://evil.com/x' }], '2026-06-14');
    expect(postMock.mock.calls[0][1].blocks[2].text.text).toContain('Link indisponível');
  });
});
