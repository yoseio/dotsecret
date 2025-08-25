import { assertEquals } from "@std/assert";
import { cacheCommand } from "../cli/commands/cache.ts";

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

Deno.test("cacheCommand - purge removes cache directory", async () => {
  const temp = await Deno.makeTempDir({ prefix: "dotsecret-cache-" });
  const cacheRoot = `${temp}/cache-home`;
  const dotsecretCache = `${cacheRoot}/dotsecret`;
  await Deno.mkdir(dotsecretCache, { recursive: true });
  await Deno.writeTextFile(`${dotsecretCache}/dummy`, "x");

  const origXdg = Deno.env.get("XDG_CACHE_HOME");
  Deno.env.set("XDG_CACHE_HOME", cacheRoot);

  const cap = captureConsole();
  try {
    await cacheCommand({ _: ["cache", "purge"] });
    let exists = true;
    try {
      await Deno.stat(dotsecretCache);
    } catch (e) {
      exists = !(e instanceof Deno.errors.NotFound);
    }
    assertEquals(exists, false);
  } finally {
    cap.restore();
    if (origXdg) Deno.env.set("XDG_CACHE_HOME", origXdg);
    else Deno.env.delete("XDG_CACHE_HOME");
    await Deno.remove(temp, { recursive: true });
  }
});

Deno.test("cacheCommand - invalid subcommand exits with error", async () => {
  // Intercept Deno.exit
  const origExit = Deno.exit;
  let exitCode: number | undefined;
  // deno-lint-ignore no-explicit-any
  (Deno as any).exit = (code?: number) => {
    exitCode = code;
    throw new Error("exit");
  };
  try {
    try {
      await cacheCommand({ _: ["cache", "noop"] });
    } catch (e) {
      if (!(e instanceof Error && e.message === "exit")) throw e;
    }
    assertEquals(exitCode, 1);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).exit = origExit;
  }
});
