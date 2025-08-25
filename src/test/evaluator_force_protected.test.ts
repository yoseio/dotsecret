import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

Deno.test("Evaluator - force overrides protected", async () => {
  const content = ['!protected A = "1"', 'A = "2"'].join("\n");
  const parsed = new Parser(content, "<memory>").parse();
  const cache = new MemoryCache();
  const eval1 = new Evaluator(cache, new DefaultPolicy(), new NoOpAuditLogger(), { force: true });
  const res = await eval1.evaluate([parsed]);
  try {
    assertEquals(res.env.A, "2");
    // No warning expected when force overriding protected
    if (res.warnings.some((w) => w.includes("protected"))) {
      throw new Error(`Unexpected protected warning: ${JSON.stringify(res.warnings)}`);
    }
  } finally {
    cache.destroy();
  }
});
