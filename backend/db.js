require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
module.exports = new PrismaClient();