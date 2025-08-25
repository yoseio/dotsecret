import { assertEquals } from "@std/assert";
import { OverlayResolver } from "../core/overlay.ts";

Deno.test("OverlayResolver - included files get '(included)' suffix", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });
  try {
    await Deno.writeTextFile(`${dir}/.secret`, "@include ./a.secret");
    await Deno.writeTextFile(`${dir}/a.secret`, 'A = "1"');
    const r = new OverlayResolver(dir);
    const parsed = await r.parseAllFiles({});
    // Expect 2: base + included
    assertEquals(parsed.length, 2);
    const included = parsed.find((f) => f.path.includes("(included)"));
    if (!included) throw new Error("Expected included file to be marked");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
