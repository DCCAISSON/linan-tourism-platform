# linan-platform-bootstrap - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A protected source repository and a working enrollment platform that progresses from local mock payment to real WeChat payment, then to one controlled end-to-end research trip.

**Why this approach:** A shared TypeScript monorepo and one vertical business flow let Codex work in parallel without splitting the data model. Filing and account work remain a separate track so they never block local development.

**What it will NOT do:** It will not put customer records or production secrets in Git, import an entire unreviewed tourism project, copy 6renyou assets, or introduce microservices before evidence requires them.

**Effort:** Large
**Risk:** High - the October dates depend on rapid business confirmation, platform approval and real payment testing.
**Decisions to sanity-check:** Vue 3 for both frontends, NestJS modular API, MySQL 8, three concurrent development lanes, and a September 29 release candidate.

Your next move: free local disk space, then execute Wave 1 in order. Full execution detail follows below.

---

> TL;DR (machine): Large/high-risk delivery; protected monorepo, core enrollment by 2026-10-07, controlled research-trip trial by 2026-10-15.

## Scope
### Must have

- Dedicated Git repository with local secret, customer-data and large-file guards.
- TypeScript monorepo with `apps/api`, `apps/admin`, `apps/miniapp` and `packages/contracts`.
- Core vertical flow: trip configuration, multi-participant enrollment, order, mock/real payment, paid roster, statistics and Excel export.
- Server-side price calculation, idempotent payment state, data-scope permissions, guardian-consent versioning and audit trail.
- Filing/account configuration that can replace local adapters without changing the business model.
- Release candidate by 2026-09-29, core trial delivery by 2026-10-07 and one controlled trial by 2026-10-15.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Must not commit raw contracts, personal information, production data, `.env`, certificates or provider secrets.
- Must not copy a whole OSS application, accept GPL/AGPL/no-license code, or copy proprietary travel branding and screens.
- Must not add microservices, Kubernetes, Redis, queues, native apps, deep PMS/OTA, automated insurance or live video to the October core.
- Must not let client-submitted prices, client payment results or UI permissions define authoritative business state.
- Must not change confirmed sample, pricing, refund, permission or enrollment rules silently.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD with Vitest for price/order/payment/refund/permission state machines; tests-after for CRUD and UI; API e2e with the Nest test harness; browser and WeChat developer-tool checks for visible flows.
- Evidence: `.omo/evidence/task-<N>-linan-platform-bootstrap.<ext>`; evidence remains local and must contain only fictitious test data.
- Required commands once applications exist: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.
- Financial release checks include a real small-value payment, callback/query reconciliation, next-day statement reconciliation and a partial refund before the relevant feature is exposed.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 0, repository baseline: Todo 1, already completed in this preparation turn.
- Wave 1, foundation: Todos 2–5. Storage precedes dependency installation; application scaffolds and remote safeguards can then run in parallel; shared contracts follow scaffolds.
- Wave 2, core vertical flow: Todos 6–10. Organization/catalog, enrollment, order/payment, roster/reporting and the miniapp UI use the contract package and integrate daily.
- Wave 3, production readiness: Todos 11–14. Official accounts, real payment, full permissions and UAT converge into the September 29 candidate.
- Wave 4, controlled full process: Todos 15–16. Refund and execution modules lead into one complete trip rehearsal.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2–16 | none |
| 2 | 1 | 3–5 | 4 |
| 3 | 2 | 5–10 | 4 |
| 4 | 1 | 14 | 2–3 |
| 5 | 3 | 6–13 | none |
| 6 | 5 | 7–10 | 11 |
| 7 | 5–6 | 8, 10, 13 | 9 |
| 8 | 5–7 | 9–10, 12–15 | none |
| 9 | 5–8 | 14 | 10 |
| 10 | 5–8 | 14 | 9 |
| 11 | external account inputs | 12, 14 | 6–10 |
| 12 | 8, 11 | 14–16 | 13 |
| 13 | 5–8 | 14–16 | 12 |
| 14 | 4, 6–13 | 15–16 | none |
| 15 | 8, 12–14 | 16 | none |
| 16 | 14–15 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Establish the protected repository baseline
  What to do / Must NOT do: initialize `linan-platform` on `main`; add repository boundaries, Git attributes, environment template, pre-commit protection, architecture, design, storage, OSS, sync and handoff documentation. Do not add raw business documents, secrets, dependencies or product code.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 2–16
  References: `README.md:1`, `docs/DEVELOPMENT_PROTECTION.md:3`, `docs/STORAGE_PLAN.md:5`, `docs/OPEN_SOURCE_EVALUATION.md:5`, `DESIGN.md:1`
  Acceptance criteria: `git status --short` shows only intended files before the initial commit; `git config core.hooksPath` returns `.githooks`; a forced staged dummy secret is rejected; `git diff --cached --check` passes for real files.
  QA scenarios: happy, run the hook with the intended staged tree and save output; failure, force-stage a dummy `.env` and verify the hook exits nonzero, then unstage and remove only that dummy. Evidence `.omo/evidence/task-1-linan-platform-bootstrap.txt`.
  Commit: Y | `chore(repo): initialize protected project workspace`

- [ ] 2. Place development caches and data on a drive with safe capacity
  What to do / Must NOT do: keep source under the current workspace; configure pnpm store, Docker disk image, MySQL dev volume, test uploads and build cache on E. Inspect existing Docker volumes and npm cache before changing them. Do not delete caches, images, volumes or other project data without a verified owner and recovery path.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 5
  References: `docs/STORAGE_PLAN.md:5`, `docs/STORAGE_PLAN.md:18`, `docs/STORAGE_PLAN.md:32`
  Acceptance criteria: C has at least 30GB free; E target directories exist; pnpm reports its store on E; Docker reports its data location on E after restart; a disposable MySQL volume persists across container restart.
  QA scenarios: happy, write/build/restart disposable artifacts and record locations; failure, set the disk threshold check above current free space and verify installation aborts without changing caches. Evidence `.omo/evidence/task-2-linan-platform-bootstrap.txt`.
  Commit: N | machine-local storage configuration

- [ ] 3. Scaffold API, admin and miniapp from pinned permissive sources
  What to do / Must NOT do: enable Corepack and pin pnpm 12.4.1; create NestJS API, pure-admin-thin-derived admin, uni-app Vue 3 TypeScript miniapp and workspace scripts. Import in isolated temporary directories first, retain license notices, strip demos/default credentials and avoid whole-history/submodule nesting.
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 5–10
  References: `docs/ARCHITECTURE.md:17`, `docs/OPEN_SOURCE_EVALUATION.md:5`, `third_party/README.md:1`, `package.json:1`
  Acceptance criteria: `pnpm install --frozen-lockfile`, per-app development start, `pnpm typecheck`, `pnpm test` and `pnpm build` exit 0; `git grep` finds no demo password or provider secret; third-party ledger contains exact SHA, license and copied paths.
  QA scenarios: happy, launch all three applications and capture health/home screenshots; failure, remove one required environment value and verify a clear startup error without printing secrets. Evidence `.omo/evidence/task-3-linan-platform-bootstrap.md`.
  Commit: Y | `chore(scaffold): add three applications and shared workspace`

- [ ] 4. Add remote collaboration and non-bypassable quality checks
  What to do / Must NOT do: create one private primary remote and optional mirror; add CI for lint, typecheck, test, e2e, build, secret scan and dependency audit; document protected-main settings. Do not expose the repository, grant broad cloud rights, or let the mirror become an independent source of truth.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 14
  References: `docs/DEVELOPMENT_PROTECTION.md:14`, `docs/DEVELOPMENT_PROTECTION.md:22`, `docs/FILE_MANAGEMENT_AND_SYNC.md:36`
  Acceptance criteria: a clean branch passes all required checks; direct push/force-push to protected `main` is rejected by the remote; mirror commit equals primary commit after synchronization.
  QA scenarios: happy, open and merge a disposable documentation PR after checks; failure, submit a branch containing a dummy secret and verify local hook/CI blocks it. Evidence `.omo/evidence/task-4-linan-platform-bootstrap.md`.
  Commit: Y | `ci(repo): enforce protected build and secret checks`

- [ ] 5. Define the shared domain contract and first database migration
  What to do / Must NOT do: define IDs, money-in-cents, organization/catalog/trip/enrollment/order/payment/roster/consent/audit entities, state enums, API error shape and first migration. Do not encode a still-unconfirmed approval-before-payment rule; isolate that transition behind an explicit policy.
  Parallelization: Wave 1 | Blocked by: 3 | Blocks: 6–13
  References: `docs/ARCHITECTURE.md:28`, `docs/ARCHITECTURE.md:42`, `packages/contracts/README.md:1`, `docs/TOMORROW_HANDOFF_CHECKLIST.md:31`
  Acceptance criteria: migration applies to an empty MySQL 8 database and rolls back; generated schema matches contracts; TDD cases cover cents, payer/contact/participant separation, allowed/forbidden state transitions and consent versioning.
  QA scenarios: happy, migrate/seed/query fictitious multi-child data; failure, attempt an invalid transition and duplicate provider transaction and verify rejection. Evidence `.omo/evidence/task-5-linan-platform-bootstrap.txt`.
  Commit: Y | `feat(contracts): define enrollment and payment domain`

- [ ] 6. Implement school, catalog and trip configuration
  What to do / Must NOT do: implement API and admin CRUD for school, grade, class, product/course, school-specific price, trip date, enrollment window and open/closed state. Do not add CMS, search, promotion or CRM scope.
  Parallelization: Wave 2 | Blocked by: 5 | Blocks: 7–10
  References: `docs/PROJECT_PLAN.md:5`, `docs/PROJECT_PLAN.md:28`, `docs/ARCHITECTURE.md:28`
  Acceptance criteria: API e2e creates two schools with different prices and dates; admin can configure and query them; closed/out-of-window trips reject new enrollment.
  QA scenarios: happy, create and publish a valid trip; failure, submit duplicate class keys, negative price and an expired enrollment window and verify actionable errors. Evidence `.omo/evidence/task-6-linan-platform-bootstrap.md`.
  Commit: Y | `feat(catalog): configure schools courses and trips`

- [ ] 7. Implement family members, multi-participant enrollment and consent
  What to do / Must NOT do: support parent identity placeholder/WeChat identity adapter, multiple family members, structured school-grade-class selection, emergency contact, field validation, review-before-submit and agreement version records. Do not store real minor data in local fixtures or logs.
  Parallelization: Wave 2 | Blocked by: 5–6 | Blocks: 8, 10, 13
  References: `docs/ARCHITECTURE.md:42`, `DESIGN.md:3`, `docs/DEVELOPMENT_PROTECTION.md:40`
  Acceptance criteria: TDD and API e2e cover one and multiple participants, duplicate member handling, required agreement acceptance and family isolation; logs contain no complete sensitive fields.
  QA scenarios: happy, enroll two children in one trip with recorded agreement version; failure, omit consent or read another family's member ID and verify rejection. Evidence `.omo/evidence/task-7-linan-platform-bootstrap.md`.
  Commit: Y | `feat(enrollment): support families and consented group signup`

- [ ] 8. Implement authoritative orders and mock payment
  What to do / Must NOT do: calculate price only on the server, snapshot participant lines, create unique orders, expose mock provider locally, process verified/queried events through an idempotent state machine and keep client display state non-authoritative.
  Parallelization: Wave 2 | Blocked by: 5–7 | Blocks: 9–10, 12–15
  References: `docs/ARCHITECTURE.md:42`, `.env.example:1`, `docs/PROJECT_PLAN.md:28`
  Acceptance criteria: TDD covers altered client amounts, duplicate submission, duplicate/delayed/out-of-order callback, closed order and provider mismatch; successful order creates exactly one paid roster transition.
  QA scenarios: happy, complete the first vertical flow with mock payment; failure, replay callbacks and tamper with price and verify no duplicate count or state corruption. Evidence `.omo/evidence/task-8-linan-platform-bootstrap.md`.
  Commit: Y | `feat(order): add idempotent mock payment flow`

- [ ] 9. Implement paid roster, statistics and safe Excel export
  What to do / Must NOT do: query enrollment/payment states by trip, school, grade and class; calculate paid headcount and amount; export a controlled column set. Do not count unpaid/refunded lines or expose sensitive columns to unauthorized roles.
  Parallelization: Wave 2 | Blocked by: 5–8 | Blocks: 14
  References: `docs/PROJECT_PLAN.md:28`, `docs/ARCHITECTURE.md:42`, `docs/DEVELOPMENT_PROTECTION.md:57`
  Acceptance criteria: API and workbook assertions reconcile participant lines, payment totals and export rows across two schools; permission checks run on both page query and file endpoint.
  QA scenarios: happy, export the exact paid roster; failure, request the export from another school scope and verify denial without file creation. Evidence `.omo/evidence/task-9-linan-platform-bootstrap.xlsx` plus sanitized assertion log.
  Commit: Y | `feat(roster): reconcile statistics and exports`

- [ ] 10. Build the parent miniapp core flow from the design system
  What to do / Must NOT do: implement trip entry/detail, participant stepper, review, order, payment result and order detail using design tokens and authorized local imagery. Use 6renyou only for the low-friction one-task structure. Do not copy its assets, wording, logo or exact composition.
  Parallelization: Wave 2 | Blocked by: 3, 5–8 | Blocks: 14
  References: `DESIGN.md:3`, `DESIGN.md:7`, `DESIGN.md:29`, `DESIGN.md:44`, `docs/OPEN_SOURCE_EVALUATION.md:24`
  Acceptance criteria: all raw colors/spacing map to `DESIGN.md`; typecheck/build pass; screens handle loading, empty, error, disabled and paid states; touch targets meet 44px and no horizontal overflow exists.
  QA scenarios: happy, run the full multi-child mock-payment journey in WeChat developer tools; failure, simulate network failure and closed registration and verify recoverable UI. Evidence `.omo/evidence/task-10-linan-platform-bootstrap/` screenshots and log.
  Commit: Y | `feat(miniapp): deliver core enrollment journey`

- [ ] 11. Integrate official app identity, cloud resources and filing outputs
  What to do / Must NOT do: receive only role-based access; configure official app name/AppID, dev/test domains, HTTPS, COS and deployment target; record filing/account status outside source secrets. Do not hardcode official values or accept shared master-account passwords.
  Parallelization: Wave 3 | Blocked by: external account inputs | Blocks: 12, 14
  References: `docs/TOMORROW_HANDOFF_CHECKLIST.md:3`, `docs/TOMORROW_HANDOFF_CHECKLIST.md:13`, `.env.example:1`, `docs/DEVELOPMENT_PROTECTION.md:33`
  Acceptance criteria: local/test configuration switches without code changes; health endpoint is reachable through HTTPS; COS test upload uses a short-lived least-privilege credential; repository secret scan remains clean.
  QA scenarios: happy, deploy a fictitious-file test and delete through authorized API; failure, use an expired/underprivileged credential and verify clear denial without secret logging. Evidence `.omo/evidence/task-11-linan-platform-bootstrap.md`.
  Commit: Y | `feat(platform): add environment-driven Tencent integration`

- [ ] 12. Replace mock provider with real WeChat Pay
  What to do / Must NOT do: bind certified AppID/mchid, configure API v3 material securely, create payment, verify callback signatures/decryption, query ambiguous outcomes, log Request-ID and reconcile system/provider state. Do not expose keys or accept the client success callback as final.
  Parallelization: Wave 3 | Blocked by: 8, 11 | Blocks: 14–16
  References: `.env.example:10`, `docs/ARCHITECTURE.md:53`, `docs/DEVELOPMENT_PROTECTION.md:33`, `docs/PROJECT_PLAN.md:49`
  Acceptance criteria: automated callback fixtures pass; one real small-value payment matches order, participant roster and admin statistics; duplicate callback remains idempotent; next-day provider statement reconciles.
  QA scenarios: happy, pay and query one small order on a real device; failure, send bad signature/wrong amount/duplicate notification and verify rejection or no-op as appropriate. Evidence `.omo/evidence/task-12-linan-platform-bootstrap.md` with redacted identifiers.
  Commit: Y | `feat(payment): integrate verified WeChat payment`

- [ ] 13. Complete scoped roles, export protection and audit trail
  What to do / Must NOT do: enforce parent-own-family, school-own-school, guide-assigned-trip, finance-payment-only and administrator scopes at the API; audit refunds, permission changes, order edits and agreement confirmations. Do not rely on hidden menus for authorization.
  Parallelization: Wave 3 | Blocked by: 5–8 | Blocks: 14–16
  References: `docs/ARCHITECTURE.md:28`, `docs/DEVELOPMENT_PROTECTION.md:40`, `docs/DEVELOPMENT_PROTECTION.md:57`
  Acceptance criteria: a permission matrix test proves all allowed and denied API paths, including direct IDs and exports; audit events identify actor/action/object/time without sensitive values.
  QA scenarios: happy, each role accesses its intended scope; failure, cross-family/cross-school/direct-download attempts return denial and create appropriate audit evidence. Evidence `.omo/evidence/task-13-linan-platform-bootstrap.md`.
  Commit: Y | `feat(iam): enforce data scopes and audit actions`

- [ ] 14. Produce and harden the September 29 UAT candidate
  What to do / Must NOT do: run the full command suite, real-device core journey, browser admin journey, deployment/rollback rehearsal and fictitious representative data; fix every blocker. Do not add post-core features or weaken failing tests to meet the date.
  Parallelization: Wave 3 | Blocked by: 4, 6–13 | Blocks: 15–16
  References: `docs/PROJECT_PLAN.md:49`, `docs/PROJECT_PLAN.md:74`, `docs/DEVELOPMENT_PROTECTION.md:57`
  Acceptance criteria: lint/typecheck/test/e2e/build pass; one multi-child real-payment path reconciles; rollback restores the prior version; zero open blocker for amount, roster, payment, permission or consent.
  QA scenarios: happy, execute the acceptance script end to end; failure, inject a duplicate callback and cross-school export attempt and verify the release gate stops. Evidence `.omo/evidence/task-14-linan-platform-bootstrap/`.
  Commit: Y | `fix(release): harden core enrollment candidate`

- [ ] 15. Add the confirmed October 15 process modules
  What to do / Must NOT do: implement full/partial refund, teacher import, vehicle suggestions with manual adjustment, pre-trip notice, guide check-in/records, authorized photo link/upload, evaluation template/export and insurance roster access. Use only rules and templates confirmed by October 8; defer unconfirmed automation.
  Parallelization: Wave 4 | Blocked by: 8, 12–14 | Blocks: 16
  References: `docs/PROJECT_PLAN.md:5`, `docs/PROJECT_PLAN.md:49`, `docs/DEVELOPMENT_PROTECTION.md:57`
  Acceptance criteria: cumulative refund cannot exceed paid amount; partial refund preserves unaffected participants; teacher lines do not affect paid totals; vehicle/evaluation/insurance exports match confirmed templates and scopes.
  QA scenarios: happy, execute one trip from roster through evaluation; failure, replay refund, over-refund, import duplicate teacher and access insurance data as an unauthorized role. Evidence `.omo/evidence/task-15-linan-platform-bootstrap/`.
  Commit: Y | `feat(trip): complete controlled research execution flow`

- [ ] 16. Rehearse one complete trip and enter controlled trial
  What to do / Must NOT do: create a production-like fictitious trip, perform enrollment/payment/refund/roster/vehicle/guide/photo/evaluation/insurance flows, reconcile balances and document rollback/support. Do not expand traffic if any financial, roster, consent or permission discrepancy remains.
  Parallelization: Wave 4 | Blocked by: 14–15 | Blocks: final verification
  References: `docs/PROJECT_PLAN.md:49`, `docs/PROJECT_PLAN.md:74`, `docs/DEVELOPMENT_PROTECTION.md:47`, `docs/DEVELOPMENT_PROTECTION.md:57`
  Acceptance criteria: all automated checks and real surface scenarios pass; system balance, WeChat statement, paid roster and refund ledger reconcile; backup restore and previous-version deployment are observed working.
  QA scenarios: happy, run the entire controlled-trip script with all roles; failure, introduce one amount mismatch and verify rollout stops with an actionable reconciliation report. Evidence `.omo/evidence/task-16-linan-platform-bootstrap/`.
  Commit: Y | `chore(release): prepare controlled research trial`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: compare every Must have/Must NOT have and todo acceptance criterion with repository evidence; reject missing or self-reported-only proof.
- [ ] F2. Code quality review: inspect full diff, types, migrations, state machines, dependency licenses, secret scan and test assertions; reject suppressions, duplicated authority or unowned complexity.
- [ ] F3. Real manual QA: drive parent miniapp, admin, guide and export surfaces on real devices/browsers; verify loading, failure, permission and rollback states with screenshots.
- [ ] F4. Scope fidelity: re-read contract-derived core and controlled-trial boundaries; reject scope creep, missing October items and any silent data/permission rule change.

## Commit strategy

- Use Conventional Commit-style messages defined in `.gitmessage` because this is a new repository with no inherited history style.
- Keep each todo's implementation, migration and direct tests in one atomic commit.
- Keep generated lockfiles with the scaffold/dependency commit that created them.
- Do not mix account values, environment secrets, customer data, exported workbooks or evidence into commits.
- Tag the accepted September 29 candidate, October 7 core delivery and October 15 controlled trial only after their gates pass.

## Success criteria

- Repository guards demonstrably block a secret-like file and an oversized file while accepting normal source changes.
- C-drive capacity is made safe before dependency installation; development caches and mutable data use E.
- Three applications and shared contracts install, typecheck, test, build and run from a clean clone.
- A parent can enroll multiple participants, pay, and see the authoritative result; admin roster/statistics/export reconcile exactly.
- Real payment callback/query, next-day statement, refund and permission checks pass with redacted evidence.
- Guardian agreement versions and sensitive-data scopes are enforced at the API.
- The September 29 candidate, October 7 core delivery and October 15 controlled trial each pass their matching surface QA and have a tested rollback.
- No raw contract, real personal data, production secret, proprietary travel asset or unapproved-license source exists in Git history.
