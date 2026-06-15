import { describe, it, expect } from '@jest/globals';
import {
  abreviarFonte,
  ordenarConcursosAvulsa,
  analisarCausaRaiz
} from '../src/utils/looseScrape.js';

const concurso = (overrides) => ({
  orgao: 'Prefeitura',
  cidade: 'PIRACICABA',
  escolaridade: 'Superior',
  status: 'Aberto',
  link: 'https://www.pciconcursos.com.br/x',
  fonte: 'pciConcursos',
  ...overrides
});

describe('looseScrape', () => {
  it('formata nomes de fonte para exibição', () => {
    expect(abreviarFonte('jcConcursos')).toBe('JC Concursos');
    expect(abreviarFonte('pciConcursos')).toBe('PCI Concursos');
    expect(abreviarFonte('outra')).toBe('outra');
  });

  it('ordena por proximidade e escolaridade', () => {
    const ordenados = ordenarConcursosAvulsa([
      concurso({ cidade: 'CAMPINAS', escolaridade: 'Médio' }),
      concurso({ cidade: 'CAPIVARI', escolaridade: 'Fundamental' }),
      concurso({ cidade: 'PIRACICABA', escolaridade: 'Superior' }),
      concurso({ cidade: 'PIRACICABA', escolaridade: 'Médio' })
    ]);

    expect(ordenados.map((c) => c.cidade)).toEqual([
      'CAPIVARI',
      'PIRACICABA',
      'PIRACICABA',
      'CAMPINAS'
    ]);
    expect(ordenados[1].escolaridade).toBe('Superior');
  });

  it('coloca cidades desconhecidas por último', () => {
    const ordenados = ordenarConcursosAvulsa([
      concurso({ cidade: 'CIDADE X' }),
      concurso({ cidade: 'CAPIVARI' })
    ]);

    expect(ordenados[0].cidade).toBe('CAPIVARI');
    expect(ordenados[1].cidade).toBe('CIDADE X');
  });

  it('ordena por grau fundamental e médio', () => {
    const ordenados = ordenarConcursosAvulsa([
      concurso({ cidade: 'CAPIVARI', escolaridade: 'Fundamental' }),
      concurso({ cidade: 'CAPIVARI', escolaridade: 'Médio' }),
      concurso({ cidade: 'CAPIVARI', escolaridade: 'Médio/Técnico' })
    ]);

    expect(ordenados.map((c) => c.escolaridade)).toEqual([
      'Médio/Técnico',
      'Médio',
      'Fundamental'
    ]);
  });

  it('ordena escolaridade desconhecida por último', () => {
    const ordenados = ordenarConcursosAvulsa([
      concurso({ cidade: 'CAPIVARI', escolaridade: 'Outro' }),
      concurso({ cidade: 'CAPIVARI', escolaridade: 'Superior' })
    ]);

    expect(ordenados[0].escolaridade).toBe('Superior');
    expect(ordenados[1].escolaridade).toBe('Outro');
  });

  it('analisa bloqueios e falhas com causa raiz', async () => {
    const analise = analisarCausaRaiz({
      falhas: ['jcConcursos: HTTP 403', 'pciConcursos: Timeout na requisição HTTP'],
      bloqueios: [{ fonte: 'jcConcursos', tipo: 'reCAPTCHA' }],
      concursos: [],
      totalFontes: 2
    });

    expect(analise.some((l) => l.includes('reCAPTCHA'))).toBe(true);
    expect(analise.some((l) => l.includes('Cloudflare'))).toBe(true);
    expect(analise.some((l) => l.includes('Todas as fontes falharam'))).toBe(true);
  });

  it('diagnostica cobertura vazia sem erros', () => {
    const analise = analisarCausaRaiz({
      falhas: [],
      bloqueios: [],
      concursos: [],
      totalFontes: 2
    });

    expect(analise.some((l) => l.includes('seletores HTML'))).toBe(true);
  });

  it('diagnostica falha total', () => {
    const analise = analisarCausaRaiz({
      falhas: ['a: erro', 'b: erro'],
      bloqueios: [],
      concursos: [],
      totalFontes: 2
    });

    expect(analise.some((l) => l.includes('Todas as fontes falharam'))).toBe(true);
  });

  it('interpreta redirects excessivos', () => {
    const analise = analisarCausaRaiz({
      falhas: ['spider: Muitos redirects'],
      bloqueios: [],
      concursos: [concurso({})],
      totalFontes: 2
    });

    expect(analise.some((l) => l.includes('redirects'))).toBe(true);
    expect(analise.some((l) => l.includes('parcial'))).toBe(true);
  });
});
