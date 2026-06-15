import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validarTimezone, carregarEnv } from '../src/config/env.js';

describe('env', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-env-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('valida timezone conhecido', () => {
    expect(validarTimezone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
  });

  it('usa fallback para timezone inválido', () => {
    expect(validarTimezone('Invalid/Zone')).toBe('America/Sao_Paulo');
    expect(validarTimezone('bad')).toBe('America/Sao_Paulo');
    expect(validarTimezone(123)).toBe('America/Sao_Paulo');
  });

  it('carrega variáveis do arquivo .env', () => {
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, 'TIMEZONE=America/Manaus\n');

    const env = carregarEnv(envPath);
    expect(env.TIMEZONE).toBe('America/Manaus');
  });

  it('carrega env padrão do projeto', () => {
    const env = carregarEnv();
    expect(env.TIMEZONE).toBeTruthy();
  });

  it('carrega env sem TIMEZONE definido', () => {
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, 'SLACK_WEBHOOK_URL=\n');
    const original = process.env.TIMEZONE;
    delete process.env.TIMEZONE;

    const env = carregarEnv(envPath);
    expect(env.TIMEZONE).toBe('America/Sao_Paulo');

    if (original) process.env.TIMEZONE = original;
  });
});
