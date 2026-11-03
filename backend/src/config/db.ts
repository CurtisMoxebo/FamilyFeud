/**
 * Prisma Client Database Singleton (US-01 & US-19)
 * Exports strongly typed PrismaClient instance for MySQL connection lifecycle.
 */
import defaultPrisma from '../services/db';

export const prisma = defaultPrisma;
export default prisma;
