const path = require('path');
process.env.ADMIN_TOKEN = 'itest_admin_token';
process.env.OPENAI_API_KEY = 'sk-test'; // dummy; openai call will fail gracefully if network blocked
process.env.DATA_DIR = path.join(__dirname, 'tmp-data');
const fs = require('fs');
const { app, start } = require('../server');
const request = require('supertest');

// Ensure isolated data dir
beforeAll(()=>{
  if(!fs.existsSync(process.env.DATA_DIR)) fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
});

describe('Integration: basic health & admin', () => {
  test('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('Admin categories CRUD', async () => {
    const agent = request(app);
    const auth = { Authorization: 'Bearer '+process.env.ADMIN_TOKEN };
    const create = await agent.post('/api/admin/categories').set(auth).send({ name: 'CatOne' });
    expect(create.status).toBe(200);
    const list = await agent.get('/api/admin/categories').set(auth);
    expect(list.body.find(c=> c.name==='CatOne')).toBeTruthy();
  });

  test('Template create + extract variables endpoint', async () => {
    const agent = request(app);
    const auth = { Authorization: 'Bearer '+process.env.ADMIN_TOKEN };
    const body = 'Hello <<Client>>';
    const tpl = await agent.post('/api/admin/templates').set(auth).send({ name:'Welcome', body });
    expect(tpl.status).toBe(200);
    const extract = await agent.post('/api/admin/variables/extract').set(auth).send({ body });
    expect(extract.body.variables).toContain('Client');
  });
});
