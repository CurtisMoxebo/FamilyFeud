import { describe, it, expect } from 'vitest';
import prismaFromServices from '../src/services/db';
import prismaFromConfig, { prisma as prismaNamed } from '../src/config/db';

describe('US-19: Backend Database Layer & Prisma Singleton Client', () => {
  it('exports a valid PrismaClient singleton instance from services/db and config/db', () => {
    expect(prismaFromServices).toBeDefined();
    expect(prismaFromConfig).toBeDefined();
    expect(prismaNamed).toBeDefined();
    expect(prismaFromServices).toBe(prismaFromConfig);
    expect(prismaFromConfig).toBe(prismaNamed);
  });

  it('exposes all required data model delegates for US-19 architecture', () => {
    expect(prismaFromConfig.room).toBeDefined();
    expect(prismaFromConfig.player).toBeDefined();
    expect(prismaFromConfig.game).toBeDefined();
    expect(prismaFromConfig.question).toBeDefined();
    expect(prismaFromConfig.answer).toBeDefined();
    expect(prismaFromConfig.playerResponse).toBeDefined();
  });

  it('exposes standard CRUD operations on room delegate', () => {
    expect(typeof prismaFromConfig.room.findMany).toBe('function');
    expect(typeof prismaFromConfig.room.findUnique).toBe('function');
    expect(typeof prismaFromConfig.room.create).toBe('function');
    expect(typeof prismaFromConfig.room.update).toBe('function');
    expect(typeof prismaFromConfig.room.delete).toBe('function');
  });

  it('exposes standard CRUD operations on playerResponse delegate for audit logging', () => {
    expect(typeof prismaFromConfig.playerResponse.findMany).toBe('function');
    expect(typeof prismaFromConfig.playerResponse.findUnique).toBe('function');
    expect(typeof prismaFromConfig.playerResponse.create).toBe('function');
    expect(typeof prismaFromConfig.playerResponse.deleteMany).toBe('function');
  });
});
