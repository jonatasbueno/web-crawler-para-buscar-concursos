import axios from 'axios';
import https from 'node:https';
import { lerSlackWebhookUrl } from '../config/env.js';
import {
  validateSlackWebhook,
  sanitizeSlackText,
  pertenceWhitelist
} from '../utils/security.js';
import { abreviarFonte } from '../utils/looseScrape.js';

const TITULO_RASPAGEM_AVULSA = 'Raspagem avulsa de regras de armazenamento';

const MAX_CONCURSOS_POR_MENSAGEM = 20;
const TIMEOUT_MS = 15_000;

/** Requisições pontuais ao webhook — sem manter conexão aberta. */
const slackClient = axios.create({
  timeout: TIMEOUT_MS,
  maxRedirects: 0,
  httpsAgent: new https.Agent({ keepAlive: false }),
  validateStatus: (status) => status >= 200 && status < 300
});

function criarBlocoConcursoAvulso(concurso) {
  const link = pertenceWhitelist(concurso.link) ? concurso.link : null;
  const linkTexto = link ? `<${link}|Ver edital>` : 'Link indisponível';
  const fonte = abreviarFonte(concurso.fonte);

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: [
        `*${sanitizeSlackText(concurso.cidade)}* — ${sanitizeSlackText(concurso.orgao)}`,
        `${sanitizeSlackText(concurso.escolaridade)} | ${fonte}`,
        linkTexto
      ].join('\n')
    }
  };
}

function montarPayloadRaspagemAvulsa({ concursos, analise, runDate }) {
  const blocos = [
    {
      type: 'header',
      text: { type: 'plain_text', text: TITULO_RASPAGEM_AVULSA }
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_Data: ${sanitizeSlackText(runDate)}_` }]
    }
  ];

  if (analise.length > 0) {
    blocos.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Diagnóstico*\n${analise.map((linha) => sanitizeSlackText(linha)).join('\n')}`
        }
      }
    );
  }

  blocos.push({ type: 'divider' });

  if (concursos.length === 0) {
    blocos.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_Nenhum concurso encontrado na região._' }
    });
  } else {
    blocos.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${concursos.length} concurso(s) encontrado(s)*`
      }
    });
    blocos.push(...concursos.slice(0, MAX_CONCURSOS_POR_MENSAGEM).map(criarBlocoConcursoAvulso));

    if (concursos.length > MAX_CONCURSOS_POR_MENSAGEM) {
      const restantes = concursos.length - MAX_CONCURSOS_POR_MENSAGEM;
      blocos.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_+${restantes} concursos adicionais._` }]
      });
    }
  }

  return { blocks: blocos };
}

function criarBlocoConcurso(concurso) {
  const link = pertenceWhitelist(concurso.link) ? concurso.link : null;
  const linkTexto = link ? `<${link}|Ver edital>` : 'Link indisponível';

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: [
        `*${sanitizeSlackText(concurso.cidade)}* — ${sanitizeSlackText(concurso.orgao)}`,
        `${sanitizeSlackText(concurso.escolaridade)} | ${abreviarFonte(concurso.fonte)}`,
        linkTexto
      ].join('\n')
    }
  };
}

function montarPayloadConcursos(concursos, runDate) {
  const blocos = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${concursos.length} novo(s) concurso(s) na região (${runDate})`
      }
    },
    { type: 'divider' },
    ...concursos.slice(0, MAX_CONCURSOS_POR_MENSAGEM).map(criarBlocoConcurso)
  ];

  if (concursos.length > MAX_CONCURSOS_POR_MENSAGEM) {
    const restantes = concursos.length - MAX_CONCURSOS_POR_MENSAGEM;
    blocos.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_+${restantes} concursos novos adicionais._` }]
    });
  }

  return { blocks: blocos };
}

function montarPayloadAlerta(titulo, mensagem, runDate) {
  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: titulo }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${sanitizeSlackText(mensagem)}\n_Data: ${sanitizeSlackText(runDate)}_`
        }
      }
    ]
  };
}

async function enviarWebhook(payload) {
  const webhook = lerSlackWebhookUrl();

  if (!webhook) {
    console.log('[slack] SLACK_WEBHOOK_URL não configurada — notificação ignorada.');
    return false;
  }

  if (!validateSlackWebhook(webhook)) {
    console.error('[slack] Webhook inválido — notificação bloqueada por segurança.');
    return false;
  }

  try {
    await slackClient.post(webhook, payload);
    return true;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Slack respondeu HTTP ${error.response.status}`);
    }

    throw error;
  }
}

/** Envia ao Slack somente concursos inéditos — nunca re-notifica existentes. */
export async function notificarConcursos(concursos, runDate) {
  if (concursos.length === 0) {
    console.log('[slack] Nenhum concurso novo — notificação omitida.');
    return;
  }

  const enviado = await enviarWebhook(montarPayloadConcursos(concursos, runDate));

  if (enviado) {
    console.log(`[slack] Notificação enviada (${concursos.length} concursos).`);
  }
}

/** Alerta quando uma fonte retorna bloqueio (captcha, Cloudflare, etc.). */
export async function notificarBloqueio(fonte, tipo, runDate) {
  const enviado = await enviarWebhook(montarPayloadAlerta(
    'Bloqueio detectado na fonte',
    `*${sanitizeSlackText(fonte)}*: ${sanitizeSlackText(tipo)}`,
    runDate
  ));

  if (enviado) {
    console.log(`[slack] Alerta de bloqueio enviado (${fonte}: ${tipo}).`);
  }
}

/** Raspagem avulsa: envia todos os concursos encontrados com diagnóstico de falhas. */
export async function notificarRaspagemAvulsa({ concursos, analise, runDate }) {
  const enviado = await enviarWebhook(
    montarPayloadRaspagemAvulsa({ concursos, analise, runDate })
  );

  if (enviado) {
    console.log(`[slack] Raspagem avulsa enviada (${concursos.length} concursos).`);
  }
}

/** Alerta quando nenhum concurso é encontrado — possível falha de cobertura. */
export async function notificarCoberturaVazia(runDate) {
  const enviado = await enviarWebhook(montarPayloadAlerta(
    'Cobertura vazia',
    'Nenhum concurso encontrado na região. O script pode não estar mais cobrindo as fontes corretamente.',
    runDate
  ));

  if (enviado) {
    console.log('[slack] Alerta de cobertura vazia enviado.');
  }
}
