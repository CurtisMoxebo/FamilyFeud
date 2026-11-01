import { describe, it, expect } from 'vitest';
import prisma from '../src/services/db';

describe('Backend Regression Suite: Prisma ORM & Database Layer', () => {
  it('exports a valid PrismaClient singleton instance', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma).toBe('object');
  });

  it('exposes all required data model delegates', () => {
    expect(prisma.room).toBeDefined();
    expect(prisma.player).toBeDefined();
    expect(prisma.game).toBeDefined();
    expect(prisma.question).toBeDefined();
    expect(prisma.answer).toBeDefined();
    expect(prisma.playerResponse).toBeDefined();
  });

  it('exposes standard CRUD operations on room delegate', () => {
    expect(typeof prisma.room.findMany).toBe('function');
    expect(typeof prisma.room.findUnique).toBe('function');
    expect(typeof prisma.room.create).toBe('function');
    expect(typeof prisma.room.update).toBe('function');
    expect(typeof prisma.room.delete).toBe('function');
  });
});

