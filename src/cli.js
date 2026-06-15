/**
 * Ponto de entrada da aplicação.
 * Só executa quando invocado diretamente (npm start / systemd).
 */
import { isEntryPoint, runCli } from './index.js';

if (isEntryPoint()) {
  runCli();
}
