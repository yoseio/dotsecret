import { assertEquals } from "@std/assert";
import { shellCommand } from "../cli/commands/shell.ts";

Deno.test("shellCommand - runs configured shell and exits with status", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-cli-shell-" });
  await Deno.writeTextFile(`${dir}/.secret`, 'FOO = "bar"');

  // Create a fake shell that exits immediately with 0
  const fakeShell = `${dir}/fake_shell.sh`;
  await Deno.writeTextFile(fakeShell, "#!/bin/sh\nexit 0\n");
  await Deno.chmod(fakeShell, 0o755);

  const prevShell = Deno.env.get("SHELL");
  Deno.env.set("SHELL", fakeShell);

  const cwd = Deno.cwd();
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
      await shellCommand({ _: [], pure: true, mask: "off" });
    } catch (e) {
      if (!(e instanceof Error && e.message === "exit")) throw e;
    }
    assertEquals(exitCode, 0);
  } finally {
    // Restore
    if (prevShell) Deno.env.set("SHELL", prevShell);
    else Deno.env.delete("SHELL");
    // deno-lint-ignore no-explicit-any
    (Deno as any).exit = origExit;
    Deno.chdir(cwd);
    await Deno.remove(dir, { recursive: true });
  }
});
