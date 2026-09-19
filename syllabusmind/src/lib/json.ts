/** Parse a model reply that should be JSON but may have prose around it, a doubled brace, trailing commas, comments or unquoted keys. */
export function tolerantParse(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in reply');
  try {
    return JSON.parse(m[0]);
  } catch {
    const fixed = m[0]
      .replace(/^\s*\{\s*\{/, '{')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^'\n]*)'/g, ': "$1"');
    return JSON.parse(fixed);
  }
}
