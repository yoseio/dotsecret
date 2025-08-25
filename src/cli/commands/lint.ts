import type { CLIOptions } from "../../core/types.ts";
import { OverlayResolver } from "../../core/overlay.ts";

interface LintIssue {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export async function lintCommand(args: any): Promise<void> {
  const options: CLIOptions = {
    file: args.file,
    profile: args.profile,
    scopes: args.scope || [],
    overlays: args.overlay || [],
    strict: args.strict,
  };

  const issues: LintIssue[] = [];

  // Resolve and parse files
  const resolver = new OverlayResolver(Deno.cwd());
  const parsedFiles = await resolver.parseAllFiles(options);

  console.log("Linting configuration files...\n");

  // Track used and defined keys
  const definedKeys = new Set<string>();
  const referencedKeys = new Set<string>();
  const keyLocations = new Map<string, { file: string; line: number }>();

  for (const file of parsedFiles) {
    console.log(`Checking ${file.path}...`);
    const content = await Deno.readTextFile(file.path);
    const lines = content.split("\n");

    for (const node of file.nodes) {
      if (node.type === "assignment") {
        const { key, expression } = node.data;
        const location = node.data.location;

        // Check key naming convention
        if (!key.match(/^[A-Z][A-Z0-9_]*$/)) {
          issues.push({
            file: file.path,
            line: location?.start.line || 1,
            column: location?.start.column || 1,
            severity: "warning",
            message: `Key "${key}" does not follow UPPER_SNAKE_CASE convention`,
          });
        }

        // Track defined keys
        definedKeys.add(key);
        keyLocations.set(key, {
          file: file.path,
          line: location?.start.line || 1,
        });

        // Check for empty values
        if (expression.literal === "" && !expression.provider && !expression.fallback) {
          issues.push({
            file: file.path,
            line: location?.start.line || 1,
            column: location?.start.column || 1,
            severity: "warning",
            message: `Key "${key}" has empty value`,
          });
        }

        // Extract referenced variables from interpolations
        const interpolationPattern = /\$\{([^}]+)\}/g;
        let match;
        while ((match = interpolationPattern.exec(JSON.stringify(expression))) !== null) {
          referencedKeys.add(match[1].trim());
        }
      }
    }

    // Check line-level issues
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      // Check for trailing whitespace
      if (line !== line.trimEnd()) {
        issues.push({
          file: file.path,
          line: lineNum,
          column: line.trimEnd().length + 1,
          severity: "info",
          message: "Trailing whitespace",
        });
      }

      // Check for tabs vs spaces
      if (line.includes("\t")) {
        issues.push({
          file: file.path,
          line: lineNum,
          column: line.indexOf("\t") + 1,
          severity: "info",
          message: "Tab character found (consider using spaces)",
        });
      }

      // Check for TODO/FIXME comments
      if (trimmed.startsWith("#")) {
        const comment = trimmed.slice(1).trim();
        if (comment.match(/^(TODO|FIXME|HACK|XXX):/)) {
          issues.push({
            file: file.path,
            line: lineNum,
            column: 1,
            severity: "info",
            message: `Found ${comment.split(":")[0]} comment`,
          });
        }
      }

      // Check for hardcoded secrets
      if (!trimmed.startsWith("#") && trimmed.includes("=")) {
        const value = trimmed.split("=", 2)[1]?.trim();
        if (value && !value.startsWith("!") && !value.startsWith('"!') && !value.startsWith("'!")) {
          // Check for potential hardcoded secrets
          const suspiciousPatterns = [
            /^[a-zA-Z0-9]{32,}$/,  // Long random strings
            /^(aws_|AKIA|ASIA)/,   // AWS keys
            /^sk_live_/,           // Stripe keys
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUIDs
          ];

          for (const pattern of suspiciousPatterns) {
            if (pattern.test(value)) {
              issues.push({
                file: file.path,
                line: lineNum,
                column: trimmed.indexOf(value) + 1,
                severity: "error",
                message: "Possible hardcoded secret detected",
              });
              break;
            }
          }
        }
      }
    });
  }

  // Check for unused keys
  for (const key of definedKeys) {
    if (!referencedKeys.has(key) && !key.match(/^(PATH|HOME|USER|SHELL)$/)) {
      const location = keyLocations.get(key);
      if (location) {
        issues.push({
          file: location.file,
          line: location.line,
          column: 1,
          severity: "info",
          message: `Key "${key}" is defined but never referenced`,
        });
      }
    }
  }

  // Sort issues by file and line
  issues.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  // Display results
  if (issues.length === 0) {
    console.log("\n✓ No issues found!");
  } else {
    console.log(`\nFound ${issues.length} issue(s):\n`);

    let currentFile = "";
    for (const issue of issues) {
      if (issue.file !== currentFile) {
        currentFile = issue.file;
        console.log(`\n${currentFile}:`);
      }

      const icon = issue.severity === "error" ? "✗" : issue.severity === "warning" ? "⚠" : "ℹ";
      console.log(`  ${issue.line}:${issue.column} ${icon} ${issue.message}`);
    }

    const errorCount = issues.filter(i => i.severity === "error").length;
    const warningCount = issues.filter(i => i.severity === "warning").length;

    console.log(`\nSummary: ${errorCount} error(s), ${warningCount} warning(s)`);

    if (errorCount > 0 || (options.strict && warningCount > 0)) {
      Deno.exit(1);
    }
  }
}