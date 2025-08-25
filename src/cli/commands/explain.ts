import type { CLIOptions, KeyMetadata } from "../../core/types.ts";
import { OverlayResolver } from "../../core/overlay.ts";
import { Evaluator } from "../../core/evaluator.ts";
import { MemoryCache } from "../../core/cache/memory.ts";
import { loadPolicy } from "../../core/policy.ts";
import { createAuditLogger } from "../../core/audit.ts";
import { maskValue } from "../../core/security/mask.ts";

export async function explainCommand(args: any): Promise<void> {
  const options: CLIOptions = {
    file: args.file,
    profile: args.profile,
    scopes: args.scope || [],
    overlays: args.overlay || [],
    pure: args.pure,
    mask: args.mask || "on",
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

  console.log("Environment Variable Origins and Transformations\n");
  console.log("=".repeat(50));

  // Group by source file
  const bySource = new Map<string, Array<[string, KeyMetadata]>>();

  for (const [key, meta] of Object.entries(result.metadata)) {
    const source = meta.source || "parent environment";
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push([key, meta]);
  }

  // Display by source
  for (const [source, entries] of bySource) {
    console.log(`\nSource: ${source}`);
    console.log("-".repeat(source.length + 8));

    for (const [key, meta] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`\n  ${key}:`);

      if (meta.provider) {
        console.log(`    Provider: ${meta.provider}`);
      }

      if (meta.transforms.length > 0) {
        console.log(`    Transforms: ${meta.transforms.join(" → ")}`);
      }

      console.log(`    Value: ${maskValue(meta.value, options.mask || "on")}`);

      if (meta.protected) {
        console.log(`    Protected: yes`);
      }
    }
  }

  // Show inheritance from parent env
  if (!options.pure) {
    const parentKeys = Object.keys(Deno.env.toObject()).filter(
      (key) => !(key in result.metadata),
    );

    if (parentKeys.length > 0) {
      console.log(`\nInherited from parent environment:`);
      console.log("-".repeat(35));
      for (const key of parentKeys.sort()) {
        console.log(`  ${key}`);
      }
    }
  }

  // Show warnings and errors
  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of result.warnings) {
      console.warn(`  ⚠ ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const error of result.errors) {
      console.error(`  ✗ ${error}`);
    }
  }

  // Clean up
  cache.destroy();
  await audit.flush();
}
