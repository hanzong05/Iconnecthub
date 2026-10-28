export interface ImportedPage { title: string; subtitle: string; banner: string; blocks: Record<string, unknown>[] }
export function toText(html: string): string
export function grabDiv(html: string, marker: string): string | null
export function parseRules(html: string): ImportedPage | null
export function parseReservations(html: string): ImportedPage | null
export function extractPages(html: string): Record<string, ImportedPage>
