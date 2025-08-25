import type { CLIOptions } from "../../core/types.ts";
import { OverlayResolver } from "../../core/overlay.ts";
import { Evaluator } from "../../core/evaluator.ts";
import { MemoryCache } from "../../core/cache/memory.ts";
import { loadPolicy } from "../../core/policy.ts";
import { createAuditLogger } from "../../core/audit.ts";

export async function shellCommand(args: any): Promise<void> {
  const options: CLIOptions = {
    file: args.file,
    profile: args.profile,
    scopes: args.scope || [],
    overlays: args.overlay || [],
    pure: args.pure,
    mask: args.mask,
    strict: args.strict,
    cache: args.cache,
    ttl: args.ttl,
    audit: args.audit,
    policy: args.policy,
    force: args.force,
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

  // Determine shell
  const shell = Deno.env.get("SHELL") || "/bin/bash";
  const shellName = shell.split("/").pop() || "shell";

  console.log(`Starting ${shellName} with injected environment...`);
  console.log(`Type 'exit' to return to the parent shell.\n`);

  // Run shell with new environment
  const cmd = new Deno.Command(shell, {
    env: result.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const child = cmd.spawn();
  const status = await child.status;

  // Clean up
  cache.destroy();
  await audit.flush();

  Deno.exit(status.code);
}
