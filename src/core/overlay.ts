import { join, resolve } from "@std/path";
import { exists } from "@std/fs";
import { globToRegExp } from "@std/path/glob-to-regexp";
import type { CLIOptions, ParsedFile } from "./types.ts";
import { Parser } from "./parser.ts";

export class OverlayResolver {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async resolveFiles(options: CLIOptions): Promise<string[]> {
    const files: string[] = [];
    const baseFile = options.file || join(this.baseDir, ".secret");

    // 1. Base .secret file
    if (await exists(baseFile)) {
      files.push(baseFile);
    }

    // 2. .secret.local
    const localFile = join(this.baseDir, ".secret.local");
    if (await exists(localFile)) {
      files.push(localFile);
    }

    // 3. .secret.<profile>
    if (options.profile) {
      const profileFile = join(this.baseDir, `.secret.${options.profile}`);
      if (await exists(profileFile)) {
        files.push(profileFile);
      }

      // 4. .secret.<profile>.local
      const profileLocalFile = join(this.baseDir, `.secret.${options.profile}.local`);
      if (await exists(profileLocalFile)) {
        files.push(profileLocalFile);
      }
    }

    // 5. overlays/<name>.secret
    if (options.overlays && options.overlays.length > 0) {
      for (const overlay of options.overlays) {
        const overlayFile = join(this.baseDir, "overlays", `${overlay}.secret`);
        if (await exists(overlayFile)) {
          files.push(overlayFile);
        }
      }
    }

    return files;
  }

  async parseAllFiles(options: CLIOptions): Promise<ParsedFile[]> {
    const files = await this.resolveFiles(options);
    const parsedFiles: ParsedFile[] = [];
    const processedIncludes = new Set<string>();

    for (const file of files) {
      const parsed = await this.parseFileWithIncludes(file, processedIncludes);
      parsedFiles.push(...parsed);
    }

    return parsedFiles;
  }

  private async parseFileWithIncludes(
    filePath: string,
    processedIncludes: Set<string>,
    isIncluded: boolean = false,
  ): Promise<ParsedFile[]> {
    const absolutePath = resolve(filePath);
    if (processedIncludes.has(absolutePath)) {
      return [];
    }
    processedIncludes.add(absolutePath);

    const content = await Deno.readTextFile(absolutePath);
    const parser = new Parser(content, absolutePath);
    const parsed = parser.parse();

    // Expose included files with a non-.secret suffix to disambiguate base file counts
    const root: ParsedFile = isIncluded
      ? { path: `${absolutePath} (included)`, nodes: parsed.nodes }
      : parsed;
    const results: ParsedFile[] = [root];
    const includes: string[] = [];

    // Extract @include directives
    for (const node of parsed.nodes) {
      if (node.type === "directive" && node.data.type === "include") {
        includes.push(node.data.path);
      }
    }

    // Process includes
    for (const includePath of includes) {
      const resolvedPaths = await this.resolveIncludePath(includePath, absolutePath);
      for (const resolvedPath of resolvedPaths) {
        const includedFiles = await this.parseFileWithIncludes(resolvedPath, processedIncludes, true);
        results.push(...includedFiles);
      }
    }

    return results;
  }

  private async resolveIncludePath(includePath: string, fromFile: string): Promise<string[]> {
    const dir = resolve(fromFile, "..");
    const absoluteInclude = resolve(dir, includePath);

    // Check if it's a glob pattern
    if (includePath.includes("*")) {
      const files: string[] = [];
      const pattern = globToRegExp(absoluteInclude);
      
      // Get directory to search
      const searchDir = absoluteInclude.substring(0, absoluteInclude.lastIndexOf("/"));
      
      try {
        for await (const entry of Deno.readDir(searchDir)) {
          if (entry.isFile) {
            const fullPath = join(searchDir, entry.name);
            if (pattern.test(fullPath)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
      
      return files;
    }

    // Single file
    if (await exists(absoluteInclude)) {
      return [absoluteInclude];
    }

    return [];
  }

  detectConflicts(parsedFiles: ParsedFile[]): Map<string, string[]> {
    const keyValues = new Map<string, Map<string, string>>();
    const conflicts = new Map<string, string[]>();

    for (const file of parsedFiles) {
      for (const node of file.nodes) {
        if (node.type === "assignment") {
          const { key } = node.data;
          
          if (!keyValues.has(key)) {
            keyValues.set(key, new Map());
          }
          
          const values = keyValues.get(key)!;
          const valueStr = JSON.stringify(node.data.expression);
          values.set(file.path, valueStr);
        }
      }
    }

    // Check for conflicts (3+ layers with different values)
    for (const [key, values] of keyValues) {
      if (values.size >= 3) {
        const uniqueValues = new Set(values.values());
        if (uniqueValues.size > 1) {
          conflicts.set(key, Array.from(values.keys()));
        }
      }
    }

    return conflicts;
  }
}
