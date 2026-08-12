# Codegen Agent

A LangGraph-orchestrated CLI that reads a natural-language spec and generates
a React + TypeScript app into the `Fullstack-Coding-Challenge-main`
boilerplate.

## Setup

Requires Node.js 20 or newer.

    cd agent
    npm install
    cp .env.example .env   # fill in OPENROUTER_API_KEY

## Run

    npm run start -- --spec ./spec.txt --output ../generated-app

This copies the boilerplate into `../generated-app`, runs `npm install`
there, then runs the agent loop against it.

### CLI flags

| Flag | Required | Default | Meaning |
| --- | --- | --- | --- |
| `--spec <path>` | yes | — | Path to the natural-language specification file. |
| `--output <path>` | yes | — | Directory the generated app is written to. **Destructive and intentional: if the directory already exists it is deleted and recreated before the boilerplate is copied**, so leftovers from a previous run with a different spec can never be mixed into a new run or diverge from the agent's in-memory `filesWritten` state. |
| `--boilerplate <path>` | no | `../Fullstack-Coding-Challenge-main` | Source boilerplate to copy from. |

### Environment variables

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | — | OpenRouter credential. Validated at CLI startup, before the boilerplate copy and `npm install`, so a missing key fails in milliseconds rather than after a multi-minute install. |
| `PLANNER_MODEL` / `CODER_MODEL` / `REVIEWER_MODEL` / `FIXER_MODEL` | no | see "LLM provider" | Per-role model override. |
| `MAX_RETRY_CYCLES` | no | `3` | Maximum fixer cycles before the run finalizes as `retries_exhausted`. Non-numeric or negative values fall back to the default. |
| `MAX_COST_USD` | no | `2` | Soft budget in USD. Checked between graph nodes and before each task inside the coder loop; once reached, the run stops queuing further work and finalizes. |

## Architecture

    planner -> coder (loop per task, dependency order)
             -> validator (npm run typecheck && npm run test)
                  |- fail -> fixer -> coder   (retry, bounded by MAX_RETRY_CYCLES)
                  \- pass -> reviewer (LLM-judge vs. spec)
                                |- reject -> fixer -> coder   (retry)
                                \- approve -> finalize -> end

Every LLM node (planner, coder, reviewer, fixer) returns a Zod-schema-enforced
structured output (see `src/schemas.ts`) via `.withStructuredOutput(...,
{ includeRaw: true })`, so the pipeline never depends on free-text parsing.
`validator` is a deterministic tool node (no LLM call). The coder always
writes to the task's own `targetFile` (never a model-chosen path), and
resolves a task's dependencies against the full original plan — not just the
current retry batch — so a lone fix task can still see the file it depends on.
A task whose generation fails stays in `pendingTasks`, which routes the run
back to the fixer and blocks `outcome: "approved"`, so a run can never report
success with files it silently failed to write.

### Prompt files

Every prompt lives as a `.md` file under `src/prompts/` (`planner.md`,
`coder.md` plus its conditional sections in `coder/`, `reviewer.md`,
`fixer.md`, and the shared `guidance/style.md` / `guidance/testing.md`), not as
a template literal in a node. Nodes load a template once (cached in memory) and
fill `{{placeholder}}` slots via `renderTemplate`, so prompt wording can be
reviewed and edited without touching TypeScript. The files are read relative to
`import.meta.url`, which works under both `tsx` (`npm run start`) and Vitest
since both run from source; a future compile-to-`dist` step would have to copy
`src/prompts/**/*.md` alongside the JS.

### Prompt size limits

All prompt-truncation thresholds live in `src/promptLimits.ts` rather than as
magic numbers at each call site. The reasoning behind each:

- `dependencyFileChars` (2000) — a declared dependency is included so the coder
  matches its exports/props; the head and tail of the file carry the signatures.
- `implementationFileChars` (1500) — every non-test generated file is inlined on
  every coder call, so the per-file budget is the tightest one.
- `implementationSourcesChars` (20000) — overall ceiling for that whole section,
  so a large app cannot crowd out the task instructions.
- `referenceFilesChars` (3000) — the boilerplate reference files (Car type,
  queries, mocks) are small and stable; 3000 covers them without truncation.
- `existingFileChars` (2000) — enough of the file being modified for the model
  to preserve unrelated parts.
- `lastFailureChars` (2000) — the tail of a validation failure holds the actual
  error; more than this is usually repeated stack noise.
- `reviewerFileChars` (3000) / `fixerFileChars` (2000) — the reviewer judges
  whole-file behaviour so it gets more per file; the fixer is pointed at a
  specific failure and needs less.
- `generatedFilesChars` (20000) — shared ceiling for the reviewer's and fixer's
  "all generated files" block.
- `failureDetailChars` (3000) — validation output plus any coder failures.
- `rootCauseChars` (300) — the root cause is only echoed into the history log.
- `defaultTruncateChars` (6000) — fallback for any `truncateText` call with no
  explicit limit.
- `validationOutputMaxLines` (80) — `summarizeValidationOutput` keeps only lines
  matching known error signals; 80 covers a realistic failing test run without
  pasting an entire Vitest report into the prompt.

## LLM provider

All model calls go through OpenRouter (`@langchain/openrouter`) with a single
`OPENROUTER_API_KEY`. Each role can be pinned to a different model via
`PLANNER_MODEL` / `CODER_MODEL` / `REVIEWER_MODEL` / `FIXER_MODEL` — by
default a stronger model handles planning/review and a cheaper model handles
the higher-frequency coder/fixer calls. Models are pinned (not left to
OpenRouter's automatic model fallback) so `withStructuredOutput` can reliably
use native JSON Schema mode; resilience against a single provider outage
instead comes from `maxRetries` on the client and `provider.allow_fallbacks`.

## Cost control

- Per-node `usage.cost` from every OpenRouter response is logged into the
  run's `history` and summed at the end (`agent/src/tools/costTracker.ts`).
- `provider.sort: "price"` + `allow_fallbacks: true` on every request.
- Every prompt that inlines file contents or raw tool output is truncated
  (`agent/src/tools/truncate.ts`) to bound context size and avoid
  `context_length_exceeded` failures on larger generated apps.
- The retry loop is bounded (`MAX_RETRY_CYCLES`, default 3) plus a
  `recursionLimit` backstop on `graph.invoke()` — the agent cannot spend
  unboundedly on a single run.
- `MAX_COST_USD` (default 2) is checked both between graph nodes and at the
  top of each iteration of the coder's per-task loop, so a large plan cannot
  blow past the budget inside a single node invocation.
- The graph is checkpointed (`MemorySaver`) so it keeps its state across node
  transitions *within one process* — for example across fixer/coder cycles.
  `MemorySaver` lives in process memory only, and there is no `--resume` flag,
  so a run whose process dies cannot be resumed: re-running always starts from
  scratch against a freshly recreated `--output` directory.
- Recommended: create the OpenRouter API key with a spend `limit` as an
  account-level backstop independent of this code.

## Cost per run

The tracking mechanism was verified against a real OpenRouter call before
relying on it — the per-response cost is read from
`response_metadata.tokenUsage.cost` (see `agent/src/tools/costTracker.ts`).

Real end-to-end runs against `spec.txt` and 5 reworded/reduced/extended
variants (models: `anthropic/claude-sonnet-4.5` for planner/reviewer/fixer,
`anthropic/claude-haiku-4.5` for coder):

| Run | Outcome | Retry cycles | Cost |
| --- | --- | --- | --- |
| spec.txt (baseline) | `approved` | 3 | $0.3940 |
| spec-1 (baseline, generalization test) | `approved` | 3 | $0.3940 |
| spec-2 (reworded) | `retries_exhausted`, rolled back to a passing state (27/27 tests) | 3 | $0.3234 |
| spec-3 (minimal) | `approved` | 3 | $0.1997 |
| spec-4 (extras: GetCar, combined filters, useCarFilters) | `retries_exhausted`, residual test failures | 3 | $0.4887 |
| spec-5 (reordered) | `retries_exhausted`, rolled back to a passing state (25/25 tests) | 3 | $0.2904 |

A typical run costs **$0.20–$0.50**, scaling with how much the spec asks for
(the reduced spec-3 was the cheapest; the extras-heavy spec-4 the most
expensive). 4 of 6 runs above ended with fully working, verified code on
disk — either `approved` directly or recovered via the last-known-good
rollback in `finalize` — even when the run itself didn't self-certify as
`approved`.

## Known limitations / accepted tradeoffs

- The coder processes every pending task within a single node invocation
  (a plain loop) rather than one graph-node visit per task. This keeps the
  graph shape simple and matches the time budget for this challenge; the
  tradeoff is that a failure on the last of N tasks re-runs (and repays for)
  the coder's LLM calls for the earlier N-1 tasks in that same node
  invocation, since the checkpoint boundary is the whole node, not each task.
- The filesystem sandbox (`tools/fs.ts`) rejects `..`/absolute-path escapes,
  resolves the ancestor chain through `realpath` and refuses a target that is
  itself a symlink, and denies protected filenames as well as any path
  segment named `node_modules`, `.git`, `.github`, `dist`, or `.vite`. It
  does not attempt to defend against a concurrent attacker swapping a
  directory for a symlink between the check and the write (TOCTOU), which is
  acceptable because the output directory is created by this CLI itself.
- OpenRouter's `models: [...]` fallback-across-models feature is
  intentionally not used (see "LLM provider" above) — a single pinned
  model's outage requires the operator to retry the whole CLI run rather
  than the graph auto-switching models mid-run.

## What worked well

- **Structured output end-to-end.** Every LLM node returns a Zod-validated
  object; the pipeline never parses free text out of a model response, and
  the `rootCause` field on the fixer's schema (generated *before* `tasks`,
  so the model reasons about the failure before proposing a fix) measurably
  improved the quality of fix cycles over letting the model jump straight
  to a solution.
- **The finalize rollback.** Snapshotting `filesWritten` the moment
  validation passes, and restoring that snapshot if a later fix/review
  cycle makes things worse, turned several `retries_exhausted` runs into
  fully working output on disk instead of a broken final state — 2 of the
  6 runs in the cost table above ended this way.
- **Giving the coder real source instead of rules.** Two separate bugs
  (a component inventing a sibling's prop names, a test inventing a
  function's signature) were root-caused to the coder simply not having the
  real file content in context — not to a missing prompt rule. Once
  `collectImplementationSources` stopped truncating mid-file, both
  categories of failure stopped recurring, which was a stronger fix than
  adding more prompt guidance would have been.
- **Testing the same spec 5 different ways.** Rewording, shrinking,
  extending, and reordering the same underlying spec caught real bugs that
  a single fixed spec never would have — the agent's plan and output
  changed sensibly with each variant rather than reproducing the same
  fixed structure regardless of what was asked.

## What I'd improve with more time

- A durable checkpointer (SQLite/Postgres) plus a `--resume <thread-id>` flag,
  so a run whose process dies could pick up where it left off instead of
  regenerating already-approved files. Today's `MemorySaver` cannot do this.
- Prompt caching (`cache_control: ephemeral`) on the large repeated spec /
  reference-file context, once a real run's token profile is measured.
- Restructure the coder into a per-task graph loop (see limitation above) so
  checkpointing and retries are granular to a single file, not a whole batch.
- A second reviewer pass focused specifically on the responsive-image
  breakpoint logic, since it's the most visually-verifiable requirement and
  hardest for a text-only LLM judge to assess reliably.
