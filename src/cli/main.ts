#!/usr/bin/env -S deno run --allow-all

import { parseArgs } from "@std/cli/parse-args";
import { runCommand } from "./commands/run.ts";
import { renderCommand } from "./commands/render.ts";
import { verifyCommand } from "./commands/verify.ts";
import { explainCommand } from "./commands/explain.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { cacheCommand } from "./commands/cache.ts";
import { shellCommand } from "./commands/shell.ts";
import { scopesCommand } from "./commands/scopes.ts";
import { lintCommand } from "./commands/lint.ts";

const HELP = `dotsecret - Secure environment variable launcher

Usage:
  dotsecret run [options] -- <cmd> [args...]
  dotsecret render [options]
  dotsecret verify [options]
  dotsecret explain [options]
  dotsecret doctor
  dotsecret cache purge
  dotsecret shell [options]
  dotsecret scopes [options]
  dotsecret lint [options]

Common Options:
  -f, --file <path>       .secret file path (default: search from current dir)
  -p, --profile <name>    Profile to use
  -s, --scope <a,b,...>   Scopes to apply (comma-separated)
  --overlay <name,..>     Additional overlays to apply
  --pure                  Don't inherit parent environment
  --mask[=mode]          Masking mode: on (default), off, partial
  --strict               Treat warnings as errors
  --cache=<mode>         Cache mode: off, mem (default), disk
  --ttl=<duration>       Cache TTL (e.g., 30s, 5m, 1h)
  --audit=<mode>         Audit mode: json, stderr, off (default)
  --policy <path>        Policy file path
  --force                Override protected keys
  --no-auto-scope        Disable automatic scope detection

Run Options:
  Run a command with injected environment variables

Render Options:
  --format <fmt>         Output format: env (default), json, shell, k8s, compose

Verify Options:
  --drift                Check for drift in external references

Examples:
  dotsecret run -- node server.js
  dotsecret run -p production -s node -- npm start
  dotsecret render --format json
  dotsecret verify --strict
`;

async function main() {
  // Capture arguments after "--" (passthrough to subcommand)
  const rawArgs = [...Deno.args];
  const ddIndex = rawArgs.indexOf("--");
  const passthrough = ddIndex >= 0 ? rawArgs.slice(ddIndex + 1) : [];
  const argsToParse = ddIndex >= 0 ? rawArgs.slice(0, ddIndex) : rawArgs;

  const args = parseArgs(argsToParse, {
    alias: {
      f: "file",
      p: "profile",
      s: "scope",
      h: "help",
    },
    string: [
      "file",
      "profile",
      "scope",
      "overlay",
      "mask",
      "cache",
      "ttl",
      "audit",
      "policy",
      "format",
    ],
    boolean: ["pure", "strict", "force", "no-auto-scope", "drift", "help"],
    default: {
      cache: "mem",
      audit: "off",
      mask: "on",
    },
    // Allow options to appear after subcommand (e.g., `run -p x -s y -- <cmd>`)
    stopEarly: false,
  });

  // Extract command
  const command = args._[0]?.toString();

  if (!command || args.help) {
    console.log(HELP);
    Deno.exit(0);
  }

  // Normalize comma and repeatable string options into arrays
  const toList = (val: unknown): string[] => {
    if (!val) return [];
    const parts = Array.isArray(val) ? val as unknown[] : [val as unknown];
    const out: string[] = [];
    for (const p of parts) {
      const s = String(p);
      for (const seg of s.split(",")) {
        const t = seg.trim();
        if (t) out.push(t);
      }
    }
    return out;
  };

  const scopes = toList(args.scope);
  const overlays = toList(args.overlay);

  // Update args with parsed arrays
  const parsedArgs = { ...args, scope: scopes, overlay: overlays } as Record<string, unknown> & {
    _: unknown[];
  };
  (parsedArgs as Record<string, unknown>)["--"] = passthrough;

  try {
    switch (command) {
      case "run":
        await runCommand(parsedArgs);
        break;
      case "render":
        await renderCommand(parsedArgs);
        break;
      case "verify":
        await verifyCommand(parsedArgs);
        break;
      case "explain":
        await explainCommand(parsedArgs);
        break;
      case "doctor":
        await doctorCommand();
        break;
      case "cache":
        await cacheCommand(parsedArgs);
        break;
      case "shell":
        await shellCommand(parsedArgs);
        break;
      case "scopes":
        await scopesCommand(parsedArgs);
        break;
      case "lint":
        await lintCommand(parsedArgs);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        Deno.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    if (Deno.env.get("DEBUG")) {
      console.error(error instanceof Error ? error.stack : String(error));
    }
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
