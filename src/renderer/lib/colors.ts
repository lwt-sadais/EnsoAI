export function hexToRgba(hex: string, alpha: number): string | null {
  if (typeof hex !== 'string') return null;
  const trimmed = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return null;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;

  const r = Number.parseInt(trimmed.slice(1, 3), 16);
  const g = Number.parseInt(trimmed.slice(3, 5), 16);
  const b = Number.parseInt(trimmed.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function normalizeHexColor(input: string, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return fallback;
  return trimmed.toLowerCase();
}
