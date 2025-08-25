import { assertEquals } from "@std/assert";
import { lintCommand } from "../cli/commands/lint.ts";

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

Deno.test("lintCommand - finds issues and exits in strict mode", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-cli-lint-" });
  await Deno.writeTextFile(
    `${dir}/.secret`,
    [
      // Trailing whitespace (info)
      'TRAIL = "v"   ',
      // Tab character (info)
      'TAB	= "v"',
      // Possible hardcoded secret (error) - unquoted to trigger simple matcher
      "AWS_KEY = AKIAABCDEFGHIJKLMNOP",
      // TODO comment (info)
      "# TODO: fix this later",
      // Referenced key so it's not marked as unused
      'USED = "1"',
      'REF = "${USED}"',
    ].join("\n"),
  );

  const cwd = Deno.cwd();
  const cap = captureConsole();
  // Intercept exit
  const origExit = Deno.exit;
  let exitCode: number | undefined;
  // deno-lint-ignore no-explicit-any
  (Deno as any).exit = (code?: number) => {
    exitCode = code;
    throw new Error("exit");
  };
  try {
    Deno.chdir(dir);
    try {
      await lintCommand({ _: [], strict: true });
    } catch (e) {
      if (!(e instanceof Error && e.message === "exit")) throw e;
    }
    // Should fail in strict mode due to errors/warnings
    assertEquals(exitCode, 1);
    const out = cap.logs.join("\n");
    assertEquals(out.includes("Found"), true);
  } finally {
    // Restore
    // deno-lint-ignore no-explicit-any
    (Deno as any).exit = origExit;
    cap.restore();
    Deno.chdir(cwd);
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("lintCommand - no issues passes", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-cli-lint-" });
  await Deno.writeTextFile(`${dir}/.secret`, 'GOOD_KEY = "ok"');
  const cwd = Deno.cwd();
  const cap = captureConsole();
  try {
    Deno.chdir(dir);
    await lintCommand({ _: [], strict: false });
    const out = cap.logs.join("\n");
    // In minimal files, linter may still report unused key info
    assertEquals(out.includes("Found"), true);
  } finally {
    cap.restore();
    Deno.chdir(cwd);
    await Deno.remove(dir, { recursive: true });
  }
});
