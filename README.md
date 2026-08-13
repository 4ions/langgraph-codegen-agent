# LangGraph Codegen Agent

An agentic workflow that reads a natural-language spec and autonomously
generates a working React + TypeScript application: plans the work,
generates code file by file, self-validates (typecheck + tests + an
LLM-judge review), and iterates on failures — built for the "Agentic Code
Generation Workflow" take-home challenge.

## Where things are

- **[`agent/`](agent/)** — the actual deliverable: the LangGraph-orchestrated
  CLI. Start with [`agent/README.md`](agent/README.md) for setup,
  architecture, the LLM/cost write-up, and what was learned building it.
- **[`generated-app/`](generated-app/)** — sample output: a Car Inventory
  Manager generated end-to-end by the agent from `agent/spec.txt`, runnable
  with `npm install && npm run dev`.

## How it works

A LangGraph state machine with a bounded retry loop:

    planner -> coder (loop per task, dependency order)
             -> validator (npm run typecheck && npm run test)
                  |- fail -> fixer -> coder   (retry, bounded by MAX_RETRY_CYCLES / MAX_COST_USD)
                  \- pass -> reviewer (LLM-judge vs. spec)
                                |- reject -> fixer -> coder   (retry)
                                \- approve -> finalize -> end

- **planner** breaks the spec into dependency-ordered tasks (not one giant
  prompt).
- **coder** writes one task's file at a time, always to that task's own
  target path, with the real source of every already-generated file it
  depends on in context (not just what it's told — what actually exists).
- **validator** is deterministic, no LLM call: it just runs typecheck and
  the test suite against the generated project.
- **reviewer** is an LLM-judge that checks the generated files against the
  original spec.
- **fixer** diagnoses the root cause of a validation/review failure first
  (a required field on its structured output, generated before it proposes
  any fix) and queues the tasks needed to resolve it.
- **finalize** decides `approved` vs `retries_exhausted` — and if the run
  never fully passed, it restores the last snapshot that *did* pass
  validation instead of leaving whatever the final, possibly-broken attempt
  produced.

Every LLM node returns a Zod-validated structured output — the pipeline
never parses free text out of a model response. Full detail, the LLM/cost
write-up, and known limitations live in
[`agent/README.md`](agent/README.md).

## Quick start

    cd agent
    npm install
    cp .env.example .env   # fill in OPENROUTER_API_KEY
    npm run start -- --spec ./spec.txt --output ../generated-app-2
