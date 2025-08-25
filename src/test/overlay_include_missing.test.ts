import { assertEquals } from "@std/assert";
import { OverlayResolver } from "../core/overlay.ts";

Deno.test("OverlayResolver - missing include is skipped", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });
  try {
    await Deno.writeTextFile(`${dir}/.secret`, "@include ./missing.secret");
    const r = new OverlayResolver(dir);
    const parsed = await r.parseAllFiles({});
    // Only base file should be parsed
    assertEquals(parsed.length, 1);
    assertEquals(parsed[0].path.endsWith(".secret"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
