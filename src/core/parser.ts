import type {
  ASTNode,
  Assignment,
  AssignmentOperator,
  AssignmentOptions,
  Directive,
  Expression,
  ParsedFile,
  PipeCall,
  ProviderRef,
  Section,
  SourceLocation,
} from "./types.ts";

export class ParseError extends Error {
  constructor(message: string, public location?: SourceLocation) {
    super(message);
    this.name = "ParseError";
  }
}

export class Parser {
  private lines: string[];
  private currentLine = 0;
  private currentFile: string;

  constructor(content: string, file: string) {
    this.lines = content.split("\n");
    this.currentFile = file;
  }

  parse(): ParsedFile {
    const nodes: ASTNode[] = [];

    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.startsWith("#")) {
          nodes.push({
            type: "comment",
            text: trimmed.slice(1).trim(),
            location: this.getLineLocation(),
          });
        }
        this.currentLine++;
        continue;
      }

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        const section = this.parseSection(trimmed);
        nodes.push({ type: "section", data: section });
        this.currentLine++;
        continue;
      }

      if (trimmed.startsWith("@")) {
        const directive = this.parseDirective();
        nodes.push({ type: "directive", data: directive });
        continue;
      }

      if (trimmed.startsWith("with ")) {
        const withDirective = this.parseWithDirective();
        nodes.push({ type: "directive", data: withDirective });
        continue;
      }

      const assignment = this.parseAssignment(line);
      if (assignment) {
        nodes.push({ type: "assignment", data: assignment });
      }

      this.currentLine++;
    }

    return { path: this.currentFile, nodes };
  }

  private parseSection(line: string): Section {
    const content = line.slice(1, -1).trim();
    const parts = content.split(/\s+/);

    if (parts[0].includes(":")) {
      const [type, name] = parts[0].split(":");
      if (type !== "scope") {
        throw new ParseError(`Invalid section type: ${type}`, this.getLineLocation());
      }

      const extendsIdx = parts.indexOf("extends");
      const extends_ = extendsIdx !== -1 ? parts.slice(extendsIdx + 1) : undefined;

      return {
        type: "scope",
        name,
        extends: extends_,
        location: this.getLineLocation(),
      };
    }

    return {
      type: "profile",
      name: parts[0],
      location: this.getLineLocation(),
    };
  }

  private parseDirective(): Directive {
    const line = this.lines[this.currentLine].trim();

    if (line.startsWith("@include ")) {
      const path = line.slice(9).trim();
      this.currentLine++;
      return {
        type: "include",
        path: this.unquote(path),
        location: this.getLineLocation(),
      };
    }

    if (line.startsWith("@import ")) {
      const parts = line.slice(8).trim().split(/\s+/);
      const uri = parts[0];
      const options: Record<string, string> = {};

      for (let i = 1; i < parts.length; i++) {
        const [key, value] = parts[i].split("=");
        if (key && value) {
          options[key] = this.unquote(value);
        }
      }

      this.currentLine++;
      return {
        type: "import",
        uri,
        prefix: options.prefix,
        case: options.case as "upper" | "lower" | "keep" | undefined,
        location: this.getLineLocation(),
      };
    }

    if (line.startsWith("@from ")) {
      return this.parseFromDirective();
    }

    if (line.startsWith("@if ")) {
      return this.parseIfDirective();
    }

    throw new ParseError(`Unknown directive: ${line}`, this.getLineLocation());
  }

  private parseFromDirective(): Directive {
    const line = this.lines[this.currentLine].trim();
    const match = line.match(/@from\s+(\S+)\s*{/);
    if (!match) {
      throw new ParseError("Invalid @from syntax", this.getLineLocation());
    }

    const baseUri = match[1];
    const mappings: Record<string, string> = {};
    this.currentLine++;

    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine].trim();
      if (line === "}") {
        this.currentLine++;
        break;
      }

      if (line && !line.startsWith("#")) {
        const [key, value] = line.split("=").map((s) => s.trim());
        if (key && value) {
          mappings[key] = this.unquote(value);
        }
      }
      this.currentLine++;
    }

    return {
      type: "from",
      baseUri,
      mappings,
      location: this.getLineLocation(),
    };
  }

  private parseIfDirective(): Directive {
    const line = this.lines[this.currentLine].trim();
    const match = line.match(/@if\s+(.+?)\s*{/);
    if (!match) {
      throw new ParseError("Invalid @if syntax", this.getLineLocation());
    }

    const condition = match[1];
    const body: ASTNode[] = [];
    this.currentLine++;

    const tempParser = new Parser("", this.currentFile);
    tempParser.lines = this.lines;
    tempParser.currentLine = this.currentLine;

    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine].trim();
      if (line === "}") {
        this.currentLine++;
        break;
      }

      const node = tempParser.parseSingleNode();
      if (node) {
        body.push(node);
      }
    }

    return {
      type: "if",
      condition,
      body,
      location: this.getLineLocation(),
    };
  }

  private parseWithDirective(): Directive {
    const line = this.lines[this.currentLine].trim();
    const match = line.match(/with\s+(\w+)\s*\(([^)]*)\)\s*{/);
    if (!match) {
      throw new ParseError("Invalid with syntax", this.getLineLocation());
    }

    const provider = match[1];
    const args = this.parseArgs(match[2]);
    const body: ASTNode[] = [];
    this.currentLine++;

    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine].trim();
      if (line === "}") {
        this.currentLine++;
        break;
      }

      const node = this.parseSingleNode();
      if (node) {
        body.push(node);
      } else {
        this.currentLine++;
      }
    }

    return {
      type: "with",
      provider,
      args,
      body,
      location: this.getLineLocation(),
    };
  }

  private parseSingleNode(): ASTNode | null {
    const line = this.lines[this.currentLine];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      this.currentLine++;
      return trimmed.startsWith("#")
        ? {
          type: "comment",
          text: trimmed.slice(1).trim(),
          location: this.getLineLocation(),
        }
        : null;
    }

    if (trimmed.startsWith("@")) {
      return { type: "directive", data: this.parseDirective() };
    }

    const assignment = this.parseAssignment(line);
    if (assignment) {
      this.currentLine++;
      return { type: "assignment", data: assignment };
    }

    this.currentLine++;
    return null;
  }

  private parseAssignment(line: string): Assignment | null {
    const protectedMatch = line.match(/^(\s*)!protected\s+(.+)$/);
    const isProtected = !!protectedMatch;
    const content = isProtected ? protectedMatch![2] : line;

    const operatorMatch = content.match(/^([A-Z_][A-Z0-9_]*)\s*(=\s*@unset|[?+]?=)(.*)$/);
    if (!operatorMatch) {
      return null;
    }

    const key = operatorMatch[1];
    const operatorStr = operatorMatch[2].trim();
    const valueStr = operatorMatch[3].trim();

    let operator: AssignmentOperator;
    if (operatorStr === "@unset" || operatorStr === "= @unset" || operatorStr.includes("@unset")) {
      operator = "@unset";
    } else {
      operator = operatorStr as AssignmentOperator;
    }

    const options: AssignmentOptions = { protected: isProtected };

    if (operator === "+=") {
      const sepMatch = valueStr.match(/^\(["'](.+)["']\)/);
      if (sepMatch) {
        options.separator = sepMatch[1];
      }
    }

    const expression = operator === "@unset"
      ? { trigger: "" as const, literal: "", pipes: [] }
      : this.parseExpression(valueStr);

    return {
      key,
      operator,
      expression,
      options,
      location: this.getLineLocation(),
    };
  }

  private parseExpression(value: string): Expression {
    value = value.trim();

    const parts = value.split(/\s*\|\|\s*/);
    const mainPart = parts[0];
    const fallback = parts.length > 1 ? this.unquote(parts[1]) : undefined;

    const pipeParts = this.splitPipes(mainPart);
    const firstPart = pipeParts[0];

    const isEvaluated = firstPart.startsWith("!");
    const content = isEvaluated ? firstPart.slice(1) : firstPart;

    let provider: ProviderRef | undefined;
    let literal: string | undefined;

    if (isEvaluated) {
      provider = this.parseProvider(content);
    } else {
      literal = this.unquote(content);
    }

    const pipes: PipeCall[] = [];
    for (let i = 1; i < pipeParts.length; i++) {
      const pipe = this.parsePipe(pipeParts[i]);
      if (pipe) pipes.push(pipe);
    }

    return {
      trigger: isEvaluated ? "!" : "",
      provider,
      literal,
      pipes,
      fallback,
    };
  }

  private splitPipes(value: string): string[] {
    const parts: string[] = [];
    let current = "";
    let depth = 0;
    let inQuote = false;
    let quoteChar = "";

    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      const next = value[i + 1];

      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar && value[i - 1] !== "\\") {
        inQuote = false;
      }

      if (!inQuote) {
        if (char === "(") depth++;
        if (char === ")") depth--;
        
        // Handle soft pipe ?|
        if (char === "?" && next === "|" && depth === 0) {
          parts.push(current.trim());
          current = "?";
          i++; // Skip the |
          continue;
        }
        
        if (char === "|" && depth === 0 && next !== "|") {
          parts.push(current.trim());
          current = "";
          continue;
        }
      }

      current += char;
    }

    if (current) {
      parts.push(current.trim());
    }

    return parts;
  }

  private parseProvider(content: string): ProviderRef {
    if (content.includes("://")) {
      const [scheme] = content.split("://", 2);
      return { kind: "uri", scheme, uri: content };
    }

    const match = content.match(/^(\w+)\s*\(([^)]*)\)$/);
    if (match) {
      const fn = match[1];
      const args = this.parseArgs(match[2]);
      return { kind: "call", fn, args };
    }

    throw new ParseError(`Invalid provider syntax: ${content}`, this.getLineLocation());
  }

  private parsePipe(content: string): PipeCall | null {
    const soft = content.startsWith("?");
    const pipeContent = soft ? content.slice(1).trim() : content.trim();

    const match = pipeContent.match(/^(\w+)(?:\s*\(([^)]*)\))?$/);
    if (!match) return null;

    const name = match[1];
    const args = match[2] ? this.parseArgs(match[2]) : {};

    return { name, args, soft };
  }

  private parseArgs(argsStr: string): Record<string, string> {
    const args: Record<string, string> = {};
    if (!argsStr) return args;

    const parts = this.splitArgs(argsStr);
    for (const part of parts) {
      const [key, ...valueParts] = part.split("=");
      if (key && valueParts.length > 0) {
        args[key.trim()] = this.unquote(valueParts.join("=").trim());
      } else {
        args["value"] = this.unquote(part.trim());
      }
    }

    return args;
  }

  private splitArgs(argsStr: string): string[] {
    const args: string[] = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar && argsStr[i - 1] !== "\\") {
        inQuote = false;
      }

      if (!inQuote && char === ",") {
        args.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current) {
      args.push(current.trim());
    }

    return args;
  }

  private unquote(value: string): string {
    value = value.trim();

    if (value.startsWith('"""') && value.endsWith('"""')) {
      return value.slice(3, -3);
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).replace(/\\(.)/g, "$1");
    }

    return value.replace(/\\(.)/g, "$1");
  }

  private getLineLocation(): SourceLocation {
    return {
      file: this.currentFile,
      start: { line: this.currentLine + 1, column: 1 },
      end: { line: this.currentLine + 1, column: this.lines[this.currentLine]?.length || 1 },
    };
  }
}