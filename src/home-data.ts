type DailyTransactions = { date: string; transactions_count: unknown };

// Compare complete UTC days only. Missing days or values are unknown, not zero.
export function dailyTransactionChange(history: DailyTransactions[], now = Date.now()): number | null {
  const today = new Date(now).toISOString().slice(0, 10);
  const completed = history.filter(row => row.date < today).slice(-14);
  if (completed.length !== 14) return null;
  if (completed.at(-1)?.date !== new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)) return null;
  const values: number[] = [];
  let previousDate: number | undefined;
  for (const row of completed) {
    const date = Date.parse(`${row.date}T00:00:00Z`);
    const value = row.transactions_count;
    if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== row.date
      || previousDate !== undefined && date - previousDate !== 86400000
      || value == null || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
    previousDate = date;
    values.push(Number(value));
  }
  const previous = values.slice(0, 7).reduce((sum, value) => sum + value, 0);
  const latest = values.slice(7).reduce((sum, value) => sum + value, 0);
  const change = previous > 0 ? (latest - previous) / previous * 100 : NaN;
  return Number.isFinite(change) ? change : null;
}
