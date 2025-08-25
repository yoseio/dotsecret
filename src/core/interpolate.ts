import type { KV } from "./types.ts";

const INTERPOLATION_REGEX = /\$\{([^}]+)\}/g;

export function interpolate(
  value: string,
  definedEnv: KV,
  parentEnv: KV,
): string {
  return value.replace(INTERPOLATION_REGEX, (match, key) => {
    key = key.trim();

    if (key in definedEnv) return definedEnv[key];
    if (key in parentEnv) return parentEnv[key];
    return match;
  });
}
