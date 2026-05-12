export function calculateCreditsUsed(durationSeconds: number): number {
  return durationSeconds > 0 ? Math.max(1, Math.ceil(durationSeconds / 60)) : 0;
}
