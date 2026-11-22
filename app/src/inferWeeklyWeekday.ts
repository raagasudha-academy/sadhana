export function inferWeeklyWeekday(
  dates: unknown[],
): { frequency: 'weekly'; interval: 1; weekdays: number[] } | undefined {
  const validDates = [
    ...new Set(
      dates.filter(
        (date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date),
      ),
    ),
  ].sort();
  if (validDates.length < 3) return undefined;

  const weekdays = new Set<number>();
  const timestamps: number[] = [];
  for (const date of validDates) {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
      return undefined;
    weekdays.add(parsed.getUTCDay());
    timestamps.push(parsed.getTime());
  }
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (
    weekdays.size !== 1 ||
    timestamps.slice(1).some((timestamp, index) => (timestamp - timestamps[index]) % weekMs !== 0)
  )
    return undefined;
  return { frequency: 'weekly', interval: 1, weekdays: [weekdays.values().next().value!] };
}
