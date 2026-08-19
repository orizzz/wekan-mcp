import type { WekanCard } from "./types.js";

export type SearchScalar = string | number | boolean;

export interface CardSearchCustomFieldFilter {
  fieldId: string;
  operator: "equals" | "contains" | "exists" | "missing";
  value?: SearchScalar;
}

export interface CardSearchDueFilter {
  state?: "set" | "missing" | "overdue";
  from?: string;
  to?: string;
}

export interface CardSearchFilter {
  listIds?: string[];
  includeArchivedLists?: boolean;
  labelIds?: string[];
  labelMode?: "all" | "any";
  due?: CardSearchDueFilter;
  customFields?: CardSearchCustomFieldFilter[];
  text?: string;
  limit?: number;
}

export interface CardSearchResult {
  totalMatched: number;
  returned: number;
  truncated: boolean;
  searchedListIds: string[];
  cards: WekanCard[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function labelIds(card: WekanCard): string[] {
  const labels = card.labelIds ?? card.labels;
  if (!Array.isArray(labels)) return [];
  return labels.flatMap((label) => {
    if (typeof label === "string") return [label];
    if (record(label) && typeof (label._id ?? label.id) === "string") return [String(label._id ?? label.id)];
    return [];
  });
}

function customFieldValue(card: WekanCard, fieldId: string): unknown {
  const fields = card.customFields;
  if (Array.isArray(fields)) {
    const entry = fields.find((field) => record(field) && [field._id, field.id, field.fieldId, field.customFieldId].includes(fieldId));
    if (!record(entry)) return undefined;
    return entry.value ?? entry.textValue ?? entry.numberValue ?? entry.booleanValue;
  }
  return record(fields) ? fields[fieldId] : undefined;
}

function scalarText(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(scalarText);
  if (record(value)) return Object.values(value).flatMap(scalarText);
  return [];
}

function dueDate(card: WekanCard): Date | undefined {
  const value = card.dueAt ?? card.dueDate ?? card.due;
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function sameValue(actual: unknown, expected: SearchScalar): boolean {
  if (typeof actual !== typeof expected) return false;
  if (typeof actual === "string" && typeof expected === "string") return actual.toLocaleLowerCase() === expected.toLocaleLowerCase();
  return actual === expected;
}

function matchesCustomFields(card: WekanCard, filters: CardSearchCustomFieldFilter[]): boolean {
  return filters.every(({ fieldId, operator, value }) => {
    const actual = customFieldValue(card, fieldId);
    const exists = actual !== undefined && actual !== null && actual !== "";
    if (operator === "exists") return exists;
    if (operator === "missing") return !exists;
    if (value === undefined) return false;
    if (operator === "equals") return Array.isArray(actual) ? actual.some((entry) => sameValue(entry, value)) : sameValue(actual, value);
    return scalarText(actual).some((entry) => entry.toLocaleLowerCase().includes(String(value).toLocaleLowerCase()));
  });
}

export function filterCards(cards: WekanCard[], filter: CardSearchFilter, now = new Date()): WekanCard[] {
  const labels = new Set(filter.labelIds ?? []);
  const query = filter.text?.trim().toLocaleLowerCase();
  const from = filter.due?.from ? new Date(filter.due.from) : undefined;
  const to = filter.due?.to ? new Date(filter.due.to) : undefined;

  return cards.filter((card) => {
    const cardLabels = new Set(labelIds(card));
    if (labels.size > 0) {
      const overlap = [...labels].filter((label) => cardLabels.has(label)).length;
      if (filter.labelMode === "any" ? overlap === 0 : overlap !== labels.size) return false;
    }

    const due = dueDate(card);
    if (filter.due?.state === "set" && !due) return false;
    if (filter.due?.state === "missing" && due) return false;
    if (filter.due?.state === "overdue" && (!due || due >= now)) return false;
    if (from && (!due || due < from)) return false;
    if (to && (!due || due > to)) return false;

    if (filter.customFields && !matchesCustomFields(card, filter.customFields)) return false;
    if (query) {
      const haystack = [card.title, card.description, ...scalarText(card.customFields)].filter((value): value is string => typeof value === "string").join("\n").toLocaleLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function buildSearchResult(cards: WekanCard[], filter: CardSearchFilter, searchedListIds: string[], now = new Date()): CardSearchResult {
  const matched = filterCards(cards, filter, now);
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
  const selected = matched.slice(0, limit);
  return {
    totalMatched: matched.length,
    returned: selected.length,
    truncated: matched.length > selected.length,
    searchedListIds,
    cards: selected,
  };
}
