// Variable extraction utilities (extracted from server.js)
// Supports accented Latin letters and legacy curly syntax.
// Returns unique variables preserving first-seen casing.
function extractVariables(body) {
  if (typeof body !== 'string') return [];
  const angled = /<<\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9_\.\-]+)\s*>>/g;
  const curly = /{{\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9_\.\-]+)\s*}}/g;
  const found = new Map();
  let m;
  while ((m = angled.exec(body))) {
    const key = m[1];
    const lower = key.toLowerCase();
    if (!found.has(lower)) found.set(lower, key);
  }
  while ((m = curly.exec(body))) {
    const key = m[1];
    const lower = key.toLowerCase();
    if (!found.has(lower)) found.set(lower, key);
  }
  return Array.from(found.values());
}

module.exports = { extractVariables };
