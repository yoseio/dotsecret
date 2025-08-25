import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function evaluate(content: string) {
  const parsed = new Parser(content, "<memory>").parse();
  const cache = new MemoryCache();
  const ev = new Evaluator(cache, new DefaultPolicy(), new NoOpAuditLogger(), {});
  try {
    return await ev.evaluate([parsed]);
  } finally {
    cache.destroy();
  }
}

Deno.test("Evaluator - fallback is not piped", async () => {
  const res = await evaluate('A = "" | upper || "x"');
  // main value empty -> fallback used without piping => lowercase x
  assertEquals(res.env.A, "x");
});
