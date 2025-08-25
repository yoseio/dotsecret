import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function evalContent(content: string) {
  const parsed = new Parser(content, "<memory>").parse();
  const cache = new MemoryCache();
  const ev = new Evaluator(cache, new DefaultPolicy(), new NoOpAuditLogger(), {});
  try {
    return await ev.evaluate([parsed]);
  } finally {
    cache.destroy();
  }
}

Deno.test("Evaluator - fallback ignored when value not empty", async () => {
  const res = await evalContent('A = "val" || "fallback"');
  assertEquals(res.env.A, "val");
});

Deno.test("Evaluator - soft unknown pipe ignored then known pipe applied", async () => {
  const res = await evalContent('B = "x" ?| nope() | upper');
  assertEquals(res.env.B, "X");
});

Deno.test("Evaluator - '?|' only applies to targeted pipe", async () => {
  const res = await evalContent('C = "x" ?| replace(from="x", to="y") | upper');
  assertEquals(res.env.C, "Y");
});
