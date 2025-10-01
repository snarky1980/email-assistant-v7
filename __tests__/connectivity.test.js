const request = require('supertest');
const { app } = require('../server');

describe('Connectivity & basic routes', () => {
  it('serves root index.html', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Assistant Modèles de Courriels/);
  });

  it('serves admin studio HTML', async () => {
    const res = await request(app).get('/admin');
    // When no admin token file yet, it may 500 with Admin disabled message; accept 200 or 500 but body should mention Admin
    expect([200,500]).toContain(res.status);
    expect(res.text).toMatch(/Admin Studio|Admin disabled/);
  });

  it('returns health JSON', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('templates');
  });

  it('openai endpoint reports missing key gracefully', async () => {
    const res = await request(app).post('/api/openai').send({ prompt: 'Test' });
    expect([400,500]).toContain(res.status); // 500 when key missing, 400 if prompt invalid; here likely 500
  });
});
