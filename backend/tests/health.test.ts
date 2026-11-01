import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';

describe('Backend Regression Suite: REST API & Health Check', () => {
  it('GET /api/health returns 200 with ok status and valid timestamp', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'family-feud-backend');
    expect(res.body).toHaveProperty('timestamp');
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('GET /api/nonexistent returns 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });

  it('supports CORS headers on requests', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

