import { describe, it, expect } from '@jest/globals';
import {
  normalizarTexto,
  encontrarCidade,
  detectarEscolaridade,
  hojeLocal,
  horaLocal,
  CIDADES_ALVO,
  TIMEZONE
} from '../src/utils/geoFilter.js';

describe('geoFilter', () => {
  it('normaliza texto com acentos', () => {
    expect(normalizarTexto('São Paulo')).toBe('sao paulo');
    expect(normalizarTexto(null)).toBe('');
  });

  it('encontra cidade sem falso positivo em instituto', () => {
    expect(encontrarCidade('Instituto de Física')).toBeNull();
    expect(encontrarCidade('Prefeitura de Piracicaba')).toBe('piracicaba');
    expect(encontrarCidade('Concurso em Campinas SP')).toBe('campinas');
    expect(encontrarCidade('Prefeitura de Santa Barbara d\'Oeste')).toBe('santa barbara d\'oeste');
  });

  it('detecta escolaridade', () => {
    expect(detectarEscolaridade('nível superior')).toBe('Superior');
    expect(detectarEscolaridade('sem info')).toBe('Não especificado (Verificar edital)');
  });

  it('expõe timezone e calcula data/hora local', () => {
    expect(TIMEZONE).toBeTruthy();
    expect(hojeLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(horaLocal()).toBeGreaterThanOrEqual(0);
    expect(horaLocal()).toBeLessThanOrEqual(23);
  });

  it('contém cidades alvo esperadas', () => {
    expect(CIDADES_ALVO.has('capivari')).toBe(true);
    expect(CIDADES_ALVO.has('piracicaba')).toBe(true);
  });
});
