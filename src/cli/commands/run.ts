import type { CLIOptions } from "../../core/types.ts";
import { OverlayResolver } from "../../core/overlay.ts";
import { Evaluator } from "../../core/evaluator.ts";
import { MemoryCache } from "../../core/cache/memory.ts";
import { loadPolicy } from "../../core/policy.ts";
import { createAuditLogger } from "../../core/audit.ts";
import { OutputMasker } from "../../core/security/mask.ts";
import { basename } from "@std/path";

export async function runCommand(args: any): Promise<void> {
  // Extract command and its arguments
  const dashIndex = args._.indexOf("--");
  if (dashIndex === -1) {
    throw new Error("No command specified. Use: dotsecret run -- <command> [args...]");
  }

  const command = args._[dashIndex + 1];
  const commandArgs = args._.slice(dashIndex + 2);

  if (!command) {
    throw new Error("No command specified after --");
  }

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
    noAutoScope: args["no-auto-scope"],
  };

  // Auto-detect scope from command if enabled
  if (!options.noAutoScope && options.scopes?.length === 0) {
    const commandName = basename(command.toString()).split(".")[0];
    // Check if a scope exists with this name (simplified check)
    options.scopes = [commandName];
  }

  // Set up components
  const cache = new MemoryCache();
  const policy = await loadPolicy(options.policy);
  const audit = createAuditLogger(options.audit || "off");

  // Resolve and parse files
  const resolver = new OverlayResolver(Deno.cwd());
  const parsedFiles = await resolver.parseAllFiles(options);

  // Check for conflicts
  const conflicts = resolver.detectConflicts(parsedFiles);
  if (conflicts.size > 0) {
    const message = `Detected conflicts in the following keys: ${
      Array.from(conflicts.keys()).join(", ")
    }`;
    if (options.strict) {
      throw new Error(message);
    } else {
      console.warn(`Warning: ${message}`);
    }
  }

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

  // Set up output masking
  const masker = new OutputMasker();
  if (options.mask !== "off") {
    for (const [key, value] of Object.entries(result.env)) {
      masker.addSecret(key, value);
    }
  }

  // Log injected keys (without values)
  if (Deno.env.get("DEBUG")) {
    console.error(`Injecting ${Object.keys(result.env).length} environment variables`);
    for (const key of Object.keys(result.env).sort()) {
      console.error(`  ${key}`);
    }
  }

  // Run the command with the new environment
  const cmd = new Deno.Command(command.toString(), {
    args: commandArgs.map((arg: any) => arg.toString()),
    env: result.env,
    stdin: "inherit",
    stdout: "piped",
    stderr: "piped",
  });

  const child = cmd.spawn();

  // Handle output with masking
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();

  // Handle stdout
  const stdoutReader = child.stdout.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;

        const text = textDecoder.decode(value);
        const masked = options.mask !== "off" ? masker.maskOutput(text) : text;
        await Deno.stdout.write(textEncoder.encode(masked));
      }
    } catch (error) {
      console.error("Error reading stdout:", error);
    }
  })();

  // Handle stderr
  const stderrReader = child.stderr.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;

        const text = textDecoder.decode(value);
        const masked = options.mask !== "off" ? masker.maskOutput(text) : text;
        await Deno.stderr.write(textEncoder.encode(masked));
      }
    } catch (error) {
      console.error("Error reading stderr:", error);
    }
  })();

  // Wait for the process to complete
  const status = await child.status;

  // Clean up
  cache.destroy();
  await audit.flush();

  // Exit with the same code as the child process
  Deno.exit(status.code);
}
