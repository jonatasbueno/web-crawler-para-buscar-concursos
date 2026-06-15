import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const runCliMock = jest.fn();

describe('cli', () => {
  beforeEach(() => {
    jest.resetModules();
    runCliMock.mockClear();
  });

  it('dispara runCli quando é entrypoint', async () => {
    jest.unstable_mockModule('../src/index.js', () => ({
      isEntryPoint: () => true,
      runCli: runCliMock
    }));

    await import('../src/cli.js');
    expect(runCliMock).toHaveBeenCalled();
  });

  it('não dispara runCli quando não é entrypoint', async () => {
    jest.unstable_mockModule('../src/index.js', () => ({
      isEntryPoint: () => false,
      runCli: runCliMock
    }));

    await import('../src/cli.js');
    expect(runCliMock).not.toHaveBeenCalled();
  });
});
