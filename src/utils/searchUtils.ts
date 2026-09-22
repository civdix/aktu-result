/**
 * Robust search & filter utilities for college names and codes.
 * Treats dots (.), spaces, hyphens, and common punctuation as optional/interchangeable,
 * allowing searches like "BSA", "B.S.A.", "B S A", "B. S. A." to match
 * both "BSA College..." and "B. S. A. College...".
 */

/**
 * Strips all non-alphanumeric characters and converts to lowercase.
 * e.g., "B. S. A." -> "bsa", "G.L. Bajaj" -> "glbajaj"
 */
export function normalizeSearch(str: string | undefined | null): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Normalizes text while collapsing acronyms with dots or spaces into single words.
 * e.g., "B. S. A. Mathura" -> "bsa mathura", "G. L. Bajaj" -> "gl bajaj"
 */
export function normalizeWords(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?<=\b[a-z0-9])[\.\s]+(?=[a-z0-9](\.|\s|$))/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determines whether a college name and code match a user's search query.
 * Supports:
 * - Code lookups (e.g., "068", "68")
 * - Substring matches (e.g., "engineering")
 * - Normalized acronym matches (e.g., "BSA" <-> "B. S. A." <-> "B S A" <-> "B.S.A.")
 * - Multi-word/token queries (e.g., "BSA Mathura", "GL Bajaj Greater Noida")
 */
export function matchesCollegeSearch(
  name: string | undefined | null,
  code: string | undefined | null,
  query: string | undefined | null,
  extraText?: string | undefined | null
): boolean {
  if (!query) return true;
  const qRaw = query.trim().toLowerCase();
  if (!qRaw) return true;

  const nRaw = (name || '').toLowerCase();
  const cRaw = (code || '').toLowerCase();
  const eRaw = (extraText || '').toLowerCase();

  // 1. Direct college code match (exact, without leading zeros, or substring)
  const qNum = qRaw.replace(/^0+/, '');
  const cNum = cRaw.replace(/^0+/, '');
  if (cRaw.includes(qRaw) || (qNum && cNum === qNum)) {
    return true;
  }

  // 2. Direct name or extraText substring match
  if (nRaw.includes(qRaw) || (eRaw && eRaw.includes(qRaw))) {
    return true;
  }

  // 3. Fully stripped match (ignores all dots, spaces, hyphens, punctuation)
  const qClean = normalizeSearch(qRaw);
  if (qClean) {
    const nClean = normalizeSearch(nRaw);
    if (nClean.includes(qClean)) return true;

    if (eRaw) {
      const eClean = normalizeSearch(eRaw);
      if (eClean.includes(qClean)) return true;
    }
  }

  // 4. Multi-token / multi-word match with acronym collapsing
  const qWordsNorm = normalizeWords(qRaw);
  if (!qWordsNorm) return false;

  const nWordsNorm = normalizeWords(`${nRaw} ${eRaw}`);
  if (nWordsNorm.includes(qWordsNorm)) {
    return true;
  }

  const queryTokens = qWordsNorm.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 1) {
    const allTokensMatch = queryTokens.every((token) => {
      const tokenClean = normalizeSearch(token);
      return nWordsNorm.includes(token) || (tokenClean && normalizeSearch(nWordsNorm).includes(tokenClean));
    });
    if (allTokensMatch) return true;
  }

  return false;
}
