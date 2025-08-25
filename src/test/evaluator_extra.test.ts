import { assertArrayIncludes, assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function evaluate(content: string) {
  const file = "<memory>";
  const parsed = new Parser(content, file).parse();
  const cache = new MemoryCache();
  const policy = new DefaultPolicy();
  const audit = new NoOpAuditLogger();
  const evaluator = new Evaluator(cache, policy, audit, {});
  const result = await evaluator.evaluate([parsed]);
  cache.destroy();
  return result;
}

Deno.test("Evaluator - @unset removes key", async () => {
  const result = await evaluate([
    'KEY = "value"',
    "KEY = @unset",
  ].join("\n"));

  assertEquals(result.env.KEY, undefined);
});

Deno.test("Evaluator - protected prevents overwrite", async () => {
  const result = await evaluate([
    '!protected SECRET = "orig"',
    'SECRET = "new"',
  ].join("\n"));

  // Value remains original and warning emitted
  assertEquals(result.env.SECRET, "orig");
  assertArrayIncludes(result.warnings, ["Cannot override protected key: SECRET"]);
  assertEquals(result.metadata.SECRET.protected, true);
});

Deno.test("Evaluator - unknown pipe hard vs soft", async () => {
  const hard = await evaluate('X = "a" | noSuchPipe()');
  // Hard failure records an error and does not set the key
  assertEquals(hard.env.X, undefined);
  if (hard.errors.length === 0) throw new Error("Expected errors for hard unknown pipe");

  const soft = await evaluate('Y = "a" ?| noSuchPipe()');
  // Soft unknown pipe is ignored
  assertEquals(soft.env.Y, "a");
  assertEquals(soft.errors.length > 0, false);
});

Deno.test("Evaluator - fallback applies on empty value", async () => {
  const result = await evaluate('A = "" || "fallback"');
  assertEquals(result.env.A, "fallback");
});
