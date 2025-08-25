import type { RenderOptions } from "../../core/types.ts";
import { OverlayResolver } from "../../core/overlay.ts";
import { Evaluator } from "../../core/evaluator.ts";
import { MemoryCache } from "../../core/cache/memory.ts";
import { loadPolicy } from "../../core/policy.ts";
import { createAuditLogger } from "../../core/audit.ts";
import { maskEnv } from "../../core/security/mask.ts";

type Argv = Record<string, unknown> & { _: unknown[] };

export async function renderCommand(args: Argv): Promise<void> {
  const options: RenderOptions = {
    file: args.file as string | undefined,
    profile: args.profile as string | undefined,
    scopes: (args.scope as string[] | undefined) || [],
    overlays: (args.overlay as string[] | undefined) || [],
    pure: args.pure as boolean | undefined,
    mask: args.mask as RenderOptions["mask"],
    strict: args.strict as boolean | undefined,
    cache: args.cache as RenderOptions["cache"],
    ttl: args.ttl as string | undefined,
    audit: args.audit as RenderOptions["audit"],
    policy: args.policy as string | undefined,
    force: args.force as boolean | undefined,
    format: (args.format as RenderOptions["format"]) || "env",
  };

  // Set up components
  const cache = new MemoryCache();
  const policy = await loadPolicy(options.policy);
  const audit = createAuditLogger(options.audit || "off");

  // Resolve and parse files
  const resolver = new OverlayResolver(Deno.cwd());
  const parsedFiles = await resolver.parseAllFiles(options);

  // Evaluate
  const evaluator = new Evaluator(cache, policy, audit, options);
  const result = await evaluator.evaluate(parsedFiles);

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`Error: ${error}`);
    }
    throw new Error("Evaluation failed");
  }

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    if (options.strict) {
      throw new Error("Warnings detected in strict mode");
    }
  }

  // Apply masking
  const env = options.mask === "off" ? result.env : maskEnv(result.env, options.mask || "on");

  // Render output
  switch (options.format) {
    case "env":
      renderEnv(env);
      break;
    case "json":
      renderJSON(env);
      break;
    case "shell":
      renderShell(env);
      break;
    case "k8s":
      renderK8s(env);
      break;
    case "compose":
      renderCompose(env);
      break;
    default:
      throw new Error(`Unknown format: ${options.format}`);
  }

  // Clean up
  cache.destroy();
  await audit.flush();
}

function renderEnv(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env).sort()) {
    // Escape value for dotenv format
    const escaped = value.includes("\n") || value.includes('"') || value.includes(" ")
      ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
      : value;
    console.log(`${key}=${escaped}`);
  }
}

function renderJSON(env: Record<string, string>): void {
  console.log(JSON.stringify(env, null, 2));
}

function renderShell(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env).sort()) {
    // Escape for shell export
    const escaped = `'${value.replace(/'/g, "'\"'\"'")}'`;
    console.log(`export ${key}=${escaped}`);
  }
}

function renderK8s(env: Record<string, string>): void {
  const secret = {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: "dotsecret-generated",
    },
    type: "Opaque",
    stringData: env,
  };
  console.log(JSON.stringify(secret, null, 2));
}

function renderCompose(env: Record<string, string>): void {
  const compose = {
    version: "3.8",
    services: {
      app: {
        environment: env,
      },
    },
  };
  console.log(JSON.stringify(compose, null, 2));
}
