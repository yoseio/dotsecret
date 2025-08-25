export type KV = Record<string, string>;

export type EvaluationTrigger = "!" | "";

export interface Position {
  line: number;
  column: number;
}

export interface SourceLocation {
  file: string;
  start: Position;
  end: Position;
}

export type AssignmentOperator = "=" | "?=" | "+=" | "@unset";

export interface AssignmentOptions {
  protected?: boolean;
  separator?: string;
}

export type ProviderRef =
  | { kind: "uri"; scheme: string; uri: string }
  | { kind: "call"; fn: string; args: Record<string, string> };

export interface PipeCall {
  name: string;
  args: Record<string, string>;
  soft?: boolean;
}

export interface Expression {
  trigger: EvaluationTrigger;
  provider?: ProviderRef;
  literal?: string;
  pipes: PipeCall[];
  fallback?: string;
  location?: SourceLocation;
}

export interface Assignment {
  key: string;
  operator: AssignmentOperator;
  expression: Expression;
  options: AssignmentOptions;
  location?: SourceLocation;
}

export interface DirectiveInclude {
  type: "include";
  path: string;
  location?: SourceLocation;
}

export interface DirectiveImport {
  type: "import";
  uri: string;
  prefix?: string;
  case?: "upper" | "lower" | "keep";
  location?: SourceLocation;
}

export interface DirectiveFrom {
  type: "from";
  baseUri: string;
  mappings: Record<string, string>;
  location?: SourceLocation;
}

export interface DirectiveIf {
  type: "if";
  condition: string;
  body: ASTNode[];
  location?: SourceLocation;
}

export interface DirectiveWith {
  type: "with";
  provider: string;
  args: Record<string, string>;
  body: ASTNode[];
  location?: SourceLocation;
}

export type Directive =
  | DirectiveInclude
  | DirectiveImport
  | DirectiveFrom
  | DirectiveIf
  | DirectiveWith;

export interface Section {
  type: "profile" | "scope";
  name: string;
  extends?: string[];
  location?: SourceLocation;
}

export type ASTNode =
  | { type: "assignment"; data: Assignment }
  | { type: "directive"; data: Directive }
  | { type: "section"; data: Section }
  | { type: "comment"; text: string; location?: SourceLocation };

export interface ParsedFile {
  path: string;
  nodes: ASTNode[];
}

export interface Provider {
  name: string;
  resolveSingle(ref: ProviderRef, ctx: ResolveContext): Promise<string>;
  resolveBatch?(query: BatchQuery, ctx: ResolveContext): Promise<KV>;
}

export interface BatchQuery {
  baseUri: string;
  prefix?: string;
  filter?: Record<string, string>;
}

export interface ResolveContext {
  cache: Cache;
  policy: Policy;
  audit: AuditLogger;
  timeout: number;
  retries: number;
  env: KV;
}

export interface Pipe {
  name: string;
  apply(
    input: Uint8Array | string,
    args: Record<string, string>,
    ctx: PipeContext,
  ): Promise<Uint8Array | string>;
  pure?: boolean;
}

export interface PipeContext {
  policy: Policy;
  audit: AuditLogger;
}

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PolicyEffect {
  effect: "allow" | "deny" | "warn";
  reason?: string;
}

export interface PolicyContext {
  action: "run" | "render" | "verify" | "explain" | "shell";
  profile?: string;
  scopes: string[];
  overlays: string[];
  flags: Record<string, unknown>;
  isCI: boolean;
  env: KV;
}

export interface Policy {
  onStart?(ctx: PolicyContext): PolicyEffect | Promise<PolicyEffect>;
  onProvider?(ref: ProviderRef, ctx: PolicyContext): PolicyEffect | Promise<PolicyEffect>;
  onPipe?(call: PipeCall, ctx: PolicyContext): PolicyEffect | Promise<PolicyEffect>;
  onKeyInject?(
    key: string,
    meta: KeyMetadata,
    ctx: PolicyContext,
  ): PolicyEffect | Promise<PolicyEffect>;
  onFinish?(ctx: PolicyContext): PolicyEffect | Promise<PolicyEffect>;
}

export interface KeyMetadata {
  value: string;
  source: string;
  transforms: string[];
  provider?: string;
  protected: boolean;
}

export interface AuditLogger {
  log(event: AuditEvent): void;
  flush(): Promise<void>;
}

export interface AuditEvent {
  timestamp: Date;
  action: string;
  key?: string;
  provider?: string;
  source?: string;
  success: boolean;
  error?: string;
  duration?: number;
}

export interface EvaluationResult {
  env: KV;
  metadata: Record<string, KeyMetadata>;
  warnings: string[];
  errors: string[];
}

export interface CLIOptions {
  file?: string;
  profile?: string;
  scopes?: string[];
  overlays?: string[];
  pure?: boolean;
  mask?: "on" | "off" | "partial";
  strict?: boolean;
  cache?: "off" | "mem" | "disk";
  ttl?: string;
  audit?: "json" | "stderr" | "off";
  policy?: string;
  force?: boolean;
  noAutoScope?: boolean;
}

export interface RenderOptions extends CLIOptions {
  format?: "env" | "json" | "shell" | "k8s" | "compose";
}

export interface VerifyOptions extends CLIOptions {
  drift?: boolean;
}

export interface SchemaDefinition {
  required?: string[];
  properties?: Record<string, {
    type?: string;
    pattern?: string;
    enum?: string[];
    format?: string;
    description?: string;
  }>;
}