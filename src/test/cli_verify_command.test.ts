import { assertEquals } from "@std/assert";
import { verifyCommand } from "../cli/commands/verify.ts";

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

Deno.test("verifyCommand - passes with single valid file", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-cli-verify-" });
  await Deno.writeTextFile(`${dir}/.secret`, 'A = "1"');
  const cap = captureConsole();
  const cwd = Deno.cwd();
  try {
    Deno.chdir(dir);
    await verifyCommand({ _: [] });
    // Should not exit with error and should print success summary
    const out = cap.logs.join("\n");
    assertEquals(out.includes("All checks passed"), true);
  } finally {
    cap.restore();
    Deno.chdir(cwd);
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("verifyCommand - strict mode exits on conflicts", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-cli-verify-" });
  await Deno.writeTextFile(`${dir}/.secret`, 'K = "v1"');
  await Deno.writeTextFile(`${dir}/.secret.local`, 'K = "v2"');
  await Deno.writeTextFile(`${dir}/.secret.prod`, 'K = "v3"');

  const cap = captureConsole();

  // Intercept Deno.exit
  const origExit = Deno.exit;
  let exitCode: number | undefined;
  // deno-lint-ignore no-explicit-any
  (Deno as any).exit = (code?: number) => {
    exitCode = code;
    throw new Error("exit");
  };

  const cwd = Deno.cwd();
  try {
    Deno.chdir(dir);
    try {
      await verifyCommand({ _: [], strict: true, profile: "prod" });
    } catch (e) {
      // ignore our injected exit error
      if (!(e instanceof Error && e.message === "exit")) throw e;
    }
    assertEquals(exitCode, 1);
    // Exit code should indicate failure in strict mode
    assertEquals(exitCode, 1);
  } finally {
    // Restore
    // deno-lint-ignore no-explicit-any
    (Deno as any).exit = origExit;
    cap.restore();
    Deno.chdir(cwd);
    await Deno.remove(dir, { recursive: true });
  }
});
