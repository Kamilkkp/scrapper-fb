/**
 * Losowy czas z rozkładem zbliżonym do ludzkiego (wyniki skręcają ku środkowi
 * zakresu zamiast rozkładu równomiernego).
 */
export function randomHumanMs(min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (high <= low) return low;
  const u1 = Math.random();
  const u2 = Math.random();
  const skewed = (u1 + u2) / 2;
  return low + Math.floor(skewed * (high - low + 1));
}

export function humanDelay(min = 250, max = 600): Promise<void> {
  const ms = randomHumanMs(min, max);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pause(min = 250, max = 600): Promise<void> {
  await humanDelay(min, max);
}
