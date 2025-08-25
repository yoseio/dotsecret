import { assertEquals } from "@std/assert";
import { explainCommand } from "../cli/commands/explain.ts";

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

Deno.test("explainCommand - shows keys and masked values", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-cli-explain-" });
  await Deno.writeTextFile(
    `${dir}/.secret`,
    [
      'FOO = "bar"',
      'BAZ = "qux"',
    ].join("\n"),
  );

  const cwd = Deno.cwd();
  const cap = captureConsole();
  try {
    Deno.chdir(dir);
    await explainCommand({ _: [], pure: true });
    const out = cap.logs.join("\n");
    assertEquals(out.includes("Environment Variable Origins and Transformations"), true);
    assertEquals(out.includes("FOO:"), true);
    assertEquals(out.includes("BAZ:"), true);
    // Masked values should not print raw content when mask is default 'on'
    assertEquals(out.includes("bar"), false);
    assertEquals(out.includes("qux"), false);
  } finally {
    cap.restore();
    Deno.chdir(cwd);
    await Deno.remove(dir, { recursive: true });
  }
});
