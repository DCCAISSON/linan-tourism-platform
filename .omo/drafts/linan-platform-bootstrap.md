---
slug: linan-platform-bootstrap
status: approved
intent: clear
pending-action: execute .omo/plans/linan-platform-bootstrap.md after repository preparation
approach: Build a protected TypeScript monorepo around one vertical enrollment-to-roster flow, while filing and platform accounts proceed independently.
---

# Draft: linan-platform-bootstrap

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id | outcome | status | evidence path |
| --- | --- | --- | --- |
| repository | source, secrets, data and history are protected | active | `docs/DEVELOPMENT_PROTECTION.md` |
| platform-api | one modular API owns business state and payments | active | `docs/ARCHITECTURE.md` |
| miniapp | parents complete multi-participant enrollment | active | `apps/miniapp/README.md` |
| admin | staff configure trips and reconcile rosters | active | `apps/admin/README.md` |
| filing-integration | official accounts replace local adapters without redesign | active | `docs/TOMORROW_HANDOFF_CHECKLIST.md` |
| controlled-trial | one full trip is rehearsed before wider release | active | `docs/PROJECT_PLAN.md` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| repository boundary | code gets a separate `linan-platform` repository | avoids committing contracts and customer material | yes |
| stack | Vue 3 across miniapp/admin, NestJS API, MySQL 8 | fastest shared TypeScript path with mature OSS | yes, before product code |
| delivery architecture | modular monolith | shortest integration path for October milestones | yes, modules can split later |
| testing | TDD for money, state and permissions; tests-after for CRUD/UI | protects irreversible business errors without over-testing scaffolding | yes |
| UI direction | trustworthy nature-led service interface, not a clone | fits domain and avoids proprietary asset copying | yes, tokens can change tomorrow |
| local storage | keep source on C, move caches/Docker/dev data to E | C has under 8GB free; E has over 600GB | yes |

## Findings (cited - path:lines)

- No existing source repository was present; the material workspace contained 65 files and about 375.89MB before this repository was created.
- Local environment: Node 22.17.0, npm 10.9.2, Git 2.43.0, Docker installed but engine stopped, pnpm absent.
- Disk evidence: `docs/STORAGE_PLAN.md:5`; C has about 7.97GB free, E about 672.58GB.
- Contract-driven milestones and daily schedule: `docs/PROJECT_PLAN.md:5` and `docs/PROJECT_PLAN.md:49`.
- Architecture and invariants: `docs/ARCHITECTURE.md:17` and `docs/ARCHITECTURE.md:42`.
- OSS and proprietary UI findings: `docs/OPEN_SOURCE_EVALUATION.md:5` and `docs/OPEN_SOURCE_EVALUATION.md:24`.

## Decisions (with rationale)

- Use a dedicated source repository with pre-commit blocking for secrets, customer data and large files.
- Use a single vertical enrollment-to-roster slice before expanding secondary modules.
- Reuse permissively licensed frameworks and thin templates at pinned versions; do not transplant a whole tourism system.
- Treat 6renyou as an information-architecture reference only.
- Do not install dependencies until local disk capacity is corrected.

## Scope IN

- Git repository initialization, local safeguards, file/sync policy, storage plan, design system, OSS ledger and execution plan.
- Core research enrollment delivery through 2026-10-07 and controlled trial through 2026-10-15.
- Miniapp, admin, API, contracts, deployment templates and filing integration boundaries.

## Scope OUT (Must NOT have)

- No production credentials, customer records, certificates or raw contract files in Git.
- No wholesale import of an unreviewed open-source repository.
- No microservices, Kubernetes, Redis, message queue, native app or deep PMS/OTA integration in the core milestone.
- No copying of 6renyou branding, images, text, code or exact screens.

## Open questions

None blocking this plan. Official app name, logo and account values are configuration inputs due 2026-09-15.

## Approval gate
status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

Approval evidence: the user explicitly accepted the approach and requested the detailed plan, Git initialization, preparation, safeguards, file management, synchronization and open-source/UI research on 2026-09-14.
