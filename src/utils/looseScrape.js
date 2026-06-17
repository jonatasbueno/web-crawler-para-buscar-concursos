import { normalizarTexto } from './concursoFilter.js';

/** Proximidade aproximada de Capivari-SP (menor = mais perto). */
export const ORDEM_PROXIMIDADE = new Map([
  ['capivari', 0],
  ['rafard', 1],
  ['piracicaba', 2],
  ['elias fausto', 3],
  ['tiete', 4],
  ['limeira', 5],
  ['porto feliz', 6],
  ['americana', 7],
  ['santa barbara d\'oeste', 8],
  ['sumare', 9],
  ['hortolandia', 10],
  ['indaiatuba', 11],
  ['campinas', 12],
  ['jundiai', 13],
  ['itu', 14],
  ['salto', 15],
  ['sorocaba', 16],
  ['tatui', 17],
  ['sao pedro', 18],
  ['rio claro', 19],
  ['laranjal paulista', 20]
]);

export function abreviarFonte(fonte) {
  if (fonte === 'jcConcursos') return 'JC Concursos';
  if (fonte === 'pciConcursos') return 'PCI Concursos';
  return fonte;
}

function ordemProximidade(cidade) {
  return ORDEM_PROXIMIDADE.get(normalizarTexto(cidade)) ?? 999;
}

function pesoEscolaridade(escolaridade) {
  const nivel = normalizarTexto(escolaridade);

  if (nivel.includes('superior')) return 4;
  if (nivel.includes('tecnico')) return 3;
  if (nivel.includes('medio')) return 2;
  if (nivel.includes('fundamental')) return 1;

  return 0;
}

/** Ordena por proximidade a Capivari e, em empate, por grau do cargo (maior primeiro). */
export function ordenarConcursosAvulsa(concursos) {
  return [...concursos].sort((a, b) => {
    const diffProximidade = ordemProximidade(a.cidade) - ordemProximidade(b.cidade);
    if (diffProximidade !== 0) return diffProximidade;

    return pesoEscolaridade(b.escolaridade) - pesoEscolaridade(a.escolaridade);
  });
}

function interpretarFalha(falha) {
  if (falha.includes('HTTP 403')) {
    return `${falha} — Cloudflare bloqueando fingerprint TLS do Node.js`;
  }

  if (falha.includes('Timeout')) {
    return `${falha} — requisição excedeu o tempo limite ou rede instável`;
  }

  if (falha.includes('Muitos redirects')) {
    return `${falha} — loop ou cadeia de redirects excessiva`;
  }

  return falha;
}

/** Monta diagnóstico legível para notificação avulsa no Slack. */
export function analisarCausaRaiz({ falhas, bloqueios, concursos, totalFontes }) {
  const linhas = [];

  for (const { fonte, tipo } of bloqueios) {
    linhas.push(
      `*${abreviarFonte(fonte)}*: ${tipo} — verificação anti-bot ativa (captcha/WAF)`
    );
  }

  for (const falha of falhas) {
    linhas.push(interpretarFalha(falha));
  }

  if (concursos.length === 0 && falhas.length === 0 && bloqueios.length === 0) {
    linhas.push(
      'Nenhum concurso na região — pode não haver vagas abertas ou os seletores HTML das fontes mudaram'
    );
  }

  const fontesComFalha = falhas.length + bloqueios.length;

  if (fontesComFalha >= totalFontes && totalFontes > 0) {
    linhas.push('Todas as fontes falharam — raspagem não produziu dados utilizáveis');
  } else if (fontesComFalha > 0) {
    linhas.push('Raspagem parcial — resultados podem estar incompletos');
  }

  return linhas;
}
