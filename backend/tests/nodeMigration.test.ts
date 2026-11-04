import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function resolveRepoRoot(): string {
  if (process.env.REPO_ROOT && fs.existsSync(process.env.REPO_ROOT)) {
    return process.env.REPO_ROOT;
  }
  let current = __dirname;
  while (current && current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, '.nvmrc')) &&
      fs.existsSync(path.join(current, 'docker-compose.yml'))
    ) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(__dirname, '../..');
}

describe('US-23 Step 3: Node.js v24 LTS Infrastructure & CI Configuration', () => {
  const repoRoot = resolveRepoRoot();

  it('1. pins Node.js v24 in root .nvmrc file', () => {
    const nvmrcPath = path.join(repoRoot, '.nvmrc');
    expect(fs.existsSync(nvmrcPath)).toBe(true);
    const content = fs.readFileSync(nvmrcPath, 'utf8').trim();
    expect(content).toBe('24');
  });

  it('2. declares engine constraints (node >=24.0.0, npm >=11.0.0) in root, backend, and frontend package.json', () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const backendPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'backend/package.json'), 'utf8'));
    const frontendPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8'));

    for (const [name, pkg] of [
      ['root', rootPkg],
      ['backend', backendPkg],
      ['frontend', frontendPkg],
    ] as const) {
      expect(pkg.engines, `${name} package.json must declare engines`).toBeDefined();
      expect(pkg.engines.node).toBe('>=24.0.0');
      expect(pkg.engines.npm).toBe('>=11.0.0');
    }
  });

  it('3. configures @types/node ^24.x and ES2023 compiler target in backend', () => {
    const backendPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'backend/package.json'), 'utf8'));
    expect(backendPkg.devDependencies['@types/node']).toMatch(/^\^24\./);

    const tsconfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'backend/tsconfig.json'), 'utf8'));
    expect(tsconfig.compilerOptions.target).toBe('ES2023');
  });

  it('4. pins node:24-alpine across backend and frontend multi-stage Dockerfiles', () => {
    const backendDocker = fs.readFileSync(path.join(repoRoot, 'backend/Dockerfile'), 'utf8');
    const frontendDocker = fs.readFileSync(path.join(repoRoot, 'frontend/Dockerfile'), 'utf8');

    expect(backendDocker).toContain('FROM node:24-alpine AS builder');
    expect(backendDocker).toContain('FROM node:24-alpine AS runner');
    expect(frontendDocker).toContain('FROM node:24-alpine AS builder');
  });

  it('5. configures GitHub Actions CI to load Node.js 24 from .nvmrc across all 4 build/test jobs', () => {
    const ciYaml = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');

    const setupMatches = ciYaml.match(/Setup Node\.js 24\.x/g);
    expect(setupMatches).not.toBeNull();
    expect(setupMatches?.length).toBe(4);

    const nvmrcMatches = ciYaml.match(/node-version-file:\s*'\.nvmrc'/g);
    expect(nvmrcMatches).not.toBeNull();
    expect(nvmrcMatches?.length).toBe(4);
  });
});
