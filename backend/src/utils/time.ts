export function getHourWindow(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}-${hour}`;
}

export function getNextHourDate(date: Date = new Date()): Date {
  const nextHour = new Date(date);
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  return nextHour;
}

export function calculateDelayMs(targetDate: Date): number {
  const now = Date.now();
  const target = targetDate.getTime();
  return Math.max(0, target - now);
}
