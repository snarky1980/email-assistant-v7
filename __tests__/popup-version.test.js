const fs = require('fs');
const path = require('path');

test('popup script version matches index.html query', () => {
  const root = path.join(__dirname, '..');
  const popup = fs.readFileSync(path.join(root,'assets','var-popup-integrated.js'),'utf8');
  const index = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const m1 = popup.match(/VAR_POPUP_SCRIPT_VERSION\s*=\s*'([^']+)'/);
  expect(m1).toBeTruthy();
  const scriptVer = m1[1];
  const m2 = index.match(/var-popup-integrated\.js\?v=([A-Za-z0-9_.-]+)/);
  expect(m2).toBeTruthy();
  const htmlVer = m2[1];
  expect(scriptVer).toBe(htmlVer);
});
