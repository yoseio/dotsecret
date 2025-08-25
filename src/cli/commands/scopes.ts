import type { CLIOptions } from "../../core/types.ts";
import { OverlayResolver } from "../../core/overlay.ts";
import { basename } from "@std/path";

type Argv = Record<string, unknown> & { _: unknown[] };

export async function scopesCommand(args: Argv): Promise<void> {
  const options: CLIOptions = {
    file: args.file as string | undefined,
    profile: args.profile as string | undefined,
    scopes: [],
    overlays: Array.isArray(args.overlay) ? args.overlay as string[] : [],
  };

  // Resolve and parse files
  const resolver = new OverlayResolver(Deno.cwd());
  const parsedFiles = await resolver.parseAllFiles(options);

  // Extract all defined scopes
  const scopes = new Map<string, { extends?: string[]; files: string[] }>();

  for (const file of parsedFiles) {
    for (const node of file.nodes) {
      if (node.type === "section" && node.data.type === "scope") {
        const scopeName = node.data.name;
        const existing = scopes.get(scopeName) || { files: [] };

        if (node.data.extends) {
          existing.extends = node.data.extends;
        }

        existing.files.push(file.path);
        scopes.set(scopeName, existing);
      }
    }
  }

  console.log("Available Scopes\n");
  console.log("=".repeat(50));

  if (scopes.size === 0) {
    console.log("\nNo scopes defined in configuration files.");
  } else {
    // Sort scopes by name
    const sortedScopes = Array.from(scopes.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, info] of sortedScopes) {
      console.log(`\n${name}:`);

      if (info.extends && info.extends.length > 0) {
        console.log(`  Extends: ${info.extends.join(", ")}`);
      }

      console.log(`  Defined in:`);
      for (const file of info.files) {
        console.log(`    - ${file}`);
      }
    }
  }

  // Check for auto-detected commands
  console.log("\nAuto-detectable Commands:");
  console.log("-".repeat(25));

  const commands = new Set<string>();
  try {
    // Check common bin directories
    const pathDirs = (Deno.env.get("PATH") || "").split(":");

    for (const dir of pathDirs) {
      try {
        for await (const entry of Deno.readDir(dir)) {
          if (entry.isFile || entry.isSymlink) {
            const name = basename(entry.name).split(".")[0];
            if (scopes.has(name)) {
              commands.add(name);
            }
          }
        }
      } catch {
        // Ignore directories we can't read
      }
    }

    if (commands.size > 0) {
      for (const cmd of Array.from(commands).sort()) {
        console.log(`  ${cmd} → [scope:${cmd}]`);
      }
    } else {
      console.log("  None found");
    }
  } catch {
    console.log("  Unable to scan PATH");
  }

  console.log("\nUsage:");
  console.log("  dotsecret run --scope <name> -- <command>");
  console.log("  dotsecret run --scope <a>,<b> -- <command>  # Multiple scopes");

  if (!args["no-auto-scope"]) {
    console.log("\nNote: Scope auto-detection is enabled.");
    console.log("Commands matching scope names will automatically use their scope.");
  }
}
