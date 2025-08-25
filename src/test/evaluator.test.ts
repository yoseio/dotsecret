import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function evaluate(content: string, opts: { profile?: string } = {}) {
  const file = "<memory>";
  const parsed = new Parser(content, file).parse();
  const cache = new MemoryCache();
  const policy = new DefaultPolicy();
  const audit = new NoOpAuditLogger();
  const evaluator = new Evaluator(cache, policy, audit, {
    profile: opts.profile,
  });
  const result = await evaluator.evaluate([parsed]);
  cache.destroy();
  return result;
}

Deno.test("Evaluator - resolves literal and pipes", async () => {
  const result = await evaluate(
    [
      'NAME = " alice " | trim | upper',
      'GREETING = "Hello ${NAME}!"',
    ].join("\n"),
  );
  assertEquals(result.env.NAME, "ALICE");
  assertEquals(result.env.GREETING, "Hello ALICE!");
});

Deno.test("Evaluator - resolves provider references", async () => {
  Deno.env.set("EVAL_TEST", "ok-value");
  try {
    const result = await evaluate(
      [
        'ENV_VAL = !env(name="EVAL_TEST")',
        'JSON_VAL = !json(value="{\\"a\\":{\\"b\\":1}}", path="a.b")',
      ].join("\n"),
    );
    assertEquals(result.env.ENV_VAL, "ok-value");
    assertEquals(result.env.JSON_VAL, "1");
  } finally {
    Deno.env.delete("EVAL_TEST");
  }
});

Deno.test("Evaluator - += appends to existing with separator", async () => {
  const result = await evaluate(
    [
      'PATH = "/bin"',
      'PATH += (":") "/usr/bin"',
    ].join("\n"),
  );
  assertEquals(result.env.PATH, "/bin:/usr/bin");
});

Deno.test("Evaluator - ?= only sets when missing", async () => {
  const result = await evaluate(
    [
      'PORT ?= "3000"',
      'PORT ?= "4000"',
    ].join("\n"),
  );
  assertEquals(result.env.PORT, "3000");
});
