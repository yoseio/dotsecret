import type { KV } from "./types.ts";

const INTERPOLATION_REGEX = /\$\{([^}]+)\}/g;

export async function interpolate(
  value: string,
  definedEnv: KV,
  parentEnv: KV,
): Promise<string> {
  return value.replace(INTERPOLATION_REGEX, (match, key) => {
    key = key.trim();
    
    // First check defined environment
    if (key in definedEnv) {
      return definedEnv[key];
    }
    
    // Then check parent environment
    if (key in parentEnv) {
      return parentEnv[key];
    }
    
    // Return original if not found
    return match;
  });
}