const fs = require('fs');
const path = require('path');
const { buildSchema, GraphQLError } = require('graphql');
const { createHandler } = require('graphql-http/lib/use/express');

const schema = buildSchema(
    fs.readFileSync(path.join(__dirname, 'schema.graphql'), 'utf8')
);

function erro(message, code) {
    return new GraphQLError(message, { extensions: { code } });
}

function validarId(id) {
    if (!Number.isInteger(id) || id <= 0) {
        throw erro('id inválido', 'BAD_USER_INPUT');
    }
}

function validarTexto(valor, campo) {
    if (typeof valor !== 'string' || valor.trim() === '') {
        throw erro(`${campo} não pode ser vazio`, 'BAD_USER_INPUT');
    }
}

// O schema pede criadoEm como String, por isso converte-se a Date do Prisma
function paraGraphQL(livro) {
    return { ...livro, criadoEm: livro.criadoEm.toISOString() };
}

// Traduz erros do Prisma/PostgreSQL para erros GraphQL com código
function traduzirErro(e) {
    if (e instanceof GraphQLError) return e;
    switch (e.code) {
        case 'P2002':
            return erro('Já existe um livro com esse título', 'CONFLICT');
        case 'P2025':
            return erro('Registo não encontrado', 'NOT_FOUND');
        case 'P2003':
            return erro('Violação de integridade', 'CONFLICT');
        case 'P2000':
            return erro('Valor demasiado longo para o campo', 'BAD_USER_INPUT');
    }
    if (/check constraint/i.test(e.message || '')) {
        return erro('Valor viola uma regra da base de dados', 'BAD_USER_INPUT');
    }
    console.error(e);
    return erro('Erro interno', 'INTERNAL_SERVER_ERROR');
}

module.exports = function criarHandlerGraphQL({ prisma }) {
    const rootValue = {
        livros: async ({ estado }) => {
            try {
                const lista = await prisma.livro.findMany({
                    where: estado ? { estado } : undefined,
                    orderBy: { id: 'asc' }
                });
                return lista.map(paraGraphQL);
            } catch (e) {
                throw traduzirErro(e);
            }
        },

        livro: async ({ id }) => {
            validarId(id);
            try {
                const livro = await prisma.livro.findUnique({ where: { id } });
                if (!livro) {
                    throw erro(`Não existe livro com id ${id}`, 'NOT_FOUND');
                }
                return paraGraphQL(livro);
            } catch (e) {
                throw traduzirErro(e);
            }
        },

        createLivro: async ({ titulo, autor, estado }) => {
            validarTexto(titulo, 'titulo');
            validarTexto(autor, 'autor');
            try {
                const novo = await prisma.livro.create({
                    data: { titulo: titulo.trim(), autor: autor.trim(), estado }
                });
                return paraGraphQL(novo);
            } catch (e) {
                throw traduzirErro(e);
            }
        },

        updateLivro: async ({ id, titulo, autor, estado }) => {
            validarId(id);
            validarTexto(titulo, 'titulo');
            validarTexto(autor, 'autor');
            try {
                const livro = await prisma.livro.update({
                    where: { id },
                    data: { titulo: titulo.trim(), autor: autor.trim(), estado }
                });
                return paraGraphQL(livro);
            } catch (e) {
                throw traduzirErro(e);
            }
        }
    };

    return createHandler({ schema, rootValue });
};