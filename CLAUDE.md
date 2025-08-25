# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

dotsecret is a secure environment variable launcher written in Deno/TypeScript that evaluates `.secret` files to inject secrets from external providers (GCP Secret Manager, 1Password, etc.) into subprocess environments.

## Development Commands

```bash
# Run in development mode with hot reload
deno task dev

# Run all tests
deno task test

# Run a specific test file
deno test --allow-all src/test/parser.test.ts

# Build the binary executable
deno task build

# Lint all code
deno task lint

# Format all code
deno task fmt

# Type check all TypeScript files
deno task check
```

## Architecture

The codebase is organized into two main areas:

### CLI Layer (`src/cli/`)

- `main.ts`: Entry point and command router
- `commands/`: Individual command implementations (run, render, verify, explain, doctor, etc.)

### Core Layer (`src/core/`)

- `parser.ts`: Parses `.secret` files into AST nodes
- `evaluator.ts`: Evaluates AST expressions, resolves providers, and applies transformations
- `interpolate.ts`: Handles string interpolation and expression evaluation
- `overlay.ts`: Manages configuration layering with conflict detection
- `policy.ts`: Enforces security policies via TypeScript hooks or JSON rules
- `providers/`: Provider implementations (GCP, 1Password, env, file)
- `pipes/`: Transformation functions (trim, base64, json, etc.)
- `security/mask.ts`: Output masking for sensitive values
- `cache/`: Caching layer with memory and disk implementations
- `audit.ts`: Audit logging for secret access

## Key Design Patterns

1. **AST-based parsing**: The parser creates an Abstract Syntax Tree that preserves source locations for better error reporting

2. **Provider abstraction**: All secret providers implement a common interface with URI and function call syntax support

3. **Pipe transformations**: Values can be transformed through a pipeline using the `|` operator with soft pipes (`?|`) for error tolerance

4. **Policy hooks**: Security policies can be implemented as TypeScript functions or declarative JSON rules

5. **Overlay system**: Configurations are layered with profiles and scopes, with automatic conflict detection

## Testing Approach

- Tests use Deno's built-in test runner with `@std/assert`
- Test files are colocated in `src/test/` and named `*.test.ts`
- Tests require `--allow-all` permissions due to file system and environment access
- Mock providers and policies are used for isolated testing

## Security Considerations

- All provider implementations should never log or store secrets in plaintext
- The masking system is enabled by default and should remain so
- Policy hooks run before any secret access to enforce security rules
- Cache implementations must encrypt data at rest
