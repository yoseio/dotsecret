import type { Provider, ProviderRef, ResolveContext } from "../types.ts";
import { decodeBase64 } from "@std/encoding/base64";

export class EnvProvider implements Provider {
  name = "env";

  resolveSingle(ref: ProviderRef, _ctx: ResolveContext): Promise<string> {
    let envVar: string;
    let defaultValue: string | undefined;

    if (ref.kind === "uri") {
      // Parse URI: env://VAR_NAME
      envVar = ref.uri.replace("env://", "");
    } else {
      // Function call: env(name="VAR", default="value")
      envVar = ref.args.name || ref.args.value || "";
      defaultValue = ref.args.default;
    }

    const value = Deno.env.get(envVar);
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return Promise.resolve(defaultValue);
      }
      throw new Error(`Environment variable ${envVar} not found`);
    }

    return Promise.resolve(value);
  }
}

export class FileProvider implements Provider {
  name = "file";

  async resolveSingle(ref: ProviderRef, _ctx: ResolveContext): Promise<string> {
    let filePath: string;

    if (ref.kind === "uri") {
      // Parse URI: file:///path/to/file
      filePath = ref.uri.replace("file://", "");
    } else {
      // Function call: file(path="/path/to/file")
      filePath = ref.args.path || ref.args.value || "";
    }

    if (!filePath) {
      throw new Error("File path is required");
    }

    try {
      const content = await Deno.readTextFile(filePath);
      return content;
    } catch (error) {
      throw new Error(
        `Failed to read file ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export class JSONProvider implements Provider {
  name = "json";

  resolveSingle(ref: ProviderRef, _ctx: ResolveContext): Promise<string> {
    if (ref.kind !== "call") {
      throw new Error("JSON provider only supports function call syntax");
    }
    const value = ref.args.value || "";
    const path = ref.args.path || "";

    if (!value) {
      throw new Error("JSON value is required");
    }

    try {
      const parsed = JSON.parse(value);

      if (!path) {
        return Promise.resolve(JSON.stringify(parsed));
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
        return Promise.resolve(current);
      }
      return Promise.resolve(JSON.stringify(current));
    } catch (error) {
      throw new Error(
        `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export class Base64DecodeProvider implements Provider {
  name = "base64decode";

  resolveSingle(ref: ProviderRef, _ctx: ResolveContext): Promise<string> {
    if (ref.kind !== "call") {
      throw new Error("base64decode provider only supports function call syntax");
    }
    const value = ref.args.value || "";

    if (!value) {
      throw new Error("Base64 value is required");
    }

    try {
      const decoded = decodeBase64(value);
      return Promise.resolve(new TextDecoder().decode(decoded));
    } catch (error) {
      throw new Error(
        `Failed to decode base64: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
