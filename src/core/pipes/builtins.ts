import type { Pipe } from "../types.ts";
import { decodeBase64, encodeBase64 } from "@std/encoding/base64";
import { encodeHex } from "@std/encoding/hex";

export class TrimPipe implements Pipe {
  name = "trim";
  pure = true;

  async apply(input: Uint8Array | string): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    return str.trim();
  }
}

export class UpperPipe implements Pipe {
  name = "upper";
  pure = true;

  async apply(input: Uint8Array | string): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    return str.toUpperCase();
  }
}

export class LowerPipe implements Pipe {
  name = "lower";
  pure = true;

  async apply(input: Uint8Array | string): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    return str.toLowerCase();
  }
}

export class ReplacePipe implements Pipe {
  name = "replace";
  pure = true;

  async apply(input: Uint8Array | string, args: Record<string, string>): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    const search = args.search || args.from || "";
    const replace = args.replace || args.to || "";
    const flags = args.flags || "g";

    if (!search) {
      throw new Error("replace pipe requires 'search' or 'from' argument");
    }

    if (flags.includes("r")) {
      // Regex mode
      const regex = new RegExp(search, flags.replace("r", ""));
      return str.replace(regex, replace);
    } else {
      // String mode
      return str.split(search).join(replace);
    }
  }
}

export class Base64EncodePipe implements Pipe {
  name = "base64encode";
  pure = true;

  async apply(input: Uint8Array | string): Promise<string> {
    const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
    return encodeBase64(bytes);
  }
}

export class Base64DecodePipe implements Pipe {
  name = "base64decode";
  pure = true;

  async apply(input: Uint8Array | string): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    const decoded = decodeBase64(str);
    return new TextDecoder().decode(decoded);
  }
}

export class JSONPipe implements Pipe {
  name = "json";
  pure = true;

  async apply(input: Uint8Array | string, args: Record<string, string>): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    const path = args.path || args.value || "";

    try {
      const parsed = JSON.parse(str);

      if (!path) {
        return JSON.stringify(parsed);
      }

      // Simple JSON path support (dot notation only)
      const parts = path.split(".");
      let current = parsed;

      for (const part of parts) {
        if (current === null || current === undefined) {
          throw new Error(`Path ${path} not found in JSON`);
        }
        current = current[part];
      }

      if (typeof current === "string") {
        return current;
      }
      return JSON.stringify(current);
    } catch (error) {
      throw new Error(
        `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export class URIEncodePipe implements Pipe {
  name = "uriEncode";
  pure = true;

  async apply(input: Uint8Array | string): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    return encodeURIComponent(str);
  }
}

export class URIDecodePipe implements Pipe {
  name = "uriDecode";
  pure = true;

  async apply(input: Uint8Array | string): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    return decodeURIComponent(str);
  }
}

export class SHA256Pipe implements Pipe {
  name = "sha256";
  pure = true;

  async apply(input: Uint8Array | string, args: Record<string, string>): Promise<string> {
    const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
    const format = args.format || args.value || "hex";

    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const hashBytes = new Uint8Array(hash);

    if (format === "base64") {
      return encodeBase64(hashBytes);
    } else {
      return encodeHex(hashBytes);
    }
  }
}

export class LinesPipe implements Pipe {
  name = "lines";
  pure = true;

  async apply(input: Uint8Array | string, args: Record<string, string>): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);
    const n = parseInt(args.n || args.value || "1", 10);

    if (isNaN(n) || n < 1) {
      throw new Error("lines pipe requires a positive number");
    }

    const lines = str.split("\n");
    return lines.slice(0, n).join("\n");
  }
}

export class DotenvEscapePipe implements Pipe {
  name = "dotenvEscape";
  pure = true;

  async apply(input: Uint8Array | string): Promise<string> {
    const str = typeof input === "string" ? input : new TextDecoder().decode(input);

    // Escape special characters for dotenv format
    if (str.includes("\n") || str.includes('"') || str.includes("'") || str.includes(" ")) {
      // Use double quotes and escape internal quotes and backslashes
      return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }

    return str;
  }
}
