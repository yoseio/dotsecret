import type { VerifyOptions } from "../../core/types.ts";
import { OverlayResolver } from "../../core/overlay.ts";
import { Parser } from "../../core/parser.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";

export async function verifyCommand(args: any): Promise<void> {
  const options: VerifyOptions = {
    file: args.file,
    profile: args.profile,
    scopes: args.scope || [],
    overlays: args.overlay || [],
    strict: args.strict,
    policy: args.policy,
    drift: args.drift,
  };

  let hasErrors = false;
  const warnings: string[] = [];

  // Resolve files
  const resolver = new OverlayResolver(Deno.cwd());
  const files = await resolver.resolveFiles(options);

  console.log("Verifying configuration files...\n");

  // Check file existence and syntax
  for (const file of files) {
    console.log(`Checking ${file}...`);

    try {
      const content = await Deno.readTextFile(file);
      const parser = new Parser(content, file);
      parser.parse();
      console.log(`  ✓ Syntax valid`);
    } catch (error) {
      console.error(`  ✗ ${error instanceof Error ? error.message : String(error)}`);
      hasErrors = true;
    }
  }

  // Check for conflicts
  try {
    const parsedFiles = await resolver.parseAllFiles(options);
    const conflicts = resolver.detectConflicts(parsedFiles);

    if (conflicts.size > 0) {
      console.log("\nConflicts detected:");
      for (const [key, sources] of conflicts) {
        const message = `  Key "${key}" has conflicting values in: ${sources.join(", ")}`;
        if (options.strict) {
          console.error(`  ✗ ${message}`);
          hasErrors = true;
        } else {
          console.warn(`  ⚠ ${message}`);
          warnings.push(message);
        }
      }
    } else {
      console.log("\n✓ No conflicts detected");
    }
  } catch (error) {
    console.error(
      `\n✗ Failed to check conflicts: ${error instanceof Error ? error.message : String(error)}`,
    );
    hasErrors = true;
  }

  // Check policy
  console.log("\nChecking policy...");
  try {
    const { loadPolicy } = await import("../../core/policy.ts");
    await loadPolicy(options.policy);
    console.log("  ✓ Policy loaded successfully");
  } catch (error) {
    console.error(
      `  ✗ Failed to load policy: ${error instanceof Error ? error.message : String(error)}`,
    );
    hasErrors = true;
  }

  // Check schema if exists
  const schemaPath = join(Deno.cwd(), "dotsecret.schema.json");
  if (await exists(schemaPath)) {
    console.log("\nChecking schema compliance...");
    try {
      const schemaContent = await Deno.readTextFile(schemaPath);
      JSON.parse(schemaContent); // Validate JSON syntax

      // TODO: Implement actual schema validation
      console.log("  ✓ Schema loaded (validation not yet implemented)");
    } catch (error) {
      console.error(
        `  ✗ Failed to load schema: ${error instanceof Error ? error.message : String(error)}`,
      );
      hasErrors = true;
    }
  }

  // Check drift if requested
  if (options.drift) {
    const lockPath = join(Deno.cwd(), "dotsecret.lock");
    if (await exists(lockPath)) {
      console.log("\nChecking for drift...");
      try {
        const lockContent = await Deno.readTextFile(lockPath);
        JSON.parse(lockContent); // Validate JSON syntax

        // TODO: Implement actual drift detection
        console.log("  ✓ Lock file loaded (drift detection not yet implemented)");
      } catch (error) {
        console.error(
          `  ✗ Failed to check drift: ${error instanceof Error ? error.message : String(error)}`,
        );
        hasErrors = true;
      }
    } else {
      console.warn("\n⚠ No lock file found for drift detection");
      warnings.push("No lock file found for drift detection");
    }
  }

  // Summary
  console.log("\nVerification Summary:");
  if (hasErrors) {
    console.error("✗ Verification failed with errors");
    Deno.exit(1);
  } else if (warnings.length > 0 && options.strict) {
    console.error("✗ Verification failed in strict mode due to warnings");
    Deno.exit(1);
  } else if (warnings.length > 0) {
    console.warn(`⚠ Verification passed with ${warnings.length} warning(s)`);
  } else {
    console.log("✓ All checks passed");
  }
}
