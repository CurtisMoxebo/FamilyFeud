/**
 * Prisma Client Database Singleton (US-01 & US-19)
 * Exports strongly typed PrismaClient instance for MySQL connection lifecycle.
 */
import prisma from '../services/db';

export { prisma };
export default prisma;

