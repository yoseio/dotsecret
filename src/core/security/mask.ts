export type MaskMode = "on" | "off" | "partial";

const MASKED = "***MASKED***";
const PARTIAL_SHOW_CHARS = 4;

export function maskValue(value: string, mode: MaskMode): string {
  if (mode === "off") {
    return value;
  }

  if (mode === "partial" && value.length > PARTIAL_SHOW_CHARS * 2) {
    const start = value.substring(0, PARTIAL_SHOW_CHARS);
    const end = value.substring(value.length - PARTIAL_SHOW_CHARS);
    return `${start}...${end}`;
  }

  return MASKED;
}

export function maskEnv(env: Record<string, string>, mode: MaskMode): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    masked[key] = maskValue(value, mode);
  }
  return masked;
}

export function shouldMaskKey(key: string): boolean {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /auth/i,
    /credential/i,
    /api[-_]?key/i,
    /private/i,
  ];

  return sensitivePatterns.some((pattern) => pattern.test(key));
}

export class OutputMasker {
  private secrets: Map<string, string> = new Map();

  addSecret(key: string, value: string): void {
    if (value && value.length > 3) {
      this.secrets.set(key, value);
    }
  }

  maskOutput(output: string): string {
    let masked = output;
    
    for (const [key, value] of this.secrets) {
      const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedValue, "g");
      masked = masked.replace(regex, `***${key}***`);
    }

    return masked;
  }

  clear(): void {
    this.secrets.clear();
  }
}