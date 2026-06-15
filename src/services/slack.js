import axios from 'axios';
import {
  validateSlackWebhook,
  sanitizeSlackText,
  isAllowedLinkUrl
} from '../utils/security.js';

const MAX_CONCURSOS_POR_MENSAGEM = 20;
const TIMEOUT_MS = 15_000;

function criarBlocoConcurso(concurso) {
  const link = isAllowedLinkUrl(concurso.link) ? concurso.link : null;
  const linkTexto = link ? `<${link}|Ver edital>` : 'Link indisponível';

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: [
        `*${sanitizeSlackText(concurso.cidade)}* — ${sanitizeSlackText(concurso.orgao)}`,
        `${sanitizeSlackText(concurso.escolaridade)} | ${sanitizeSlackText(concurso.fonte)}`,
        linkTexto
      ].join('\n')
    }
  };
}

function montarPayload(concursos, runDate) {
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

/** Envia ao Slack somente concursos inéditos — nunca re-notifica existentes. */
export async function notificarConcursos(concursos, runDate) {
  const webhook = process.env.SLACK_WEBHOOK_URL;

  if (!webhook) {
    console.log('[slack] SLACK_WEBHOOK_URL não configurada — notificação ignorada.');
    return;
  }

  if (!validateSlackWebhook(webhook)) {
    console.error('[slack] Webhook inválido — notificação bloqueada por segurança.');
    return;
  }

  if (concursos.length === 0) {
    console.log('[slack] Nenhum concurso novo — notificação omitida.');
    return;
  }

  await axios.post(webhook, montarPayload(concursos, runDate), {
    timeout: TIMEOUT_MS,
    maxRedirects: 0
  });

  console.log(`[slack] Notificação enviada (${concursos.length} concursos).`);
}
