# TP3 — Persistência e relações na API

LEI022 — Laboratório de Desenvolvimento de Software · 2026/27 · 3.º ano · Trabalho individual
**Autor:** Afonso Coelho
**Commit a avaliar:** `<hash>`

## Descrição

Este projeto evolui a API REST do TP1/TP2 (Node.js e Express), que guardava os dados em memória, para uma solução com persistência relacional em **PostgreSQL**, através do ORM **Prisma**. O domínio e os recursos mantêm-se (items, livros e clientes), foi acrescentada a entidade **Empréstimo**, que relaciona clientes e livros, e o endpoint GraphQL do TP2 passou também a usar a base de dados.

Após reiniciar a API, os dados permanecem disponíveis.

## Tecnologias utilizadas

- Node.js e Express.js
- PostgreSQL
- Prisma ORM (modelos, migrações e cliente)
- GraphQL (`graphql`, `graphql-http`)
- dotenv (variáveis de ambiente)
- Postman / Insomnia

## Requisitos

- Node.js (versão LTS) e npm
- PostgreSQL em execução (local ou Docker)
- Postman ou Insomnia

## Instalação e configuração

1. Entrar na pasta do backend e instalar as dependências:

```bash
cd backend
npm install
```

2. Criar o ficheiro de ambiente a partir do exemplo e preencher com os dados do teu PostgreSQL:

```bash
cp .env.example .env
```

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME?schema=public"
PORT=3000
```

O ficheiro `.env` não é versionado (está no `.gitignore`). O `.env.example` não contém segredos. Se a password tiver caracteres especiais (`@`, `#`, `/`, `:`), deve ser codificada no URL (ex.: `@` → `%40`).

3. Criar a base de dados (se ainda não existir):

```bash
psql -U postgres -c "CREATE DATABASE lei022;"
```

Alternativa com Docker:

```bash
docker run --name lei022-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lei022 -p 5432:5432 -d postgres:16
```

## Migrações

Aplicar as migrações existentes e gerar o cliente Prisma:

```bash
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```

O último comando deve indicar `Database schema is up to date!`.

Para recomeçar com uma base de dados vazia (ambiente de desenvolvimento):

```bash
npx prisma migrate reset --force --skip-seed
```

## Execução

```bash
node server.js
```

Quando o servidor estiver a funcionar, será apresentada a mensagem:

```
API a executar em http://localhost:3000
```

A API REST fica em `http://localhost:3000/api/...` e o endpoint GraphQL em `http://localhost:3000/graphql`.

## Modelo de dados

Modelos definidos em `backend/prisma/schema.prisma`:

| Modelo | Campos principais | Restrições |
|---|---|---|
| `Item` | `id`, `name` | `name` obrigatório (máx. 100) |
| `Cliente` | `id`, `nome`, `email`, `estado` (`ativo`/`inativo`), `criadoEm` | `email` único |
| `Livro` | `id`, `titulo`, `autor`, `estado` (`disponivel`/`emprestado`/`avariado`), `criadoEm` | título único sem distinguir maiúsculas/minúsculas |
| `Empréstimo` | `id`, `clienteId`, `livroId`, `emprestadoEm`, `devolvidoEm` | chaves estrangeiras para `Cliente` e `Livro` |

### Relações

Relação **N:M** entre `Cliente` e `Livro` através da entidade `Empréstimo` (um cliente pode ter vários empréstimos e um livro pode ser emprestado a vários clientes ao longo do tempo). Cada empréstimo tem duas chaves estrangeiras com `ON DELETE RESTRICT`: não é possível apagar um cliente ou um livro que tenha empréstimos associados.

### Regras protegidas pela base de dados

Além da validação da API, as seguintes regras são garantidas pelo PostgreSQL (migração `prisma/migrations/*_init/migration.sql`):

- `Cliente.email` único (índice único).
- Título de livro único sem distinguir maiúsculas/minúsculas (índice único em `LOWER("titulo")`).
- Um livro só pode ter um empréstimo ativo de cada vez (índice único parcial em `livroId` onde `devolvidoEm IS NULL`).
- `CHECK` para título, autor e nome não vazios.
- `CHECK` para a data de devolução não ser anterior à data de empréstimo.
- Chaves estrangeiras com `ON DELETE RESTRICT`.

## Endpoints REST

**Items:** `GET /api/items` (filtro `name`, ordenação `sort`/`order`, paginação `page`/`limit`), `GET /api/items/:id`, `POST /api/items`, `PUT /api/items/:id`, `DELETE /api/items/:id`

**Livros:** `GET /api/livros`, `GET /api/livros/:id`, `POST /api/livros`, `PUT /api/livros/:id`, `DELETE /api/livros/:id`, `GET /api/livros/:id/emprestimos`

**Clientes:** `GET /api/clientes`, `GET /api/clientes/:id`, `POST /api/clientes`, `PUT /api/clientes/:id`, `DELETE /api/clientes/:id`, `GET /api/clientes/:id/emprestimos`

**Empréstimos (relação e transações):** `GET /api/emprestimos`, `GET /api/emprestimos/:id`, `POST /api/emprestimos`, `POST /api/emprestimos/:id/devolver`

## Operações transacionais

As operações que exigem várias alterações dependentes são executadas com `prisma.$transaction`:

- **Emprestar (`POST /api/emprestimos`):** valida o cliente (existe e está ativo), marca o livro como `emprestado` (atualização condicional apenas se estiver `disponivel`) e cria o empréstimo.
- **Devolver (`POST /api/emprestimos/:id/devolver`):** verifica que o empréstimo não foi devolvido, repõe o livro como `disponivel` e regista `devolvidoEm`.

Se qualquer passo falhar, nenhuma alteração é guardada.

## Tratamento de erros

O formato de erro do TP1 mantém-se (`application/problem+json`):

```json
{ "status": 404, "title": "Não encontrado", "detail": "Não existe livro com id 9999" }
```

| Situação | Origem | Resposta |
|---|---|---|
| Dados inválidos, id não numérico, JSON malformado | Validação da API | 400 |
| Registo inexistente | Validação da API ou Prisma `P2025` | 404 |
| Valor duplicado (email, título) | Prisma `P2002` | 409 |
| Violação de integridade (apagar registo com empréstimos) | Prisma `P2003` | 409 |
| Livro indisponível, empréstimo já devolvido | Regra de negócio | 409 |
| Valor viola um `CHECK` da base de dados | PostgreSQL | 400 |
| Erro inesperado | — | 500 |

## GraphQL (TP2)

O endpoint `/graphql` mantém o contrato do TP2 (`schema.graphql`), mas os resolvers passaram a usar o Prisma:

- Queries: `livros(estado: Estado)`, `livro(id: Int!)`
- Mutations: `createLivro`, `updateLivro`
- Códigos de erro (`extensions.code`): `BAD_USER_INPUT`, `NOT_FOUND`, `CONFLICT`

## Testes e evidências

A coleção Postman está em `tests/LEI022-TP3.postman_collection.json`.

**Como repetir os testes:**

1. Repor a base de dados vazia: `npx prisma migrate reset --force --skip-seed`
2. Arrancar o servidor: `node server.js`
3. No Postman: Import → selecionar a coleção. Confirmar a variável `baseUrl = http://localhost:3000`.
4. Executar a coleção com o **Collection Runner**, pela ordem das pastas.

**Pastas da coleção:**

| Pasta | O que verifica | Esperado |
|---|---|---|
| 01 - Livros (CRUD) | Criar, listar, obter, atualizar, apagar | 201, 200, 200, 200, 204 |
| 02 - Clientes (CRUD) | Criar, listar, obter, atualizar | 201, 200, 200, 200 |
| 03 - Items (CRUD) | Criar, listar, obter, atualizar, apagar | 201, 200, 200, 200, 204 |
| 04 - Relações e transações | Emprestar, consultar relações, devolver | 201, 200, 200, 200, 200 |
| 05 - Entradas inválidas | Campos em falta, estado inválido, email inválido, id inválido, JSON malformado | 400 |
| 06 - Registos inexistentes | Livro, cliente e rota inexistentes | 404 |
| 07 - Conflitos de integridade | Título e email duplicados, livro indisponível, apagar com empréstimos, dupla devolução | 409 |
| 08 - GraphQL sobre a BD | Seleção de campos, criação, `NOT_FOUND`, `CONFLICT`, `BAD_USER_INPUT` | `data` ou `errors[0].extensions.code` |
| 09 - Persistência após reinício | Listar antes e depois de reiniciar o servidor | Dados iguais |

**Resultados:** `<preencher: nº de pedidos executados, nº de testes aprovados, e referência às capturas de ecrã em tests/evidencias/>`

**Persistência após reinício:** foram criados dados, o servidor foi parado (Ctrl+C) e arrancado de novo com `node server.js`, e o `GET /api/livros` devolveu os mesmos dados. `<referência às capturas>`

## Estrutura do projeto

```
lei022-tp2-Afonso-Coelho/
│
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── graphql/
│   │   └── index.js
│   ├── schema.graphql
│   ├── prisma.config.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
│
├── tests/
│   └── LEI022-TP3.postman_collection.json
│
└── README.md
```

## Declaração de utilização de Inteligência Artificial

Durante o desenvolvimento deste trabalho foi utilizada Inteligência Artificial (Claude, da Anthropic) como ferramenta de apoio.

A IA foi utilizada para esclarecimento de dúvidas e compreensão de conceitos (Prisma, migrações, transações), apoio na estrutura do esquema e das migrações, identificação e correção de erros (configuração da ligação à base de dados, erros de migração), sugestão da estrutura da coleção de testes e apoio na organização da documentação.

O código sugerido foi analisado, adaptado ao domínio do projeto e testado pelo aluno. As migrações foram aplicadas e verificadas na base de dados, e os testes foram executados e os resultados validados pelo aluno, que é responsável pela solução final.