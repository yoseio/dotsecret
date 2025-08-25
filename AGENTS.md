# Repository Guidelines

## Project Structure & Modules

- `src/cli/`: CLI entry (`main.ts`) and subcommands in `commands/` (e.g., `run.ts`, `render.ts`).
- `src/core/`: Core engine (parser, evaluator, policy, providers, pipes, security).
- `src/test/`: Deno tests (`*.test.ts`) for parser, pipes, providers, etc.
- `examples/`: Sample `.secret` files and usage patterns.
- `deno.json`: Tasks, lint/format config, and TS compiler options.
- `dotsecret`: Built binary output from `deno task build` (ignored in git).

## Build, Test, and Development

- `deno task dev`: Run CLI in watch mode with all permissions.
- `deno task test`: Execute the full test suite.
- `deno task build`: Compile the CLI to `./dotsecret`.
- `deno task lint`: Lint with Deno’s recommended rules.
- `deno task fmt`: Format source per project settings.
- `deno task check`: Type-check all `src/**/*.ts`.
  Examples:
- Run locally: `deno run --allow-all src/cli/main.ts render --format json`
- Build and use: `deno task build && ./dotsecret verify --strict`

## Coding Style & Naming

- TypeScript strict mode; no `any`, no unused vars/params, explicit returns.
- Formatting via `deno fmt` (2 spaces, width 100, double quotes).
- Linting via Deno “recommended” rules; fix or justify warnings.
- File names: lowercase (`parser.ts`, `policy.ts`); CLI commands in `src/cli/commands/<name>.ts`.
- Prefer small, focused modules; keep CLI glue in `src/cli/`, logic in `src/core/`.

## Testing Guidelines

- Framework: Deno test (`Deno.test(...)`). Place tests in `src/test/` as `name.test.ts`.
- Write unit tests for parser, pipes, providers, and edge cases.
- Run locally with `deno task test`. For coverage, you may use `deno test --coverage=coverage`.

## Commit & Pull Requests

- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `style:`, `chore:` (see git history).
- PRs must include: concise summary, rationale, before/after notes for CLI output changes, and tests when applicable.
- Link related issues; keep changes minimal and focused. Run `lint`, `fmt`, and `test` before opening.

## Security & Configuration Tips

- Never commit secrets; use `.secret` files and external providers.
- Prefer `--pure` and masking (`--mask=on`) for demos and logs; enable audits with `--audit=json` when needed.
- Grant providers least privilege; document any required environment variables in README or examples.
