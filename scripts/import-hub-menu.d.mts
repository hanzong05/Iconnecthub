export const BUILT_IN: string[]
export interface PlanItem { id: string; label: string; icon: string; kind: 'link' | 'page' | 'sheet'; url: string; rows: { label: string; url: string; page?: string }[]; shown: boolean; template?: { slots: Record<string, unknown>[] } }
export interface ImportPlan { hub: string; items: PlanItem[]; values: Record<string, Record<string, unknown>>; notes: string[] }
export function readMoreDefs(html: string): { defs: Record<string, [string, string]>; order: string[] }
export function handlerTarget(html: string, call: string): { kind: 'link'; url: string } | { kind: 'page' | 'sheet'; id: string } | null
export function buildPlan(html: string, hub?: string): ImportPlan
