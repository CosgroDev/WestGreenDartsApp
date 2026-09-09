export function csv(rows: unknown[][]): string {
  return rows.map(row => row.map(value => {
    const text = value == null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\r\n");
}
