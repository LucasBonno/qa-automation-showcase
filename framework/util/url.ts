/** The numeric quote id at the end of a "#/quotes/123" style address. */
export const idFromUrl = (url: string): number => Number(new URL(url).hash.split('?')[0]!.split('/').filter((part) => /^\d+$/.test(part)).at(-1));
