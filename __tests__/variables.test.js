const { extractVariables } = require('../lib/variables');

describe('extractVariables', () => {
  test('deduplicates and preserves first casing', () => {
    const body = 'Hello <<ClientName>> and {{clientname}}';
    expect(extractVariables(body)).toEqual(['ClientName']);
  });

  test('supports accented names and legacy syntax', () => {
    const body = 'Ref <<NuméroProjet>> plus {{AncienToken}} and <<AncienToken>>';
    const vars = extractVariables(body);
    expect(vars).toContain('NuméroProjet');
    expect(vars).toContain('AncienToken');
  });

  test('returns empty array for non-string', () => {
    expect(extractVariables(undefined)).toEqual([]);
  });
});
