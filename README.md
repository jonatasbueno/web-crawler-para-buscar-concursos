# Crawler de Concursos Públicos

Crawler modular em Node.js que monitora concursos públicos com inscrições abertas na região de **Capivari-SP** (raio de ~100 km). Os resultados são persistidos em SQLite via **Knex.js** e notificados no Slack quando há concursos **novos**, **bloqueios nas fontes** ou **cobertura vazia**.

---

## Decisões técnicas

### Por que Node.js?

O runtime já oferece `fetch` nativo (baseado em undici) a partir da v18, eliminando dependências HTTP extras para as raspagens recorrentes. A execução via CLI encaixa bem com agendamento por systemd, sem precisar de servidor web nem container.

### Bibliotecas e abordagens

| Escolha | Motivo |
|---------|--------|
| **fetch nativo** (`httpClient.js`) | Cliente reutilizável dos spiders; raspagens diárias na mesma fonte se beneficiam de uma API simples e estável, sem axios. |
| **axios** (`slack.js`) | Webhook do Slack é requisição pontual (não recorrente); cliente com `httpsAgent` e `keepAlive: false` evita manter conexão aberta desnecessariamente. |
| **Cheerio** | Parsing de HTML server-side leve — extrai seletores CSS sem headless browser, reduzindo memória e superfície de ataque. |
| **Knex + SQLite** | Persistência local sem servidor de banco; query builder tipado facilita migrações e testes com `:memory:`. Adequado para volume baixo (dezenas de registros/dia). |
| **dotenv** | Configuração via `.env` sem expor segredos no código; carregamento centralizado em `env.js`. |
| **Jest** | Testes unitários com cobertura total; `unstable_mockModule` permite mockar ESM nativo. |

### Arquitetura modular

- **Spiders independentes** — cada fonte (`jcConcursos`, `pciConcursos`) é um módulo com interface `{ name, scrape }`. Falha em uma fonte não aborta a outra.
- **Orquestrador** (`index.js`) — deduplica, persiste, decide notificações e controla execução diária.
- **Camada de segurança** — whitelist de domínios (`pertenceWhitelist`) bloqueia SSRF antes de qualquer fetch; links extraídos passam por `normalizarLinkSeguro`.
- **Detecção de bloqueios** — HTML das fontes é inspecionado por padrões de captcha/Cloudflare; alertas vão ao Slack com o tipo de bloqueio.
- **Agendamento systemd** — timer às 10h + catch-up no boot; mais confiável que cron em máquina pessoal que pode estar desligada.

---

## Funcionalidades

| Módulo | Responsabilidade |
|--------|------------------|
| **Spiders** (`jcConcursos`, `pciConcursos`) | Raspagem de sites de concursos, filtro geográfico e validação de links |
| **Banco SQLite + Knex** (`db.js`) | Persistência via query builder, controle de execução diária e lock contra corridas |
| **Slack** (`slack.js`) | Notificação de concursos inéditos, bloqueios nas fontes e cobertura vazia |
| **Geo filter** (`geoFilter.js`) | Cidades-alvo, normalização de texto e fuso horário |
| **Segurança** (`security.js`, `httpClient.js`) | Whitelist de domínios, sanitização e limites HTTP |
| **Agendamento** (systemd) | Execução diária às 10h + catch-up no boot |

### O que o sistema faz

1. **Raspagem diária** — consulta PCI Concursos (Sudeste) e JC Concursos em busca de vagas em SP.
2. **Filtro geográfico** — mantém apenas concursos de cidades num raio de ~100 km de Capivari.
3. **Deduplicação** — remove duplicatas pelo link do concurso.
4. **Persistência** — grava/atualiza registros em `data/concursos.db`.
5. **Notificação seletiva** — envia ao Slack concursos novos, alertas de bloqueio (captcha, Cloudflare, etc.) e aviso quando nenhum concurso é encontrado.
6. **Controle de execução** — impede mais de uma raspagem bem-sucedida por dia; lock com expiração de 30 min.
7. **Catch-up no boot** — se o PC ligar após as 10h e a raspagem do dia não rodou, executa automaticamente.

---

## Segurança

Auditoria focada em vetores que poderiam comprometer o computador local (SSRF, injeção, execução arbitrária, path traversal).

### Domínios permitidos

- `jcconcursos.com.br` / `www.jcconcursos.com.br`
- `pciconcursos.com.br` / `www.pciconcursos.com.br`

---

## Arquitetura

```
src/
├── cli.js                 # Ponto de entrada (systemd / npm start)
├── index.js               # Orquestrador principal
├── config/env.js          # Variáveis de ambiente (.env)
├── database/
│   ├── db.js              # Operações de persistência (Knex)
│   ├── knex.js            # Fábrica de conexão
│   └── schema.js          # Definição das tabelas
├── services/slack.js      # Notificações Slack
├── spiders/
│   ├── jcConcursos.js
│   └── pciConcursos.js
└── utils/
    ├── geoFilter.js
    ├── httpClient.js
    └── security.js
```

---

## Fluxograma do processo

```mermaid
flowchart TD
    A([Início]) --> B{Modo de execução?}

    B -->|--list-today| C[Listar concursos do dia no banco]
    C --> Z([Fim])

    B -->|--catch-up| D{Já executou hoje?}
    D -->|Sim| Z
    D -->|Não| E{Hora >= 10h?}
    E -->|Não| F[Aguardar timer systemd]
    F --> Z
    E -->|Sim| G[executarRaspagem catch-up]

    B -->|Padrão / timer 10h| G

    G --> H{jaExecutouHoje?}
    H -->|Sim| I[Log: já concluída]
    I --> Z

    H -->|Não| J{reservarExecucao?}
    J -->|Não| K[Log: em andamento]
    K --> Z

    J -->|Sim| L[Para cada spider]
    L --> M{Raspagem OK?}
    M -->|Erro parcial| N[Registrar erro do spider]
    N --> L
    M -->|OK| O[Acumular resultados]
    O --> L

    L --> P{Todos falharam?}
    P -->|Sim| Q[Registrar erro + lançar exceção]
    Q --> Z

    P -->|Não| R[Deduplicar por link]
    R --> S[Upsert via Knex]
    S --> T[Identificar concursos novos]
    T --> U[Registrar execução success]
    U --> V[Exibir tabela no console]
    V --> W{Há novos?}
    W -->|Sim| X[Notificar Slack]
    W -->|Não| Z
    X --> Z
```

---

## Diagrama de sequência

```mermaid
sequenceDiagram
    autonumber
    participant Timer as systemd timer
    participant CLI as cli.js
    participant IDX as index.js
    participant DB as SQLite (Knex)
    participant JC as jcConcursos
    participant PCI as pciConcursos
    participant SL as Slack

    Timer->>CLI: node src/cli.js (10h)
    CLI->>IDX: main()
    IDX->>DB: initDb()

    alt --list-today
        IDX->>DB: listarConcursosRecentes(hoje)
        DB-->>IDX: concursos[]
        IDX->>IDX: exibirResultados()
    else execução normal
        IDX->>DB: jaExecutouHoje(hoje)?
        DB-->>IDX: false

        IDX->>DB: reservarExecucao(hoje)
        DB-->>IDX: true (lock adquirido)

        par Spiders em sequência
            IDX->>JC: scrape()
            JC-->>IDX: concursos[]
        and
            IDX->>PCI: scrape()
            PCI-->>IDX: concursos[]
        end

        IDX->>IDX: deduplicarPorLink()
        IDX->>DB: upsertConcursos()
        DB-->>IDX: novos[]

        IDX->>DB: registrarExecucao(success)
        IDX->>IDX: exibirResultados()

        opt novos.length > 0
            IDX->>SL: notificarConcursos(novos)
            SL-->>IDX: 200 OK
        end
    end

    CLI-->>Timer: exit 0
```

---

## Passo a passo

### 1. Pré-requisitos

- Node.js 18+
- Linux com systemd (para agendamento automático)
- Webhook do Slack (opcional, para notificações)

### 2. Instalação

```bash
git clone <repo-url> crawler-concursos
cd crawler-concursos
npm install
```

### 3. Configuração

Crie o arquivo `.env` na raiz do projeto:

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/xxxxxxxxxxxxxxxxxxxxxxxx
TIMEZONE=America/Sao_Paulo
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SLACK_WEBHOOK_URL` | Não | Webhook do Slack; se ausente, notificações são ignoradas |
| `TIMEZONE` | Não | Fuso IANA; padrão `America/Sao_Paulo` |

### 4. Execução manual

```bash
# Raspagem imediata (respeita lock diário)
npm start

# Listar concursos gravados hoje
node src/cli.js --list-today

# Verificar catch-up (boot)
node src/cli.js --catch-up
```

### 5. Agendamento automático (systemd)

```bash
npm run cron:install
```

Isso instala:

- **Timer** — dispara às 10h todos os dias
- **Catch-up** — roda ao ligar o PC se passou das 10h e ainda não executou

Para o timer funcionar sem login:

```bash
loginctl enable-linger "$USER"
```

Logs em `data/cron.log`.

### 6. Testes

```bash
npm test
```

A suíte Jest cobre **100%** de statements, branches, functions e lines. Relatório HTML em `coverage/lcov-report/index.html`.

---

## Comandos disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm start` | Executa raspagem (via `src/cli.js`) |
| `npm run run-once` | Alias de `npm start` |
| `npm run cron:install` | Instala units systemd user |
| `npm test` | Testes com cobertura |
| `npm run test:watch` | Testes em modo watch |

---

## Cidades monitoradas

Capivari, Piracicaba, Campinas, Sorocaba, Indaiatuba, Americana, Limeira, Sumaré, Hortolândia, Itu, Jundiaí, Rio Claro, Santa Bárbara d'Oeste, Laranjal Paulista, Tietê, Porto Feliz, Tatuí, Salto, São Pedro, Rafard, Elias Fausto.

---

## Licença

ISC
