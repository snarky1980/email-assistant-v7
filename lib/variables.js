function extractVariables(body) {
  if (typeof body !== 'string') return [];
  const angled = /<<\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9_\.\-]+)\s*>>/g;
  const curly = /{{\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9_\.\-]+)\s*}}/g;
  const found = new Map();
  let m; while ((m = angled.exec(body))) { const key=m[1]; const low=key.toLowerCase(); if(!found.has(low)) found.set(low,key); }
  while ((m = curly.exec(body))) { const key=m[1]; const low=key.toLowerCase(); if(!found.has(low)) found.set(low,key); }
  return Array.from(found.values());
}
module.exports = { extractVariables };
