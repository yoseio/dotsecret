import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function evaluate(content: string, scopes: string[]) {
  const parsed = new Parser(content, "<memory>").parse();
  const cache = new MemoryCache();
  const ev = new Evaluator(cache, new DefaultPolicy(), new NoOpAuditLogger(), { scopes });
  try {
    return await ev.evaluate([parsed]);
  } finally {
    cache.destroy();
  }
}

Deno.test("Scopes - selecting child applies parent blocks via extends", async () => {
  const content = [
    "[scope:node]",
    'NODE = "1"',
    "",
    "[scope:python extends node]",
    'PY = "1"',
  ].join("\n");

  const res = await evaluate(content, ["python"]);
  assertEquals(res.env.NODE, "1");
  assertEquals(res.env.PY, "1");
});

Deno.test("Scopes - selecting parent does not apply child blocks", async () => {
  const content = [
    "[scope:node]",
    'NODE = "1"',
    "",
    "[scope:python extends node]",
    'PY = "1"',
  ].join("\n");

  const res = await evaluate(content, ["node"]);
  assertEquals(res.env.NODE, "1");
  assertEquals(res.env.PY, undefined);
});
