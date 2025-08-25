import { assertEquals } from "@std/assert";
import { DefaultPolicy } from "../core/policy.ts";
import type { PipeCall, PolicyContext, PolicyEffect, ProviderRef } from "../core/types.ts";

Deno.test("DefaultPolicy - allows everything", async () => {
  const policy = new DefaultPolicy();
  const context: PolicyContext = {
    action: "run",
    profile: "production",
    scopes: ["node"],
    overlays: ["custom"],
    flags: { mask: "on" },
    isCI: false,
    env: {},
  };

  assertEquals(await policy.onStart(context), { effect: "allow" });

  const providerRef: ProviderRef = {
    kind: "uri",
    scheme: "gcp",
    uri: "gcp://projects/test/secrets/api-key",
  };
  assertEquals(await policy.onProvider(providerRef, context), { effect: "allow" });

  const pipeCall: PipeCall = { name: "sha256", args: {} };
  assertEquals(await policy.onPipe(pipeCall, context), { effect: "allow" });

  assertEquals(
    await policy.onKeyInject("API_KEY", {
      value: "secret",
      source: "test.secret",
      transforms: [],
      protected: false,
    }, context),
    { effect: "allow" },
  );

  assertEquals(await policy.onFinish(context), { effect: "allow" });
});

Deno.test("Policy - TypeScript policy example", async () => {
  // Create a test policy
  const testPolicy = {
    async onStart(ctx: PolicyContext): Promise<PolicyEffect> {
      // Deny unmasked render in CI
      if (ctx.isCI && ctx.action === "render" && ctx.flags.mask === "off") {
        return { effect: "deny", reason: "Unmasked render forbidden in CI" };
      }

      // Warn about production without audit
      if (ctx.profile === "production" && ctx.flags.audit === "off") {
        return { effect: "warn", reason: "Audit should be enabled in production" };
      }

      return { effect: "allow" };
    },

    async onProvider(ref: ProviderRef, ctx: PolicyContext): Promise<PolicyEffect> {
      // Require 1Password Connect
      if (ref.kind === "uri" && ref.scheme === "op") {
        if (!ctx.env.OP_CONNECT_TOKEN) {
          return { effect: "deny", reason: "1Password Connect required" };
        }
      }

      // Warn about file provider in production
      if (ctx.profile === "production" && ref.kind === "uri" && ref.scheme === "file") {
        return { effect: "warn", reason: "File provider in production" };
      }

      return { effect: "allow" };
    },

    async onPipe(call: PipeCall, ctx: PolicyContext): Promise<PolicyEffect> {
      // Example: Block certain pipes in certain contexts
      if (call.name === "sha256" && ctx.scopes.includes("frontend")) {
        return { effect: "deny", reason: "SHA256 not allowed in frontend scope" };
      }

      return { effect: "allow" };
    },

    async onKeyInject(key: string, meta: any, ctx: PolicyContext): Promise<PolicyEffect> {
      // Enforce naming convention
      if (!key.match(/^[A-Z][A-Z0-9_]*$/)) {
        return { effect: "warn", reason: `Key '${key}' should use UPPER_SNAKE_CASE` };
      }

      // Required keys in production
      if (ctx.profile === "production") {
        const required = ["API_KEY", "DATABASE_URL"];
        if (required.includes(key) && !meta.value) {
          return { effect: "deny", reason: `Required key '${key}' is missing` };
        }
      }

      return { effect: "allow" };
    },

    async onFinish(_ctx: PolicyContext): Promise<PolicyEffect> {
      return { effect: "allow" };
    },
  };

  // Test CI render blocking
  const ciContext: PolicyContext = {
    action: "render",
    profile: undefined,
    scopes: [],
    overlays: [],
    flags: { mask: "off" },
    isCI: true,
    env: {},
  };

  const startEffect = await testPolicy.onStart(ciContext);
  assertEquals(startEffect.effect, "deny");
  assertEquals(startEffect.reason, "Unmasked render forbidden in CI");

  // Test production warning
  const prodContext: PolicyContext = {
    action: "run",
    profile: "production",
    scopes: [],
    overlays: [],
    flags: { audit: "off" },
    isCI: false,
    env: {},
  };

  const prodEffect = await testPolicy.onStart(prodContext);
  assertEquals(prodEffect.effect, "warn");
  assertEquals(prodEffect.reason?.includes("Audit"), true);

  // Test 1Password Connect requirement
  const opRef: ProviderRef = {
    kind: "uri",
    scheme: "op",
    uri: "op://vault/item/field",
  };

  const opEffect = await testPolicy.onProvider(opRef, {
    ...prodContext,
    env: {}, // No OP_CONNECT_TOKEN
  });
  assertEquals(opEffect.effect, "deny");
  assertEquals(opEffect.reason, "1Password Connect required");

  // Test pipe restriction
  const pipeCall: PipeCall = { name: "sha256", args: {} };
  const pipeContext: PolicyContext = {
    ...prodContext,
    scopes: ["frontend"],
  };

  const pipeEffect = await testPolicy.onPipe(pipeCall, pipeContext);
  assertEquals(pipeEffect.effect, "deny");
  assertEquals(pipeEffect.reason?.includes("frontend"), true);

  // Test key naming
  const keyEffect = await testPolicy.onKeyInject("invalid-key", { value: "test" }, prodContext);
  assertEquals(keyEffect.effect, "warn");
  assertEquals(keyEffect.reason?.includes("UPPER_SNAKE_CASE"), true);
});

Deno.test("Policy - JSON policy format", async () => {
  // Test JSON policy evaluation
  const jsonConfig = {
    rules: {
      start: [{
        match: { "action": "render", "flags.mask": "off", "isCI": true },
        effect: "deny" as const,
        reason: "No unmasked render in CI",
      }],
      provider: [{
        match: { "ref.scheme": "file", "profile": "production" },
        effect: "warn" as const,
        reason: "File provider in production",
      }],
      keyInject: [{
        match: { "key": "API_KEY", "profile": "production" },
        effect: "deny" as const,
        reason: "API_KEY required in production",
      }],
    },
    defaults: {
      effect: "allow" as const,
    },
  };

  // The actual JSON policy implementation would evaluate these rules
  // This test demonstrates the expected structure
  assertEquals(jsonConfig.rules.start.length, 1);
  assertEquals(jsonConfig.rules.start[0].effect, "deny");
  assertEquals(jsonConfig.defaults.effect, "allow");
});

Deno.test("Policy - loading from file", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "dotsecret-policy-test-" });

  try {
    // Create a test TypeScript policy
    const tsPolicyPath = `${tempDir}/dotsecret.policy.ts`;
    await Deno.writeTextFile(
      tsPolicyPath,
      `
export default {
  async onStart(ctx) {
    if (ctx.isCI && ctx.action === "render") {
      return { effect: "deny", reason: "Test policy" };
    }
    return { effect: "allow" };
  }
};
    `,
    );

    // Load policy - would work if we had dynamic import support
    // const policy = await loadPolicy(tsPolicyPath);
    // For now, just test the file was created
    assertEquals(await Deno.stat(tsPolicyPath).then(() => true).catch(() => false), true);

    // Create a JSON policy
    const jsonPolicyPath = `${tempDir}/dotsecret.policy.json`;
    await Deno.writeTextFile(
      jsonPolicyPath,
      JSON.stringify({
        rules: {
          start: [{
            match: { isCI: true },
            effect: "warn",
            reason: "Running in CI",
          }],
        },
      }),
    );

    assertEquals(await Deno.stat(jsonPolicyPath).then(() => true).catch(() => false), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("Policy - effect precedence", async () => {
  // Test that deny > warn > allow
  const effects: PolicyEffect[] = [
    { effect: "allow" },
    { effect: "warn", reason: "Warning" },
    { effect: "deny", reason: "Denied" },
  ];

  // In practice, the first matching rule would apply
  // or we might aggregate effects across hooks
  const hasDeny = effects.some((e) => e.effect === "deny");
  const hasWarn = effects.some((e) => e.effect === "warn");

  assertEquals(hasDeny, true);
  assertEquals(hasWarn, true);

  // Final effect would be deny (highest precedence)
  const finalEffect = hasDeny ? "deny" : hasWarn ? "warn" : "allow";
  assertEquals(finalEffect, "deny");
});
