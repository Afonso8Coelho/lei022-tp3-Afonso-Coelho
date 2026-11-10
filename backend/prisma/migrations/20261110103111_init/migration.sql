-- CreateEnum
CREATE TYPE "EstadoLivro" AS ENUM ('disponivel', 'emprestado', 'avariado');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('ativo', 'inativo');

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "estado" "EstadoCliente" NOT NULL DEFAULT 'ativo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Livro" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "autor" VARCHAR(150) NOT NULL,
    "estado" "EstadoLivro" NOT NULL DEFAULT 'disponivel',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Livro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Emprestimo" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "livroId" INTEGER NOT NULL,
    "emprestadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devolvidoEm" TIMESTAMP(3),

    CONSTRAINT "Emprestimo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_email_key" ON "Cliente"("email");

-- CreateIndex
CREATE INDEX "Emprestimo_clienteId_idx" ON "Emprestimo"("clienteId");

-- CreateIndex
CREATE INDEX "Emprestimo_livroId_idx" ON "Emprestimo"("livroId");

-- AddForeignKey
ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_livroId_fkey" FOREIGN KEY ("livroId") REFERENCES "Livro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Título único sem distinguir maiúsculas/minúsculas
CREATE UNIQUE INDEX "Livro_titulo_lower_key" ON "Livro" (LOWER("titulo"));

-- Um livro só pode ter um empréstimo ativo de cada vez
CREATE UNIQUE INDEX "Emprestimo_livro_ativo_key" ON "Emprestimo" ("livroId") WHERE "devolvidoEm" IS NULL;

-- Campos não vazios
ALTER TABLE "Livro"   ADD CONSTRAINT "livro_titulo_nao_vazio" CHECK (LENGTH(TRIM("titulo")) > 0);
ALTER TABLE "Livro"   ADD CONSTRAINT "livro_autor_nao_vazio"  CHECK (LENGTH(TRIM("autor")) > 0);
ALTER TABLE "Cliente" ADD CONSTRAINT "cliente_nome_nao_vazio" CHECK (LENGTH(TRIM("nome")) > 0);

-- Devolução não pode ser anterior ao empréstimo
ALTER TABLE "Emprestimo" ADD CONSTRAINT "emprestimo_datas_validas"
  CHECK ("devolvidoEm" IS NULL OR "devolvidoEm" >= "emprestadoEm");
