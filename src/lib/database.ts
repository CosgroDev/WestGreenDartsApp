// A fresh query per page avoids mutating/reusing a PostgREST builder.
// Stop only on an empty page: a project may cap responses below our page size.
export async function allRows<T = any>(query: () => any): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await query().range(rows.length, rows.length + 499);
    if (error) throw new Error(`Database read failed: ${error.message}`);
    if (!data?.length) return { data: rows, error: null };
    rows.push(...data);
  }
}

// PostgREST URLs grow with IN lists. Keep each request below typical URL limits.
export async function rowsForIds<T = any>(ids: string[], query: (ids: string[]) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    rows.push(...(await allRows<T>(() => query(ids.slice(i, i + 100)))).data);
  }
  return rows;
}
