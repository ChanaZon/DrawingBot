// Secondary safety net for the renderer. The Zod ColorField is the strict gate;
// these helpers keep the canvas from ever receiving an unusable color string.

const COLOR_REGEX =
  /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([^)]+\)|hsla?\([^)]+\))$/;

export function isValidCssColor(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return COLOR_REGEX.test(trimmed);
}

export function normalizeCssColor(value: string, fallback: string): string {
  return isValidCssColor(value) ? value.trim() : fallback;
}
