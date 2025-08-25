import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function run(content: string) {
  const parsed = new Parser(content, "<memory>").parse();
  const cache = new MemoryCache();
  const ev = new Evaluator(cache, new DefaultPolicy(), new NoOpAuditLogger(), {});
  try {
    return await ev.evaluate([parsed]);
  } finally {
    cache.destroy();
  }
}

Deno.test("Evaluator - chained appends with and without explicit separator", async () => {
  const res = await run([
    'PATH = "/bin"',
    'PATH += (":") "/usr/bin"',
    'PATH += "/sbin"',
  ].join("\n"));
  assertEquals(res.env.PATH, "/bin:/usr/bin:/sbin");
});

Deno.test("Evaluator - unset then conditional set", async () => {
  const res = await run([
    'A = "1"',
    "A = @unset",
    'A ?= "2"',
  ].join("\n"));
  assertEquals(res.env.A, "2");
});
