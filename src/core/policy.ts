import type { Policy, PolicyContext, PolicyEffect } from "./types.ts";
import { join } from "@std/path";

export class DefaultPolicy implements Policy {
  async onStart(_ctx: PolicyContext): Promise<PolicyEffect> {
    return { effect: "allow" };
  }

  async onProvider(_ref: unknown, _ctx: PolicyContext): Promise<PolicyEffect> {
    return { effect: "allow" };
  }

  async onPipe(_call: unknown, _ctx: PolicyContext): Promise<PolicyEffect> {
    return { effect: "allow" };
  }

  async onKeyInject(_key: string, _meta: unknown, _ctx: PolicyContext): Promise<PolicyEffect> {
    return { effect: "allow" };
  }

  async onFinish(_ctx: PolicyContext): Promise<PolicyEffect> {
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

function createPolicyFromObject(obj: any): Policy {
  return {
    onStart: obj.onStart?.bind(obj),
    onProvider: obj.onProvider?.bind(obj),
    onPipe: obj.onPipe?.bind(obj),
    onKeyInject: obj.onKeyInject?.bind(obj),
    onFinish: obj.onFinish?.bind(obj),
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

  async onStart(ctx: PolicyContext): Promise<PolicyEffect> {
    return this.evaluateRules(this.config.rules?.start || [], ctx);
  }

  async onProvider(ref: unknown, ctx: PolicyContext): Promise<PolicyEffect> {
    return this.evaluateRules(this.config.rules?.provider || [], { ...ctx, ref });
  }

  async onPipe(call: unknown, ctx: PolicyContext): Promise<PolicyEffect> {
    return this.evaluateRules(this.config.rules?.pipe || [], { ...ctx, call });
  }

  async onKeyInject(key: string, meta: unknown, ctx: PolicyContext): Promise<PolicyEffect> {
    return this.evaluateRules(this.config.rules?.keyInject || [], { ...ctx, key, meta });
  }

  async onFinish(ctx: PolicyContext): Promise<PolicyEffect> {
    return this.evaluateRules(this.config.rules?.finish || [], ctx);
  }

  private evaluateRules(rules: JSONPolicyRule[], context: any): PolicyEffect {
    for (const rule of rules) {
      if (this.matchesRule(rule, context)) {
        return { effect: rule.effect, reason: rule.reason };
      }
    }
    
    return { effect: this.config.defaults?.effect || "allow" };
  }

  private matchesRule(rule: JSONPolicyRule, context: any): boolean {
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

  private getNestedValue(obj: any, path: string): any {
    const parts = path.split(".");
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
}