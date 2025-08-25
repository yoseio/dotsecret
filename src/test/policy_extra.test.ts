import { assertArrayIncludes } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import type {
  KeyMetadata,
  PipeCall,
  Policy,
  PolicyContext,
  PolicyEffect,
  ProviderRef,
} from "../core/types.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

class TestPolicy implements Policy {
  onStart(_ctx: PolicyContext): PolicyEffect {
    return { effect: "warn", reason: "start" };
  }
  onFinish(_ctx: PolicyContext): PolicyEffect {
    return { effect: "warn", reason: "finish" };
  }
  onProvider(ref: ProviderRef, _ctx: PolicyContext): PolicyEffect {
    if ((ref.kind === "uri" ? ref.scheme : ref.fn) === "env") {
      return { effect: "deny", reason: "no env" };
    }
    return { effect: "allow" };
  }
  onPipe(call: PipeCall, _ctx: PolicyContext): PolicyEffect {
    if (call.name === "upper") return { effect: "warn", reason: "upper warn" };
    return { effect: "allow" };
  }
  onKeyInject(key: string, _meta: KeyMetadata, _ctx: PolicyContext): PolicyEffect {
    if (key === "SAFE") return { effect: "warn", reason: "safe key" };
    return { effect: "allow" };
  }
}

async function run(content: string) {
  const parsed = new Parser(content, "<memory>").parse();
  const cache = new MemoryCache();
  const ev = new Evaluator(cache, new TestPolicy(), new NoOpAuditLogger(), {});
  try {
    return await ev.evaluate([parsed]);
  } finally {
    cache.destroy();
  }
}

Deno.test("Policy - deny provider records error", async () => {
  const res = await run('X = !env(name="FOO")');
  // Should not throw; error is recorded
  if (!res.errors.some((e) => e.includes("Policy denied provider access"))) {
    throw new Error(`Expected policy denial error, got: ${JSON.stringify(res.errors)}`);
  }
});

Deno.test("Policy - warn on pipe and key inject", async () => {
  const res = await run(['SAFE = "a" | upper', 'B = "b"'].join("\n"));
  assertArrayIncludes(res.warnings, [
    "start",
    "upper warn",
    "Policy warning for key SAFE: safe key",
    "finish",
  ]);
});
