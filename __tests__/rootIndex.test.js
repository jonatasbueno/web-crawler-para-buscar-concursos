import { describe, it, expect } from '@jest/globals';

describe('index.js raiz', () => {
  it('reexporta funções do orquestrador', async () => {
    const mod = await import('../index.js');
    expect(mod.main).toBeDefined();
    expect(mod.runCli).toBeDefined();
  });
});
