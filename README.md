# Crawler de Concursos Públicos

Crawler modular em Node.js que monitora concursos públicos com inscrições abertas na região de **Capivari-SP** (raio de ~100 km). Os resultados são persistidos em SQLite via **Knex.js** e notificados no Slack apenas quando há concursos **novos**.

---

## Funcionalidades

| Módulo | Responsabilidade |
|--------|------------------|
| **Spiders** (`jcConcursos`, `pciConcursos`) | Raspagem de sites de concursos, filtro geográfico e validação de links |
| **Banco SQLite + Knex** (`db.js`) | Persistência via query builder, controle de execução diária e lock contra corridas |
| **Slack** (`slack.js`) | Notificação formatada apenas de concursos inéditos |
| **Geo filter** (`geoFilter.js`) | Cidades-alvo, normalização de texto e fuso horário |
| **Segurança** (`security.js`, `httpClient.js`) | Whitelist de domínios, sanitização e limites HTTP |
| **Agendamento** (systemd) | Execução diária às 10h + catch-up no boot |

### O que o sistema faz

1. **Raspagem diária** — consulta PCI Concursos (Sudeste) e JC Concursos em busca de vagas em SP.
2. **Filtro geográfico** — mantém apenas concursos de cidades num raio de ~100 km de Capivari.
3. **Deduplicação** — remove duplicatas pelo link do concurso.
4. **Persistência** — grava/atualiza registros em `data/concursos.db`.
5. **Notificação seletiva** — envia ao Slack somente concursos que ainda não existiam no banco.
6. **Controle de execução** — impede mais de uma raspagem bem-sucedida por dia; lock com expiração de 30 min.
7. **Catch-up no boot** — se o PC ligar após as 10h e a raspagem do dia não rodou, executa automaticamente.

---

## Segurança

Auditoria focada em vetores que poderiam comprometer o computador local (SSRF, injeção, execução arbitrária, path traversal).

### Vulnerabilidades identificadas e mitigadas

| Risco | Vetor original | Proteção aplicada |
|-------|----------------|-------------------|
| **SSRF** | URLs arbitrárias em requisições HTTP | Whitelist de domínios em `security.js`; guard no `httpClient.js` bloqueia hosts fora da lista |
| **Open redirect / links maliciosos** | `javascript:`, `data:`, domínios externos nos spiders | `normalizarLinkSeguro()` rejeita protocolos perigosos; só aceita HTTPS de domínios permitidos |
| **Injeção no Slack** | Texto raspado enviado ao webhook | `sanitizeSlackText()` escapa `&`, `<`, `>`; truncamento de campos |
| **Webhook arbitrário** | `SLACK_WEBHOOK_URL` malformada ou apontando para servidor interno | Validação por regex estrita (`hooks.slack.com/services/...`) |
| **Path traversal no cron** | `PROJECT_DIR` com `\|` ou newline no script de instalação | Validação em `install-cron.sh` |
| **Corrida de execução** | Múltiplas instâncias simultâneas corrompendo estado | `reservarExecucao()` com status `running` e lock expirável |
| **Respostas HTTP enormes** | DoS por payload gigante | Limite de tamanho, timeout e redirects no `httpClient.js` |
| **Credenciais em URL** | `https://user:pass@host` | Rejeitado em `parseHttpsUrl()` |

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
