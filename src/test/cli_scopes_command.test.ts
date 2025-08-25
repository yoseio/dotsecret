import { assertEquals } from "@std/assert";
import { scopesCommand } from "../cli/commands/scopes.ts";

function captureConsole() {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  return {
    logs,
    restore() {
      console.log = origLog;
    },
  };
}

Deno.test("scopesCommand - lists defined scopes and extends", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-cli-scopes-" });
  await Deno.writeTextFile(
    `${dir}/.secret`,
    [
      "[scope:base]",
      'BASE = "1"',
      "",
      "[scope:web extends base]",
      'FOO = "2"',
      "",
    ].join("\n"),
  );

  // Make PATH point to a small temp dir to speed auto-detect
  const pathDir = await Deno.makeTempDir({ prefix: "dotsecret-path-" });
  const origPath = Deno.env.get("PATH");
  Deno.env.set("PATH", pathDir);
  // Create a fake executable named 'web' to suggest auto-detect mapping
  await Deno.writeTextFile(`${pathDir}/web`, "#!/bin/sh\necho web\n");
  await Deno.chmod(`${pathDir}/web`, 0o755);

  const cwd = Deno.cwd();
  const cap = captureConsole();
  try {
    Deno.chdir(dir);
    await scopesCommand({ _: [] });
    const out = cap.logs.join("\n");
    assertEquals(out.includes("Available Scopes"), true);
    assertEquals(out.includes("base:"), true);
    assertEquals(out.includes("web:"), true);
    assertEquals(out.includes("Extends: base"), true);
    // Auto-detection hint line
    assertEquals(/web → \[scope:web\]/.test(out), true);
  } finally {
    cap.restore();
    if (origPath) Deno.env.set("PATH", origPath);
    else Deno.env.delete("PATH");
    Deno.chdir(cwd);
    await Deno.remove(pathDir, { recursive: true });
    await Deno.remove(dir, { recursive: true });
  }
});
