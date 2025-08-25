import type {
  Assignment,
  ASTNode,
  AuditLogger,
  Cache,
  CLIOptions,
  Directive,
  EvaluationResult,
  Expression,
  KeyMetadata,
  KV,
  ParsedFile,
  PipeCall,
  Policy,
  PolicyContext,
  Provider,
  ProviderRef,
  ResolveContext,
  Section,
} from "./types.ts";
import { getProviderRegistry } from "./providers/index.ts";
import { getPipeRegistry } from "./pipes/index.ts";
import { interpolate } from "./interpolate.ts";

export class EvaluationError extends Error {
  constructor(message: string, public key?: string) {
    super(message);
    this.name = "EvaluationError";
  }
}

export class Evaluator {
  private providers = getProviderRegistry();
  private pipes = getPipeRegistry();
  private env: KV = {};
  private metadata: Record<string, KeyMetadata> = {};
  private warnings: string[] = [];
  private errors: string[] = [];
  private currentProfile?: string;
  private currentScopes: string[] = [];
  private withContext: Record<string, Record<string, string>> = {};
  private assignmentLog: Map<string, Array<{ assignment: Assignment; source: string }>> = new Map();

  constructor(
    private cache: Cache,
    private policy: Policy,
    private audit: AuditLogger,
    private options: CLIOptions,
  ) {
    this.currentProfile = options.profile;
    this.currentScopes = options.scopes || [];
  }

  async evaluate(files: ParsedFile[]): Promise<EvaluationResult> {
    const policyContext = this.createPolicyContext();

    const startEffect = await this.policy.onStart?.(policyContext);
    if (startEffect?.effect === "deny") {
      throw new Error(`Policy denied start: ${startEffect.reason}`);
    }
    if (startEffect?.effect === "warn") {
      this.warnings.push(startEffect.reason || "Policy warning at start");
    }

    for (const file of files) {
      await this.evaluateFile(file);
    }

    await this.resolveExpressions();
    await this.applyInterpolations();
    await this.checkPolicies(policyContext);

    if (!this.options.pure) {
      this.mergeParentEnv();
    }

    const finishEffect = await this.policy.onFinish?.(policyContext);
    if (finishEffect?.effect === "deny") {
      throw new Error(`Policy denied finish: ${finishEffect.reason}`);
    }
    if (finishEffect?.effect === "warn") {
      this.warnings.push(finishEffect.reason || "Policy warning at finish");
    }

    await this.audit.flush();

    return {
      env: this.env,
      metadata: this.metadata,
      warnings: this.warnings,
      errors: this.errors,
    };
  }

  private async evaluateFile(file: ParsedFile): Promise<void> {
    let currentSection: Section | null = null;

    for (const node of file.nodes) {
      if (node.type === "section") {
        currentSection = node.data;
        continue;
      }

      if (!this.shouldProcessNode(node, currentSection)) {
        continue;
      }

      switch (node.type) {
        case "assignment":
          await this.processAssignment(node.data, file.path);
          break;
        case "directive":
          await this.processDirective(node.data, file.path);
          break;
      }
    }
  }

  private shouldProcessNode(_node: ASTNode, section: Section | null): boolean {
    if (!section) return true;

    if (section.type === "profile") {
      return !this.currentProfile ||
        section.name === "default" ||
        section.name === this.currentProfile;
    }

    if (section.type === "scope") {
      if (this.currentScopes.length === 0) return false;

      const scopeNames = this.expandScopes([section.name], new Set());
      return this.currentScopes.some((s) => scopeNames.has(s));
    }

    return true;
  }

  private expandScopes(scopes: string[], visited: Set<string>): Set<string> {
    const expanded = new Set<string>();

    for (const scope of scopes) {
      if (visited.has(scope)) continue;
      visited.add(scope);
      expanded.add(scope);

      // TODO: Handle scope extends when we have full scope definitions
    }

    return expanded;
  }

  private processAssignment(assignment: Assignment, source: string): void {
    const { key, operator, expression, options } = assignment;

    // Track every assignment in order for later resolution
    const list = this.assignmentLog.get(key) || [];
    list.push({ assignment, source });
    this.assignmentLog.set(key, list);

    if (operator === "@unset") {
      // Defer actual deletion to resolution phase
      return;
    }

    const existingMeta = this.metadata[key];
    if (existingMeta?.protected && !this.options.force) {
      this.warnings.push(`Cannot override protected key: ${key}`);
      return;
    }

    if (operator === "?=" && key in this.env) {
      return;
    }

    this.metadata[key] = {
      value: "",
      source,
      transforms: [],
      provider: expression.provider ? this.getProviderName(expression.provider) : undefined,
      protected: options.protected || false,
    };

    // Initialize placeholder; actual value computed in resolution phase
    this.env[key] = this.env[key] ?? "";
  }

  private async processDirective(directive: Directive, source: string): Promise<void> {
    switch (directive.type) {
      case "include":
        // Handle in overlay processing
        break;
      case "import":
        await this.processImport(directive, source);
        break;
      case "from":
        await this.processFrom(directive, source);
        break;
      case "with":
        await this.processWith(directive, source);
        break;
      case "if":
        await this.processIf(directive, source);
        break;
    }
  }

  private async processImport(directive: Directive, source: string): Promise<void> {
    if (directive.type !== "import") return;

    const provider = this.getProviderFromUri(directive.uri);
    if (!provider.resolveBatch) {
      this.errors.push(`Provider ${provider.name} does not support batch operations`);
      return;
    }

    const query = {
      baseUri: directive.uri,
      prefix: directive.prefix,
    };

    const ctx = this.createResolveContext();
    const result = await provider.resolveBatch(query, ctx);

    for (const [key, value] of Object.entries(result)) {
      let finalKey = key;
      if (directive.prefix) {
        finalKey = directive.prefix + key;
      }
      if (directive.case === "upper") {
        finalKey = finalKey.toUpperCase();
      } else if (directive.case === "lower") {
        finalKey = finalKey.toLowerCase();
      }

      this.env[finalKey] = value;
      this.metadata[finalKey] = {
        value,
        source,
        transforms: [],
        provider: provider.name,
        protected: false,
      };
    }
  }

  private async processFrom(directive: Directive, source: string): Promise<void> {
    if (directive.type !== "from") return;

    const provider = this.getProviderFromUri(directive.baseUri);
    const ctx = this.createResolveContext();

    for (const [key, path] of Object.entries(directive.mappings)) {
      const uri = `${directive.baseUri}/${path}`;
      const ref: ProviderRef = { kind: "uri", scheme: provider.name, uri };

      try {
        const value = await provider.resolveSingle(ref, ctx);
        this.env[key] = value;
        this.metadata[key] = {
          value,
          source,
          transforms: [],
          provider: provider.name,
          protected: false,
        };
      } catch (error) {
        this.errors.push(
          `Failed to resolve ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async processWith(directive: Directive, source: string): Promise<void> {
    if (directive.type !== "with") return;

    const prevContext = this.withContext[directive.provider] || {};
    this.withContext[directive.provider] = { ...prevContext, ...directive.args };

    for (const node of directive.body) {
      if (node.type === "assignment") {
        await this.processAssignment(node.data, source);
      }
    }

    this.withContext[directive.provider] = prevContext;
  }

  private async processIf(directive: Directive, source: string): Promise<void> {
    if (directive.type !== "if") return;

    if (this.evaluateCondition(directive.condition)) {
      for (const node of directive.body) {
        if (node.type === "assignment") {
          await this.processAssignment(node.data, source);
        }
      }
    }
  }

  private evaluateCondition(condition: string): boolean {
    // Simple condition evaluation
    // TODO: Implement proper condition parser
    const profileMatch = condition.match(/profile\s*==\s*"([^"]+)"/);
    if (profileMatch) {
      return this.currentProfile === profileMatch[1];
    }

    const envMatch = condition.match(/env\("([^"]+)"\)\s*==\s*"([^"]+)"/);
    if (envMatch) {
      return Deno.env.get(envMatch[1]) === envMatch[2];
    }

    return false;
  }

  private async resolveExpressions(): Promise<void> {
    for (const [key, entries] of this.assignmentLog) {
      let current: string | undefined = undefined;
      let finalAssignment: Assignment | undefined = undefined;
      let finalSource: string | undefined = undefined;

      for (const { assignment, source } of entries) {
        const { operator } = assignment;

        if (operator === "@unset") {
          current = undefined;
          finalAssignment = assignment;
          finalSource = source;
          continue;
        }

        try {
          const resolved = await this.resolveExpression(assignment.expression, key);
          if (operator === "=") {
            current = resolved;
          } else if (operator === "?=") {
            if (current === undefined) current = resolved;
          } else if (operator === "+=") {
            const sep = assignment.options.separator || ":";
            current = current && current.length > 0 ? `${current}${sep}${resolved}` : resolved;
          }
          finalAssignment = assignment;
          finalSource = source;
        } catch (error) {
          this.errors.push(
            `Failed to resolve ${key}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (current === undefined) {
        delete this.env[key];
        delete this.metadata[key];
      } else if (finalAssignment && finalSource) {
        this.env[key] = current;
        this.metadata[key] = {
          value: current,
          source: finalSource,
          transforms: (finalAssignment.expression.pipes || []).map((p) => p.name),
          provider: finalAssignment.expression.provider
            ? this.getProviderName(finalAssignment.expression.provider)
            : undefined,
          protected: finalAssignment.options.protected || false,
        };
      }
    }
  }

  // Note: assignment lookup is handled via assignmentLog during resolution

  private async resolveExpression(expression: Expression, key: string): Promise<string> {
    let value: string;

    if (expression.trigger === "!") {
      if (!expression.provider) {
        throw new EvaluationError(
          "Expression marked for evaluation but no provider specified",
          key,
        );
      }
      value = await this.resolveProvider(expression.provider, key);
    } else {
      value = expression.literal || "";
    }

    value = await this.applyPipes(value, expression.pipes, key);

    if (!value && expression.fallback) {
      value = expression.fallback;
    }

    return value;
  }

  private async resolveProvider(ref: ProviderRef, key: string): Promise<string> {
    const provider = this.getProvider(ref);
    const ctx = this.createResolveContext();

    const policyContext = this.createPolicyContext();
    const providerEffect = await this.policy.onProvider?.(ref, policyContext);
    if (providerEffect?.effect === "deny") {
      throw new Error(`Policy denied provider access: ${providerEffect.reason}`);
    }
    if (providerEffect?.effect === "warn") {
      this.warnings.push(providerEffect.reason || `Policy warning for provider ${provider.name}`);
    }

    const start = Date.now();
    try {
      const result = await provider.resolveSingle(ref, ctx);

      this.audit.log({
        timestamp: new Date(),
        action: "provider_resolve",
        key,
        provider: provider.name,
        source: ref.kind === "uri" ? ref.uri : `${ref.fn}()`,
        success: true,
        duration: Date.now() - start,
      });

      return result;
    } catch (error) {
      this.audit.log({
        timestamp: new Date(),
        action: "provider_resolve",
        key,
        provider: provider.name,
        source: ref.kind === "uri" ? ref.uri : `${ref.fn}()`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - start,
      });
      throw error;
    }
  }

  private async applyPipes(value: string, pipes: PipeCall[], key: string): Promise<string> {
    let result = value;

    for (const pipeCall of pipes) {
      const pipe = this.pipes.get(pipeCall.name);
      if (!pipe) {
        if (!pipeCall.soft) {
          throw new EvaluationError(`Unknown pipe: ${pipeCall.name}`, key);
        }
        continue;
      }

      const policyContext = this.createPolicyContext();
      const pipeEffect = await this.policy.onPipe?.(pipeCall, policyContext);
      if (pipeEffect?.effect === "deny") {
        throw new Error(`Policy denied pipe: ${pipeEffect.reason}`);
      }
      if (pipeEffect?.effect === "warn") {
        this.warnings.push(pipeEffect.reason || `Policy warning for pipe ${pipeCall.name}`);
      }

      try {
        const output = await pipe.apply(result, pipeCall.args, {
          policy: this.policy,
          audit: this.audit,
        });
        result = typeof output === "string" ? output : new TextDecoder().decode(output);
      } catch (error) {
        if (!pipeCall.soft) {
          throw new EvaluationError(
            `Pipe ${pipeCall.name} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            key,
          );
        }
      }
    }

    return result;
  }

  private async applyInterpolations(): Promise<void> {
    const resolved: KV = {};

    for (const [key, value] of Object.entries(this.env)) {
      resolved[key] = await interpolate(value, this.env, Deno.env.toObject());
    }

    this.env = resolved;
  }

  private async checkPolicies(policyContext: PolicyContext): Promise<void> {
    for (const [key, meta] of Object.entries(this.metadata)) {
      const effect = await this.policy.onKeyInject?.(key, meta, policyContext);
      if (effect?.effect === "deny") {
        throw new Error(`Policy denied key injection: ${key} - ${effect.reason}`);
      }
      if (effect?.effect === "warn") {
        this.warnings.push(`Policy warning for key ${key}: ${effect.reason}`);
      }
    }
  }

  private mergeParentEnv(): void {
    const parentEnv = Deno.env.toObject();
    for (const [key, value] of Object.entries(parentEnv)) {
      if (!(key in this.env)) {
        this.env[key] = value;
      }
    }
  }

  private getProvider(ref: ProviderRef): Provider {
    const name = ref.kind === "uri" ? ref.scheme : ref.fn;
    const provider = this.providers.get(name);
    if (!provider) {
      throw new EvaluationError(`Unknown provider: ${name}`);
    }
    return provider;
  }

  private getProviderFromUri(uri: string): Provider {
    const scheme = uri.split("://")[0];
    const provider = this.providers.get(scheme);
    if (!provider) {
      throw new EvaluationError(`Unknown provider: ${scheme}`);
    }
    return provider;
  }

  private getProviderName(ref: ProviderRef): string {
    return ref.kind === "uri" ? ref.scheme : ref.fn;
  }

  private createResolveContext(): ResolveContext {
    return {
      cache: this.cache,
      policy: this.policy,
      audit: this.audit,
      timeout: 30000,
      retries: 3,
      env: { ...this.env, ...Deno.env.toObject() },
    };
  }

  private createPolicyContext(): PolicyContext {
    return {
      action: "run",
      profile: this.currentProfile,
      scopes: this.currentScopes,
      overlays: this.options.overlays || [],
      flags: this.options as Record<string, unknown>,
      isCI: !!Deno.env.get("CI"),
      env: Deno.env.toObject(),
    };
  }
}
