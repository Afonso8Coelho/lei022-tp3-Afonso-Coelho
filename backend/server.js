require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const criarHandlerGraphQL = require('./graphql');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(express.json());

function sendError(res, status, title, detail) {
    return res
        .status(status)
        .type('application/problem+json')
        .json({ status, title, detail });
}

class HttpError extends Error {
    constructor(status, title, detail) {
        super(detail);
        this.status = status;
        this.title = title;
        this.detail = detail;
    }
}

const ah = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

function parseId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new HttpError(400, 'Pedido inválido', 'id inválido');
    }
    return id;
}

function textoObrigatorio(valor, campo) {
    if (typeof valor !== 'string' || valor.trim() === '') {
        throw new HttpError(
            400,
            'Pedido inválido',
            `${campo} é obrigatório e deve ser texto não vazio`
        );
    }
    return valor.trim();
}

const ESTADOS_LIVRO = ['disponivel', 'emprestado', 'avariado'];
const ESTADOS_CLIENTE = ['ativo', 'inativo'];

app.get('/api/items', ah(async (req, res) => {
    const { name, sort, order, page, limit } = req.query;

    const where = {};
    if (name !== undefined) {
        if (typeof name !== 'string') {
            throw new HttpError(400, 'Pedido inválido', 'Parâmetro name inválido');
        }
        where.name = { contains: name.trim(), mode: 'insensitive' };
    }

    let orderBy = { id: 'asc' };
    if (sort) {
        if (sort !== 'id' && sort !== 'name') {
            throw new HttpError(
                400,
                'Pedido inválido',
                'Parâmetro sort inválido. Utilize "id" ou "name"'
            );
        }
        const dir = order && order.toLowerCase() === 'desc' ? 'desc' : 'asc';
        orderBy = { [sort]: dir };
    }

    if (page !== undefined || limit !== undefined) {
        const pageNum = Number(page || 1);
        const limitNum = Number(limit || 10);

        if (
            !Number.isInteger(pageNum) || pageNum < 1 ||
            !Number.isInteger(limitNum) || limitNum < 1
        ) {
            throw new HttpError(
                400,
                'Pedido inválido',
                'Parâmetros de paginação inválidos. Use inteiros positivos'
            );
        }

        const [total, items] = await Promise.all([
            prisma.item.count({ where }),
            prisma.item.findMany({
                where,
                orderBy,
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            })
        ]);

        return res.status(200).json({ page: pageNum, limit: limitNum, total, items });
    }

    res.status(200).json(await prisma.item.findMany({ where, orderBy }));
}));

app.get('/api/items/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) {
        throw new HttpError(404, 'Não encontrado', `Não existe item com id ${id}`);
    }
    res.status(200).json(item);
}));

app.post('/api/items', ah(async (req, res) => {
    const name = textoObrigatorio((req.body || {}).name, 'name');
    const novo = await prisma.item.create({ data: { name } });
    res.status(201).location(`/api/items/${novo.id}`).json(novo);
}));

app.put('/api/items/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const name = textoObrigatorio((req.body || {}).name, 'name');
    const item = await prisma.item.update({ where: { id }, data: { name } });
    res.status(200).json(item);
}));

app.delete('/api/items/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    await prisma.item.delete({ where: { id } });
    res.status(204).send();
}));

app.get('/api/livros', ah(async (req, res) => {
    res.status(200).json(await prisma.livro.findMany({ orderBy: { id: 'asc' } }));
}));

app.get('/api/livros/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const livro = await prisma.livro.findUnique({ where: { id } });
    if (!livro) {
        throw new HttpError(404, 'Não encontrado', `Não existe livro com id ${id}`);
    }
    res.status(200).json(livro);
}));

// Relação: histórico de empréstimos de um livro
app.get('/api/livros/:id/emprestimos', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const livro = await prisma.livro.findUnique({
        where: { id },
        include: { emprestimos: { include: { cliente: true }, orderBy: { id: 'asc' } } }
    });
    if (!livro) {
        throw new HttpError(404, 'Não encontrado', `Não existe livro com id ${id}`);
    }
    res.status(200).json(livro.emprestimos);
}));

app.post('/api/livros', ah(async (req, res) => {
    const { titulo, autor, estado } = req.body || {};

    if (
        typeof titulo !== 'string' ||
        typeof autor !== 'string' ||
        typeof estado !== 'string'
    ) {
        throw new HttpError(400, 'Pedido inválido', 'Dados inválidos');
    }
    if (!ESTADOS_LIVRO.includes(estado)) {
        throw new HttpError(400, 'Pedido inválido', 'Estado inválido');
    }

    const novo = await prisma.livro.create({
        data: {
            titulo: textoObrigatorio(titulo, 'titulo'),
            autor: textoObrigatorio(autor, 'autor'),
            estado
        }
    });
    res.status(201).location(`/api/livros/${novo.id}`).json(novo);
}));

app.put('/api/livros/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { titulo, autor, estado } = req.body || {};

    if (
        typeof titulo !== 'string' ||
        typeof autor !== 'string' ||
        !ESTADOS_LIVRO.includes(estado)
    ) {
        throw new HttpError(400, 'Pedido inválido', 'Dados inválidos');
    }

    const livro = await prisma.livro.update({
        where: { id },
        data: {
            titulo: textoObrigatorio(titulo, 'titulo'),
            autor: textoObrigatorio(autor, 'autor'),
            estado
        }
    });
    res.status(200).json(livro);
}));

app.delete('/api/livros/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    await prisma.livro.delete({ where: { id } }); // P2003 -> 409 se tiver empréstimos
    res.status(204).send();
}));

app.get('/api/clientes', ah(async (req, res) => {
    res.status(200).json(await prisma.cliente.findMany({ orderBy: { id: 'asc' } }));
}));

app.get('/api/clientes/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) {
        throw new HttpError(404, 'Não encontrado', `Não existe cliente com id ${id}`);
    }
    res.status(200).json(cliente);
}));

app.get('/api/clientes/:id/emprestimos', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: { emprestimos: { include: { livro: true }, orderBy: { id: 'asc' } } }
    });
    if (!cliente) {
        throw new HttpError(404, 'Não encontrado', `Não existe cliente com id ${id}`);
    }
    res.status(200).json(cliente.emprestimos);
}));

app.post('/api/clientes', ah(async (req, res) => {
    const { nome, email, estado = 'ativo' } = req.body || {};
    const emailLimpo = textoObrigatorio(email, 'email');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
        throw new HttpError(400, 'Pedido inválido', 'email inválido');
    }
    if (!ESTADOS_CLIENTE.includes(estado)) {
        throw new HttpError(400, 'Pedido inválido', 'Estado inválido');
    }

    const novo = await prisma.cliente.create({
        data: { nome: textoObrigatorio(nome, 'nome'), email: emailLimpo.toLowerCase(), estado }
    });
    res.status(201).location(`/api/clientes/${novo.id}`).json(novo);
}));

app.put('/api/clientes/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { nome, email, estado } = req.body || {};
    const emailLimpo = textoObrigatorio(email, 'email');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
        throw new HttpError(400, 'Pedido inválido', 'email inválido');
    }
    if (!ESTADOS_CLIENTE.includes(estado)) {
        throw new HttpError(400, 'Pedido inválido', 'Estado inválido');
    }

    const cliente = await prisma.cliente.update({
        where: { id },
        data: { nome: textoObrigatorio(nome, 'nome'), email: emailLimpo.toLowerCase(), estado }
    });
    res.status(200).json(cliente);
}));

app.delete('/api/clientes/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    await prisma.cliente.delete({ where: { id } }); // P2003 -> 409 se tiver empréstimos
    res.status(204).send();
}));

app.get('/api/emprestimos', ah(async (req, res) => {
    res.status(200).json(
        await prisma.emprestimo.findMany({
            include: { cliente: true, livro: true },
            orderBy: { id: 'asc' }
        })
    );
}));

app.get('/api/emprestimos/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const emp = await prisma.emprestimo.findUnique({
        where: { id },
        include: { cliente: true, livro: true }
    });
    if (!emp) {
        throw new HttpError(404, 'Não encontrado', `Não existe empréstimo com id ${id}`);
    }
    res.status(200).json(emp);
}));

app.post('/api/emprestimos', ah(async (req, res) => {
    const { clienteId, livroId } = req.body || {};

    if (
        !Number.isInteger(clienteId) || clienteId <= 0 ||
        !Number.isInteger(livroId) || livroId <= 0
    ) {
        throw new HttpError(
            400,
            'Pedido inválido',
            'clienteId e livroId são obrigatórios e devem ser inteiros positivos'
        );
    }

    const emprestimo = await prisma.$transaction(async (tx) => {
        const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
        if (!cliente) {
            throw new HttpError(404, 'Não encontrado', `Não existe cliente com id ${clienteId}`);
        }
        if (cliente.estado !== 'ativo') {
            throw new HttpError(409, 'Conflito', 'O cliente não está ativo');
        }

        const atualizado = await tx.livro.updateMany({
            where: { id: livroId, estado: 'disponivel' },
            data: { estado: 'emprestado' }
        });

        if (atualizado.count === 0) {
            const livro = await tx.livro.findUnique({ where: { id: livroId } });
            if (!livro) {
                throw new HttpError(404, 'Não encontrado', `Não existe livro com id ${livroId}`);
            }
            throw new HttpError(409, 'Conflito', `O livro não está disponível (estado: ${livro.estado})`);
        }

        return tx.emprestimo.create({
            data: { clienteId, livroId },
            include: { cliente: true, livro: true }
        });
    });

    res.status(201).location(`/api/emprestimos/${emprestimo.id}`).json(emprestimo);
}));

app.post('/api/emprestimos/:id/devolver', ah(async (req, res) => {
    const id = parseId(req.params.id);

    const emprestimo = await prisma.$transaction(async (tx) => {
        const atual = await tx.emprestimo.findUnique({ where: { id } });
        if (!atual) {
            throw new HttpError(404, 'Não encontrado', `Não existe empréstimo com id ${id}`);
        }
        if (atual.devolvidoEm) {
            throw new HttpError(409, 'Conflito', 'Este empréstimo já foi devolvido');
        }

        await tx.livro.update({
            where: { id: atual.livroId },
            data: { estado: 'disponivel' }
        });

        return tx.emprestimo.update({
            where: { id },
            data: { devolvidoEm: new Date() },
            include: { cliente: true, livro: true }
        });
    });

    res.status(200).json(emprestimo);
}));

app.all('/graphql', criarHandlerGraphQL({ prisma }));

app.use((req, res) => {
    sendError(res, 404, 'Não encontrado', 'Rota não existe');
});

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return sendError(res, 400, 'Pedido inválido', 'JSON malformado');
    }

    if (err instanceof HttpError) {
        return sendError(res, err.status, err.title, err.detail);
    }

    switch (err.code) {
        case 'P2002':
            return sendError(res, 409, 'Conflito', 'Já existe um registo com esse valor único');
        case 'P2025':
            return sendError(res, 404, 'Não encontrado', 'Registo não encontrado');
        case 'P2003':
            return sendError(
                res,
                409,
                'Conflito',
                'Violação de integridade: referência inválida ou registo em uso'
            );
        case 'P2000':
            return sendError(res, 400, 'Pedido inválido', 'Valor demasiado longo para o campo');
    }

    if (/check constraint/i.test(err.message || '')) {
        return sendError(res, 400, 'Pedido inválido', 'Valor viola uma regra da base de dados');
    }

    console.error(err);
    sendError(res, 500, 'Erro interno', 'Ocorreu um erro inesperado');
});

const server = app.listen(PORT, () => {
    console.log(`API a executar em http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    await prisma.$disconnect();
    server.close(() => process.exit(0));
});