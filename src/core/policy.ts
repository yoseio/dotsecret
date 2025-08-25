import type { Policy, PolicyContext, PolicyEffect } from "./types.ts";
import { join } from "@std/path";

export class DefaultPolicy implements Policy {
  onStart(_ctx: PolicyContext): PolicyEffect {
    return { effect: "allow" };
  }

  onProvider(_ref: unknown, _ctx: PolicyContext): PolicyEffect {
    return { effect: "allow" };
  }

  onPipe(_call: unknown, _ctx: PolicyContext): PolicyEffect {
    return { effect: "allow" };
  }

  onKeyInject(_key: string, _meta: unknown, _ctx: PolicyContext): PolicyEffect {
    return { effect: "allow" };
  }

  onFinish(_ctx: PolicyContext): PolicyEffect {
    return { effect: "allow" };
  }
}

export async function loadPolicy(policyPath?: string): Promise<Policy> {
  if (!policyPath) {
    // Look for default policy files
    const tsPolicyPath = join(Deno.cwd(), "dotsecret.policy.ts");
    const jsonPolicyPath = join(Deno.cwd(), "dotsecret.policy.json");

    try {
      await Deno.stat(tsPolicyPath);
      policyPath = tsPolicyPath;
    } catch {
      try {
        await Deno.stat(jsonPolicyPath);
        policyPath = jsonPolicyPath;
      } catch {
        // No policy file found, use default
        return new DefaultPolicy();
      }
    }
  }

  if (policyPath.endsWith(".ts")) {
    return await loadTSPolicy(policyPath);
  } else if (policyPath.endsWith(".json")) {
    return await loadJSONPolicy(policyPath);
  } else {
    throw new Error(`Unsupported policy file format: ${policyPath}`);
  }
}

async function loadTSPolicy(path: string): Promise<Policy> {
  const module = await import(`file://${path}`);

  if (module.default && typeof module.default === "object") {
    return createPolicyFromObject(module.default);
  }

  throw new Error("TypeScript policy must export a default object");
}

async function loadJSONPolicy(path: string): Promise<Policy> {
  const content = await Deno.readTextFile(path);
  const config = JSON.parse(content);

  return new JSONPolicy(config);
}

type PolicyLike = {
  onStart?: (ctx: PolicyContext) => PolicyEffect | Promise<PolicyEffect>;
  onProvider?: (ref: unknown, ctx: PolicyContext) => PolicyEffect | Promise<PolicyEffect>;
  onPipe?: (call: unknown, ctx: PolicyContext) => PolicyEffect | Promise<PolicyEffect>;
  onKeyInject?: (
    key: string,
    meta: unknown,
    ctx: PolicyContext,
  ) => PolicyEffect | Promise<PolicyEffect>;
  onFinish?: (ctx: PolicyContext) => PolicyEffect | Promise<PolicyEffect>;
};

function createPolicyFromObject(obj: unknown): Policy {
  const p = obj as PolicyLike;
  return {
    onStart: typeof p.onStart === "function" ? p.onStart.bind(obj) : undefined,
    onProvider: typeof p.onProvider === "function" ? p.onProvider.bind(obj) : undefined,
    onPipe: typeof p.onPipe === "function" ? p.onPipe.bind(obj) : undefined,
    onKeyInject: typeof p.onKeyInject === "function" ? p.onKeyInject.bind(obj) : undefined,
    onFinish: typeof p.onFinish === "function" ? p.onFinish.bind(obj) : undefined,
  };
}

interface JSONPolicyRule {
  match?: Record<string, unknown>;
  effect: "allow" | "deny" | "warn";
  reason?: string;
}

interface JSONPolicyConfig {
  rules?: {
    start?: JSONPolicyRule[];
    provider?: JSONPolicyRule[];
    pipe?: JSONPolicyRule[];
    keyInject?: JSONPolicyRule[];
    finish?: JSONPolicyRule[];
  };
  defaults?: {
    effect: "allow" | "deny";
  };
}

class JSONPolicy implements Policy {
  constructor(private config: JSONPolicyConfig) {}

  onStart(ctx: PolicyContext): PolicyEffect {
    return this.evaluateRules(this.config.rules?.start || [], ctx);
  }

  onProvider(ref: unknown, ctx: PolicyContext): PolicyEffect {
    return this.evaluateRules(this.config.rules?.provider || [], { ...ctx, ref });
  }

  onPipe(call: unknown, ctx: PolicyContext): PolicyEffect {
    return this.evaluateRules(this.config.rules?.pipe || [], { ...ctx, call });
  }

  onKeyInject(key: string, meta: unknown, ctx: PolicyContext): PolicyEffect {
    return this.evaluateRules(this.config.rules?.keyInject || [], { ...ctx, key, meta });
  }

  onFinish(ctx: PolicyContext): PolicyEffect {
    return this.evaluateRules(this.config.rules?.finish || [], ctx);
  }

  private evaluateRules(rules: JSONPolicyRule[], context: unknown): PolicyEffect {
    for (const rule of rules) {
      if (this.matchesRule(rule, context)) {
        return { effect: rule.effect, reason: rule.reason };
      }
    }

    return { effect: this.config.defaults?.effect || "allow" };
  }

  private matchesRule(rule: JSONPolicyRule, context: unknown): boolean {
    if (!rule.match) return true;

    for (const [key, value] of Object.entries(rule.match)) {
      const contextValue = this.getNestedValue(context, key);

      if (value instanceof RegExp) {
        if (typeof contextValue !== "string" || !value.test(contextValue)) {
          return false;
        }
      } else if (Array.isArray(value)) {
        if (!value.includes(contextValue)) {
          return false;
        }
      } else if (contextValue !== value) {
        return false;
      }
    }

    return true;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === "object" && current !== null && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }
}
