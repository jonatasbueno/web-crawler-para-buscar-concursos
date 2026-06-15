# Changelog

Todas as mudanças relevantes deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Alterado

- README expandido com modo de raspagem avulsa, árvore de arquivos, comandos `run:loose` e `db:clear`, e diagramas corrigidos

## [1.0.0] - 2026-06-15

Primeira versão estável com o conjunto completo de funcionalidades do crawler.

### Corrigido

- Formatação dos nomes das fontes nas notificações Slack (`JC Concursos`, `PCI Concursos`)
- Extração do órgão no spider JC Concursos (remoção de ruído como "Concurso Aberto")

## [0.5.0] - 2026-06-15

### Adicionado

- Comando `npm run db:clear -- --yes` para limpar registros do banco
- Função `limparRegistros` em `db.js` (preserva o schema)
- Script `scripts/limpar-banco.js` com confirmação obrigatória
- Testes para limpeza do banco e tratamento de erros

## [0.4.0] - 2026-06-15

### Adicionado

- Modo de raspagem avulsa (`npm run run:loose` / `--run-loose`) sem lock diário e sem persistência
- `executarRaspagemAvulsa` no orquestrador
- Utilitários em `looseScrape.js` (ordenação por proximidade e análise de causa raiz)
- Notificação Slack `notificarRaspagemAvulsa` com diagnóstico de falhas
- Fallback via `curl` no cliente HTTP para respostas HTTP 403
- Testes para raspagem avulsa e casos de borda

## [0.3.0] - 2026-06-15

### Adicionado

- Detecção de bloqueios anti-bot (`BloqueioFonteError`) em `spiderHelpers.js`
- Notificações Slack para bloqueios nas fontes e cobertura vazia
- Testes para helpers dos spiders e novas notificações

### Alterado

- `pertenceWhitelist` substitui `isAllowedFetchUrl` na camada de segurança
- Cliente HTTP reescrito com `fetch` nativo, limites de redirect e validação de URL

### Segurança

- Whitelist de domínios reforçada antes de qualquer requisição externa
- Sanitização de texto para payloads do Slack

## [0.2.0] - 2026-06-15

### Adicionado

- Suíte de testes Jest com cobertura de 100%
- Ponto de entrada `src/cli.js` com flags `--list-today` e `--catch-up`
- Testes para CLI, banco, spiders, segurança, Slack e orquestrador
- `jest.config.js` com threshold global de cobertura

### Alterado

- Estrutura do projeto reorganizada sob `src/`
- `index.js` na raiz passa a re-exportar `src/index.js`
- README expandido com documentação de arquitetura e uso

## [0.1.0] - 2026-06-14

### Adicionado

- Crawler modular para concursos públicos na região de Capivari-SP
- Spiders para JC Concursos e PCI Concursos com filtro geográfico
- Persistência SQLite via Knex (`concursos`, `cron_runs`)
- Notificações Slack para concursos novos
- Lock diário com expiração de 30 minutos
- Agendamento systemd (timer às 10h + catch-up no boot)
- Camada de segurança com whitelist de domínios e sanitização de links
- Configuração via `.env` (`SLACK_WEBHOOK_URL`, `TIMEZONE`)

[Não publicado]: https://github.com/jonatasbueno/web-crawler-para-buscar-concursos/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jonatasbueno/web-crawler-para-buscar-concursos/releases/tag/v1.0.0
[0.5.0]: https://github.com/jonatasbueno/web-crawler-para-buscar-concursos/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/jonatasbueno/web-crawler-para-buscar-concursos/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jonatasbueno/web-crawler-para-buscar-concursos/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jonatasbueno/web-crawler-para-buscar-concursos/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jonatasbueno/web-crawler-para-buscar-concursos/releases/tag/v0.1.0
