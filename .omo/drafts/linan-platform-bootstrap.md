---
slug: linan-platform-bootstrap
status: ready-for-execution-authorization
intent: clear
pending-action: await explicit user authorization to execute Todo 3
approach: Build a protected TypeScript monorepo around one vertical enrollment-to-roster flow, while filing and platform accounts proceed independently.
---

# Draft: linan-platform-bootstrap

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id | outcome | status | evidence path |
| --- | --- | --- | --- |
| repository | source, secrets, data and history are protected | active | `docs/开发保护与恢复规则.md` |
| platform-api | one modular API owns business state and payments | active | `docs/系统架构.md` |
| miniapp | parents complete multi-participant enrollment | active | `apps/miniapp/README.md` |
| admin | staff configure trips and reconcile rosters | active | `apps/admin/README.md` |
| filing-integration | official accounts replace local adapters without redesign | active | `docs/需求方交接清单.md` |
| controlled-trial | one full trip is rehearsed before wider release | active | `docs/项目计划与进度.md` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| repository boundary | code gets a separate `linan-platform` repository | avoids committing contracts and customer material | yes |
| stack | Vue 3 across miniapp/admin, NestJS API, MySQL 8.4 LTS | fastest shared TypeScript path with mature OSS and a current database LTS | yes, before product code |
| runtime | upgrade Node 22.17.0 to Node 22.23.2 LTS before Nest 12 scaffolding; use pnpm 12.4.1 with Corepack integrity metadata | current Nest 12 schematics require Node 22.22.3 or newer | yes, before dependency installation |
| delivery architecture | modular monolith | shortest integration path for October milestones | yes, modules can split later |
| testing | TDD for money, state and permissions; tests-after for CRUD/UI | protects irreversible business errors without over-testing scaffolding | yes |
| UI direction | trustworthy nature-led service interface, not a clone | fits domain and avoids proprietary asset copying | yes, tokens can change tomorrow |
| execution cadence | three continuous code lanes plus concurrent QA/review; target code-complete at T+24h, UAT at T+72h and a stable build at T+3–5 days | reflects Codex execution speed while retaining one authority for contracts, migrations and payment state | yes, pace yields to failed gates |
| local storage | keep source, dependencies, Docker and the development database on C while at least 10GB remains free; use E only after repair as optional auxiliary storage | C was rechecked with 47.11GB free; E remains Dirty/Full Repair Needed | yes |

## Findings (cited - path:lines)

- No existing source repository was present; the material workspace contained 65 files and about 375.89MB before this repository was created.
- Local environment: Node 22.17.0, npm 10.9.2, Git 2.43.0, Docker installed but engine stopped, pnpm absent.
- Disk evidence: `docs/开发存储与容量计划.md:9`; C was rechecked with about 47.11GB free. `docs/开发存储与容量计划.md:75` records E as Dirty/Full Repair Needed and non-blocking for C-based development.
- Progress: repository/storage preparation is complete (2 of 16 plan todos); Todo 3 and all application code await explicit execution authorization.
- The compressed execution schedule and contract milestones are recorded in `docs/项目计划与进度.md`.
- Architecture and invariants: `docs/系统架构.md:17` and `docs/系统架构.md:42`.
- OSS and proprietary UI findings: `docs/开源复用与界面调研.md:5` and `docs/开源复用与界面调研.md:24`.

## Decisions (with rationale)

- Use a dedicated source repository with pre-commit blocking for secrets, customer data and large files.
- Use a single vertical enrollment-to-roster slice before expanding secondary modules.
- Reuse permissively licensed frameworks and thin templates at pinned versions; do not transplant a whole tourism system.
- Treat 6renyou as an information-architecture reference only.
- Run three continuous code lanes with QA/review alongside them; integrate every 4–6 hours and keep contracts, migrations and payment state under one authority.
- Install dependencies on C only after the pre-wave repository gate; keep at least 10GB free and do not move mutable data to E until its repair is verified.

## Scope IN

- Git repository initialization, local safeguards, file/sync policy, storage plan, design system, OSS ledger and execution plan.
- Accelerated delivery targets of T+24 hours for code-complete, T+72 hours for an evidence-backed UAT candidate and T+3–5 days for a stable build; the contractual 2026-10-07 and 2026-10-15 dates remain external latest milestones.
- Miniapp, admin, API, contracts, deployment templates and filing integration boundaries.

## Scope OUT (Must NOT have)

- No production credentials, customer records, certificates or raw contract files in Git.
- No wholesale import of an unreviewed open-source repository.
- No microservices, Kubernetes, Redis, message queue, native app or deep PMS/OTA integration in the core milestone.
- No copying of 6renyou branding, images, text, code or exact screens.

## Open questions

None block Todo 3 scaffolding. Before Todo 5 freezes the production domain contract, the demand side must provide the participant/contact field list, approval-before-payment decision, minimum role/data-scope matrix and versioned consent text. Certified AppID/mchid material blocks Todo 12 and real enrollment, not local mock development. A controlled-trip participant cap and stop/support owners block Todo 16.

## Approval gate
status: awaiting-execution-authorization
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

Approval evidence: the user explicitly accepted the planning and repository-preparation work on 2026-09-14. On 2026-09-15, fresh Momus and independent Codex reviews both returned `OKAY`; the user then requested a compressed schedule reflecting continuous and parallel execution. Application development still awaits the user's explicit authorization.
