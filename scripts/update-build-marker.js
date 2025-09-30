#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function getGitHash(){ try { return execSync('git rev-parse --short HEAD',{stdio:['ignore','pipe','ignore']}).toString().trim(); } catch { return 'nohash'; } }
(function run(){
  const file = path.join(__dirname,'..','index.html');
  let html; try { html = fs.readFileSync(file,'utf8'); } catch(e){ console.error('Cannot read index.html', e.message); process.exit(0); }
  const now = new Date().toISOString();
  const hash = getGitHash();
  const marker = `<!-- build-marker: ${now} ${hash} -->`;
  if(html.includes('<!-- build-marker:')){ html = html.replace(/<!-- build-marker:.*?-->/, marker); } else { html = html.replace('</head>', marker + '\n</head>'); }
  if(/<meta name="revision"/i.test(html)){ html = html.replace(/<meta name="revision"[^>]*>/i, `<meta name="revision" content="${hash}" />`); } else { html = html.replace('</head>', `  <meta name="revision" content="${hash}" />\n</head>`); }
  if(!/data-build-badge/.test(html)){
    html = html.replace('</body>', `  <div data-build-badge style="position:fixed;bottom:4px;right:6px;font:10px system-ui;background:#111827;color:#e5e7eb;padding:3px 6px;border-radius:6px;opacity:.55;z-index:99999;letter-spacing:.5px;">${hash}</div>\n</body>`);
  } else {
    html = html.replace(/(<div data-build-badge[^>]*>)([^<]*)(<\/div>)/, `$1${hash}$3`);
  }
  fs.writeFileSync(file, html);
  console.log('Updated build marker:', marker);
})();
