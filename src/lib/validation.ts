// Input checks shared by server actions. Form data is untrusted: every value
// is trimmed, length-limited and format-checked before it reaches the database.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** A trimmed string field, or null when absent, empty or longer than `max`. */
export function textField(form: FormData, key: string, max = 120): string | null {
  const raw = form.get(key);
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(/\s+/g, " ");
  return value && value.length <= max ? value : null;
}

/** A UUID field, or null when absent or malformed. */
export function uuidField(form: FormData, key: string): string | null {
  const raw = form.get(key);
  return isUuid(raw) ? raw : null;
}

/** An integer field within [min, max], or null. */
export function intField(form: FormData, key: string, min: number, max: number): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || !/^-?\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

/** An ISO-parseable date/time field, or null. */
export function dateField(form: FormData, key: string): string | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || !raw.trim() || raw.length > 40) return null;
  return Number.isFinite(Date.parse(raw)) ? raw.trim() : null;
}

export const isSeasonName = (value: string) => /^\d{2}\/\d{2}$/.test(value);
