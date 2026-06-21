/**
 * Shared search matching used by every search box in the app.
 * Query is split on commas; a record matches only if EVERY term is found in at
 * least one field (AND across terms, OR across fields). Empty query matches all.
 */
export function matchesSearch(
  query: string,
  fields: (string | number | null | undefined)[]
): boolean {
  if (!query || !query.trim()) return true;
  const terms = query.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  if (terms.length === 0) return true;
  const haystacks = fields.map(f => String(f ?? '').toLowerCase());
  return terms.every(term => haystacks.some(h => h.includes(term)));
}
