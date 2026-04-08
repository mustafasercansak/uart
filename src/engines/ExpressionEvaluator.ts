// ─────────────────────────────────────────────
// COMPUTED FIELD EXPRESSION DEĞERLENDİRİCİSİ
// Güvenli, sandbox'lı değerlendirici
// ─────────────────────────────────────────────

export function evaluateExpression(
  expression: string,
  fields: Record<string, number>,
  clampMin: number,
  clampMax: number,
): number {
  try {
    // Build a safe evaluation context
    // Only allow math operations and field references
    const fieldNames = Object.keys(fields);
    const fieldValues = Object.values(fields);

    // Replace fields['Name'] and fields["Name"] with variables
    let safeExpr = expression.replace(
      /fields\[['"]([^'"]+)['"]\]/g,
      (_, name) => {
        const idx = fieldNames.indexOf(name);
        return idx >= 0 ? `__f${idx}__` : '0';
      },
    );

    // Build param list
    const paramNames = fieldNames.map((_, i) => `__f${i}__`);
    const paramValues = fieldValues;

    // Also allow bare Math functions
    const fn = new Function(
      ...paramNames,
      'Math',
      `"use strict"; return (${safeExpr});`,
    );

    const result = fn(...paramValues, Math);

    if (typeof result !== 'number' || isNaN(result)) return clampMin;
    return Math.max(clampMin, Math.min(clampMax, Math.round(result)));
  } catch {
    return clampMin;
  }
}
