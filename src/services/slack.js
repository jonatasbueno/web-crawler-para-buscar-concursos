import axios from 'axios';

export async function notificarConcursos(concursos, runDate) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log('[slack] SLACK_WEBHOOK_URL não configurada — notificação ignorada.');
    return;
  }

  if (concursos.length === 0) {
    await axios.post(webhook, {
      text: `Nenhum concurso com inscrições abertas na região em ${runDate}.`
    });
    return;
  }

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${concursos.length} concursos na região (${runDate})`
      }
    },
    { type: 'divider' }
  ];

  for (const concurso of concursos.slice(0, 20)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${concurso.cidade}* — ${concurso.orgao}\n${concurso.escolaridade} | ${concurso.fonte}\n<${concurso.link}|Ver edital>`
      }
    });
  }

  if (concursos.length > 20) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `_+${concursos.length - 20} concursos adicionais no banco de dados._`
      }]
    });
  }

  await axios.post(webhook, { blocks });
  console.log(`[slack] Notificação enviada (${concursos.length} concursos).`);
}
