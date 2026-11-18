// Citation helpers shared by chat answers and triage reply drafts.

/**
 * Models don't always follow the citation format exactly. gpt-oss models, for example, sometimes
 * write 【1】 or 【1†L5-L8】 instead of [1]. Normalise every variant to [n] so parsing and the UI
 * see one format.
 */
export function normaliseCitations(text: string): string {
  return text.replace(/【\s*(\d+)(?:†[^】]*)?\s*】/g, '[$1]');
}

/** Citation numbers like [1] or [2][3] that point at a provided source (1..max). */
export function citedIds(text: string, max: number): number[] {
  const ids = new Set<number>();
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    const id = Number(match[1]);
    if (id >= 1 && id <= max) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}
