# linan-platform-bootstrap - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A protected source repository and a working enrollment platform that progresses from local mock payment to real WeChat payment, then to one controlled end-to-end research trip.

**Why this approach:** A shared TypeScript monorepo and one vertical business flow let Codex work in parallel without splitting the data model. Filing and account work remain a separate track so they never block local development.

**What it will NOT do:** It will not put customer records or production secrets in Git, import an entire unreviewed tourism project, copy 6renyou assets, or introduce microservices before evidence requires them.

**Execution estimate:** Code-complete at T+24 hours, verified UAT candidate at T+72 hours, stable build at T+3–5 days; T0 is explicit user authorization.
**Effort:** Large scope with compressed elapsed time through continuous execution and three concurrent code lanes.
**Risk:** Medium for the local/mock UAT candidate; high for production opening because business confirmation, platform approval and real payment testing are external gates.
**Decisions to sanity-check:** Vue 3 for both frontends, NestJS modular API, MySQL 8.4 LTS, three concurrent code lanes with one integration authority, and a T+72-hour UAT candidate.

Your next move: obtain explicit execution authorization, restore repository-local safeguards, preserve any reviewed pending changes, then begin Todo 3 from a clean isolated worktree. Full execution detail follows below.

---

> TL;DR (machine): T0 = explicit execution authorization; current confirmed scope code-complete T+24h, verified UAT T+72h, stable build T+3–5d; production gates remain external.

## Scope
### Must have

- Dedicated Git repository with local secret, customer-data and large-file guards.
- TypeScript monorepo with `apps/api`, `apps/admin`, `apps/miniapp` and `packages/contracts`.
- Core vertical flow: trip configuration, multi-participant enrollment, order, mock/real payment, paid roster, statistics and Excel export.
- Server-side price calculation, idempotent payment state, data-scope permissions, guardian-consent versioning and audit trail.
- Filing/account configuration that can replace local adapters without changing the business model.
- Code-complete checkpoint by T+24 hours, evidence-backed UAT candidate by T+72 hours and stable build by T+3–5 days; the contractual 2026-09-29, 2026-10-07 and 2026-10-15 dates remain latest external milestones rather than internal waiting dates.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Must not commit raw contracts, personal information, production data, `.env`, certificates or provider secrets.
- Must not copy a whole OSS application, accept GPL/AGPL/no-license code, or copy proprietary travel branding and screens.
- Must not add microservices, Kubernetes, Redis, queues, native apps, deep PMS/OTA, automated insurance or live video to the October core.
- Must not let client-submitted prices, client payment results or UI permissions define authoritative business state.
- Must not change confirmed sample, pricing, refund, permission or enrollment rules silently.

## Verification strategy
> Codex executes and records all code, API, browser and miniapp checks. Enterprise identity verification, platform approval, real-payment authorization and business UAT remain named external gates; Codex must observe and record their outcome and may not infer success.
- Test decision: TDD with Vitest for price/order/payment/refund/permission state machines; tests-after for CRUD and UI; API e2e with the Nest test harness; Playwright for the admin; `miniprogram-automator` plus WeChat Developer Tools for the miniapp.
- Evidence: `.omo/evidence/task-<N>-linan-platform-bootstrap.<ext>`; evidence remains local and must contain only fictitious test data.
- Required commands once applications exist: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.
- Financial release checks include a real small-value payment, callback/query reconciliation, next-day statement reconciliation and a partial refund before the relevant feature is exposed.

## Execution strategy
### Pre-wave safety and decision gates

- Before Todo 3, run `npm run repo:setup`, `git status --short --branch`, `git diff --check` and `npm run repo:verify`. After the user authorizes execution, if reviewed changes are pending, use `omo:git-master` to preserve only those documentation/configuration changes in one baseline commit; if the tree is already clean, continue from the reviewed HEAD. Then create `feat/scaffold-foundation` in an isolated worktree. Never add application code to a dirty branch, discard an existing change or assume a clone already has repository-local Git settings.
- Todo 3 may start without official AppID, merchant credentials or final business fields. Todo 5 may establish an explicitly provisional test contract from confirmed materials so local/mock development can continue, but it may not label that contract production-ready. Before the production domain contract is frozen, the demand side must supply the field list, the approval-before-payment decision, the minimum role/data-scope matrix and versioned consent text named in `docs/需求方交接清单.md:33`; absent items stay behind explicit adapters/policies and cannot be guessed into the schema.
- Todo 12 cannot pass until certified AppID/mchid material and an authorized small real payment are available. If those external inputs are late, mock-payment delivery may continue, but the plan must label production payment and real enrollment blocked rather than treating mock evidence as equivalent.
- Todo 16 cannot open real enrollment until the demand side records a participant cap, operating owner, stop authority and support/rollback contact for the controlled trip; any amount, roster, consent or permission mismatch stops expansion.
- Execution uses the installed `omo:start-work` plan runner; `omo:programming` governs TypeScript work, `omo:frontend` and `omo:visual-qa` govern both frontends, `omo:debugging` governs runtime failures, `omo:git-master` governs commits, and `omo:review-work` supports the final review wave.

### Compressed elapsed-time targets

- T+0–4 hours: preserve the reviewed baseline, upgrade the runtime and scaffold the three applications plus shared contracts.
- T+4–12 hours: freeze the available domain contract and complete the first configuration-to-enrollment-to-mock-payment-to-roster vertical flow.
- T+12–24 hours: complete the remaining confirmed code across the API, miniapp and admin lanes, continuously integrating through the shared contract.
- T+24–48 hours: run and fix automated, browser, miniapp, permission, payment-failure and export scenarios while independent review runs alongside QA.
- T+48–72 hours: complete deployment/rollback rehearsal, blocker fixes and final UAT review.
- T+3–5 days: stabilize confirmed business rules and any official integrations whose accounts are available. Missing rules or credentials keep only their named gates blocked; they do not slow unrelated local code.

Elapsed-time targets never weaken acceptance criteria. A failing money, roster, permission, consent, build or surface gate extends the affected result rather than being waived to meet the clock.

### Parallel execution waves
> Three code lanes run continuously; QA and review may run alongside them. Shared contracts, migrations and payment state remain under one integration authority.

- Wave 0, repository baseline: Todo 1, already completed in this preparation turn.
- Wave 1, T+0–6 hours, foundation: execute Todos 3–5 after the already-finished storage gate; scaffolding, local CI safeguards and shared contracts run in parallel, while any unavailable remote account remains only a named production gate.
- Wave 2, T+6–16 hours, core vertical flow: Todos 6–10. Organization/catalog, enrollment, order/payment, roster/reporting and miniapp UI integrate every 4–6 hours.
- Wave 3, T+14–24 hours for available code, production readiness: Todos 11–14. Full permissions and local/test integrations proceed immediately; official accounts and real payment retain their external gates; UAT hardening continues through T+72 hours.
- Wave 4, T+18–24 hours for confirmed code, controlled full process: Todo 15 can run beside UAT preparation once its rules and core dependencies are ready; Todo 16 remains a real-world trial after all release gates pass.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2–16 | none |
| 2 | 1 | 3–5 | 4 |
| 3 | 2 | 5–10 | 4 |
| 4 | 1 | production remote gate | 2–3 |
| 5 | 3; production sign-off also needs required business inputs | 6–13 | none |
| 6 | 5 | 7–10 | 11 |
| 7 | 5–6 | 8, 10, 13 | 9 |
| 8 | 5–7 | 9–10, 12–15 | none |
| 9 | 5–8 | 14 | 10 |
| 10 | 5–8 | 14 | 9 |
| 11 | external account inputs | 12, 16 | 6–10 |
| 12 | 8, 11 | 16 | 13, 15 |
| 13 | 5–8 | 14–16 | 12 |
| 14 | 6–10, 13 | 16 | 4, 11–12, 15 |
| 15 | 8, 13, confirmed second-stage rules | 16 | 12, 14 |
| 16 | 11–12, 14–15, controlled-trial inputs | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Establish the protected repository baseline
  What to do / Must NOT do: initialize `linan-platform` on `main`; add repository boundaries, Git attributes, environment template, pre-commit protection, architecture, design, storage, OSS, sync and handoff documentation. Do not add raw business documents, secrets, dependencies or product code.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 2–16
  References: `README.md:1`, `docs/开发保护与恢复规则.md:3`, `docs/开发存储与容量计划.md:5`, `docs/开源复用与界面调研.md:5`, `DESIGN.md:1`
  Acceptance criteria: `git status --short` shows only intended files before the initial commit; `git config core.hooksPath` returns `.githooks`; a forced staged dummy secret is rejected; `git diff --cached --check` passes for real files.
  QA scenarios: happy, run the hook with the intended staged tree and save output; failure, force-stage a dummy `.env` and verify the hook exits nonzero, then unstage and remove only that dummy. Evidence `.omo/evidence/task-1-linan-platform-bootstrap.txt`.
  Commit: Y | `chore(repo): initialize protected project workspace`

- [x] 2. Reclaim and verify safe C-drive development capacity
  What to do / Must NOT do: use Windows storage cleanup to remove old user/system temporary files, clear only confirmed regenerable caches, and remeasure C before installing dependencies. Do not select Downloads, remove research/project data, delete Docker images or volumes, or disable recovery features merely to meet the threshold. E is an optional auxiliary drive only after its current NTFS Dirty/Full Repair Needed state is repaired and verified.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 5
  References: `docs/开发存储与容量计划.md:9`, `docs/开发存储与容量计划.md:30`, `docs/开发存储与容量计划.md:69`, `docs/开发存储与容量计划.md:73`
  Acceptance criteria: `(Get-PSDrive -Name C).Free` reports at least 35GB free, with 40GB preferred; `npm run repo:verify` exits 0. Dependency installation must retain at least 10GB free; E remains unused until `fsutil dirty query E:` and `Get-Volume -DriveLetter E` both show a repaired healthy volume.
  QA scenarios: happy, save the PowerShell free-space result and `npm run repo:verify` PASS output; failure, if C is below 10GB free or E is Dirty/Full Repair Needed, abort the affected installation or migration without deleting user data, Docker volumes or unverified caches. Evidence `.omo/evidence/task-2-linan-platform-bootstrap.txt`.
  Commit: N | machine-local storage configuration

- [ ] 3. Scaffold API, admin and miniapp from pinned permissive sources
  What to do / Must NOT do: upgrade the local runtime from Node 22.17.0 to the current Node 22 LTS patch 22.23.2 before invoking Nest 12 schematics, enforce the repository engine floor `>=22.22.3 <23`, keep `@types/node` on major 22, then enable Corepack and use `corepack use pnpm@12.4.1` so `packageManager` records the integrity hash. Create packages named `@linan/api`, `@linan/admin`, `@linan/miniapp` and `@linan/contracts`; add root `lint`, `typecheck`, `test`, `test:e2e` and `build` scripts. Generate the API with `@nestjs/cli@12.0.1`; do not copy the starter fixed tree. Import pure-admin-thin only through an isolated temporary directory. Build the minimal uni-app Vue 3 TypeScript shell from the Apache-2.0 `@dcloudio/uni-app` packages and official documentation; do not copy `dcloudio/uni-preset-vue` while its `vite-ts` source license remains unverified. Retain required notices, strip demos/default credentials and avoid whole-history/submodule nesting. Configure Playwright for admin e2e and `miniprogram-automator` for miniapp e2e; add no product features in this task.
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 5–10
  References: `docs/系统架构.md:19`, `docs/开源复用与界面调研.md:7`, `docs/开源复用与界面调研.md:74`, `third_party/README.md:3`, `package.json:1`
  Acceptance criteria: `node --version` returns `v22.23.2`; `corepack pnpm --version` returns `12.4.1`; `pnpm install --frozen-lockfile`, per-app development start, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` exit 0; `git grep` finds no demo password or provider secret; third-party ledger contains exact SHA, license and copied paths.
  QA scenarios: happy, run `corepack pnpm install --frozen-lockfile`, the five root verification scripts, `pnpm --filter @linan/api dev`, `pnpm --filter @linan/admin dev` and `pnpm --filter @linan/miniapp dev:mp-weixin`; use HTTP health output, Playwright and WeChat Developer Tools to capture the three running surfaces. Failure, run the API once without `DATABASE_URL` and assert a nonzero exit with the variable name but no value. Evidence `.omo/evidence/task-3-linan-platform-bootstrap/`.
  Commit: Y | `chore(scaffold): add three applications and shared workspace`

- [ ] 4. Add remote collaboration and non-bypassable quality checks
  What to do / Must NOT do: create one private primary remote and optional mirror; add CI for lint, typecheck, test, e2e, build, secret scan and dependency audit; document protected-main settings. Do not expose the repository, grant broad cloud rights, or let the mirror become an independent source of truth.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: production remote gate
  References: `docs/开发保护与恢复规则.md:15`, `docs/开发保护与恢复规则.md:23`, `docs/文件管理与同步.md:28`, `docs/文件管理与同步.md:36`
  Acceptance criteria: a clean branch passes all required checks; direct push/force-push to protected `main` is rejected by the remote; mirror commit equals primary commit after synchronization.
  QA scenarios: happy, use the chosen remote CLI to create a disposable documentation branch/PR, wait for `lint`, `typecheck`, `test`, `test:e2e`, `build`, secret scan and dependency audit, merge it, then verify the primary and mirror resolve to the same commit. Failure, create a disposable branch containing a forced dummy `.env`, verify both `.githooks/pre-commit` and CI reject it, then delete only that disposable branch/file. Evidence `.omo/evidence/task-4-linan-platform-bootstrap.md`.
  Commit: Y | `ci(repo): enforce protected build and secret checks`

- [ ] 5. Define the shared domain contract, access baseline and first database migration
  What to do / Must NOT do: use TypeORM + `mysql2` with `synchronize: false`; define IDs, money-in-cents, organization/catalog/trip/enrollment/order/payment/roster/consent/audit entities, state enums, API error shape and first migration. Miniapp identity uses a development adapter and a production `wx.login`/server `code2Session` adapter; staff access uses server-issued revocable sessions and a one-time production administrator bootstrap, with secrets supplied only by environment configuration. Add database unique constraints for order number, request idempotency key and provider transaction/event identifiers, and use MySQL transactions for order creation and payment-state transitions. Do not encode a still-unconfirmed approval-before-payment rule or unconfirmed personal fields; isolate each behind an explicit policy/schema version.
  Parallelization: Wave 1 | Blocked by: 3; production sign-off also requires the named business inputs | Blocks: 6–13
  References: `docs/系统架构.md:28`, `docs/系统架构.md:42`, `docs/系统架构.md:53`, `packages/contracts/README.md:3`, `docs/需求方交接清单.md:33`
  Acceptance criteria: migration applies to an empty MySQL 8.4 LTS database and rolls back; generated schema matches contracts; TDD cases cover cents, payer/contact/participant separation, allowed/forbidden state transitions and consent versioning. If named business inputs are absent, the contract/evidence identifies the provisional test policies and the release gate blocks real enrollment until their signed-off versions replace them.
  QA scenarios: happy, run `pnpm --filter @linan/api db:migrate`, `pnpm --filter @linan/api db:seed:test`, `pnpm --filter @linan/api test:e2e -- test/contracts-state.e2e-spec.ts`, then `db:revert` and `db:migrate` again against a fresh MySQL 8.4 LTS test database. Failure, the same suite submits invalid transitions, repeated idempotency keys and duplicate provider identifiers and expects transaction rollback/unique-conflict responses. Evidence `.omo/evidence/task-5-linan-platform-bootstrap.txt`.
  Commit: Y | `feat(contracts): define enrollment and payment domain`

- [ ] 6. Implement school, catalog and trip configuration
  What to do / Must NOT do: implement API and admin CRUD for school, grade, class, product/course, school-specific price, trip date, enrollment window and open/closed state. Do not add CMS, search, promotion or CRM scope.
  Parallelization: Wave 2 | Blocked by: 5 | Blocks: 7–10
  References: `docs/项目计划与进度.md:18`, `docs/项目计划与进度.md:39`, `docs/项目计划与进度.md:41`, `docs/系统架构.md:28`
  Acceptance criteria: API e2e creates two schools with different prices and dates; admin can configure and query them; closed/out-of-window trips reject new enrollment.
  QA scenarios: happy, run `pnpm --filter @linan/api test:e2e -- test/catalog-trip.e2e-spec.ts` and `pnpm --filter @linan/admin test:e2e -- catalog-trip.spec.ts` to create, publish and read a valid trip. Failure cases in the same suites submit duplicate class keys, negative price and an expired enrollment window and assert stable API errors and visible admin messages. Evidence `.omo/evidence/task-6-linan-platform-bootstrap/`.
  Commit: Y | `feat(catalog): configure schools courses and trips`

- [ ] 7. Implement family members, multi-participant enrollment and consent
  What to do / Must NOT do: support parent identity placeholder/WeChat identity adapter, multiple family members, structured school-grade-class selection, emergency contact, field validation, review-before-submit and agreement version records. Do not store real minor data in local fixtures or logs.
  Parallelization: Wave 2 | Blocked by: 5–6 | Blocks: 8, 10, 13
  References: `docs/系统架构.md:42`, `DESIGN.md:3`, `docs/开发保护与恢复规则.md:41`, `docs/需求方交接清单.md:33`
  Acceptance criteria: TDD and API e2e cover one and multiple participants, duplicate member handling, required agreement acceptance and family isolation; logs contain no complete sensitive fields.
  QA scenarios: happy, run `pnpm --filter @linan/api test:e2e -- test/enrollment-consent.e2e-spec.ts` to enroll two fictitious children and query the exact agreement version. Failure cases omit consent and use another family's member ID, expecting 4xx denial and no sensitive values in captured logs. Evidence `.omo/evidence/task-7-linan-platform-bootstrap.md`.
  Commit: Y | `feat(enrollment): support families and consented group signup`

- [ ] 8. Implement authoritative orders and mock payment
  What to do / Must NOT do: calculate price only on the server, snapshot participant lines, create unique orders, expose mock provider locally, process verified/queried events through an idempotent state machine and keep client display state non-authoritative.
  Parallelization: Wave 2 | Blocked by: 5–7 | Blocks: 9–10, 12–15
  References: `docs/系统架构.md:42`, `.env.example:1`, `docs/项目计划与进度.md:41`
  Acceptance criteria: TDD covers altered client amounts, duplicate submission, duplicate/delayed/out-of-order callback, closed order and provider mismatch; successful order creates exactly one paid roster transition.
  QA scenarios: happy, run `pnpm --filter @linan/api test -- src/modules/order` and `pnpm --filter @linan/api test:e2e -- test/mock-payment.e2e-spec.ts` to complete one multi-participant mock payment. Failure cases replay and reorder callbacks, repeat the idempotency key and tamper with price; assert one order, one terminal payment transition and one roster effect. Evidence `.omo/evidence/task-8-linan-platform-bootstrap.md`.
  Commit: Y | `feat(order): add idempotent mock payment flow`

- [ ] 9. Implement paid roster, statistics and safe Excel export
  What to do / Must NOT do: query enrollment/payment states by trip, school, grade and class; calculate paid headcount and amount; export a controlled column set. Do not count unpaid/refunded lines or expose sensitive columns to unauthorized roles.
  Parallelization: Wave 2 | Blocked by: 5–8 | Blocks: 14
  References: `docs/项目计划与进度.md:41`, `docs/系统架构.md:42`, `docs/开发保护与恢复规则.md:58`
  Acceptance criteria: API and workbook assertions reconcile participant lines, payment totals and export rows across two schools; permission checks run on both page query and file endpoint.
  QA scenarios: happy, run `pnpm --filter @linan/api test:e2e -- test/roster-export.e2e-spec.ts`; parse the streamed workbook and assert row count, cents total and participant identities against the paid lines. Failure, request the export from another school scope and assert 403 plus no file in `exports/`, `tmp/` or COS. Evidence `.omo/evidence/task-9-linan-platform-bootstrap.xlsx` plus sanitized assertion log.
  Commit: Y | `feat(roster): reconcile statistics and exports`

- [ ] 10. Build the parent miniapp core flow from the design system
  What to do / Must NOT do: implement trip entry/detail, participant stepper, review, order, payment result and order detail using design tokens and authorized local imagery. Use 6renyou only for the low-friction one-task structure. Do not copy its assets, wording, logo or exact composition.
  Parallelization: Wave 2 | Blocked by: 3, 5–8 | Blocks: 14
  References: `DESIGN.md:5`, `DESIGN.md:9`, `DESIGN.md:31`, `DESIGN.md:46`, `docs/开源复用与界面调研.md:40`
  Acceptance criteria: all raw colors/spacing map to `DESIGN.md`; typecheck/build pass; screens handle loading, empty, error, disabled and paid states; touch targets meet 44px and no horizontal overflow exists.
  QA scenarios: happy, run `pnpm --filter @linan/miniapp typecheck`, `build:mp-weixin` and `test:e2e`; the latter opens the built project through `$env:WECHAT_DEVTOOLS_CLI` and `miniprogram-automator`, completes the multi-child mock-payment journey and captures each screen. Failure, the same suite intercepts one API request and closes one registration, then asserts retry/closed states without horizontal overflow. Evidence `.omo/evidence/task-10-linan-platform-bootstrap/` screenshots and log.
  Commit: Y | `feat(miniapp): deliver core enrollment journey`

- [ ] 11. Integrate official app identity, cloud resources and filing outputs
  What to do / Must NOT do: receive only role-based access; configure official app name/AppID, dev/test domains, HTTPS, COS and deployment target; record filing/account status outside source secrets. Do not hardcode official values or accept shared master-account passwords.
  Parallelization: Wave 3 | Blocked by: external account inputs | Blocks: 12, 16
  References: `docs/需求方交接清单.md:3`, `docs/需求方交接清单.md:13`, `.env.example:1`, `docs/开发保护与恢复规则.md:34`
  Acceptance criteria: local/test configuration switches without code changes; health endpoint is reachable through HTTPS; COS test upload uses a short-lived least-privilege credential; repository secret scan remains clean.
  QA scenarios: happy, deploy with `docker compose -f deploy/docker-compose.yml --env-file <ignored-test-env> up -d`, request `/health`, then run `pnpm --filter @linan/api test:e2e -- test/cos.e2e-spec.ts` with a fictitious file and delete it through the authorized API. Failure, rerun with an expired/underprivileged test credential and assert provider denial plus redacted logs; finish with `docker compose ... down` without `-v`. Evidence `.omo/evidence/task-11-linan-platform-bootstrap.md`.
  Commit: Y | `feat(platform): add environment-driven Tencent integration`

- [ ] 12. Replace mock provider with real WeChat Pay
  What to do / Must NOT do: bind certified AppID/mchid, configure the merchant API private key/serial number, API v3 key and WeChat Pay public key/public-key ID securely (use platform certificates only when the account still operates in that mode), create payment, verify callback signatures before decryption, query ambiguous outcomes, log Request-ID and reconcile system/provider state. Do not expose keys or accept the client success callback as final.
  Parallelization: Wave 3 | Blocked by: 8, 11 | Blocks: 16
  References: `.env.example:10`, `docs/系统架构.md:53`, `docs/开发保护与恢复规则.md:34`, `docs/项目计划与进度.md:72`
  Acceptance criteria: automated callback fixtures pass; one real small-value payment matches order, participant roster and admin statistics; duplicate callback remains idempotent; next-day provider statement reconciles.
  QA scenarios: happy, run automated official callback fixtures, then use the certified test configuration and WeChat Developer Tools/real device to pay one authorized small order; call the provider query API and next-day statement job and reconcile order, participant roster and admin statistics. Failure, run fixtures for bad signature, wrong merchant/amount and duplicate notification and assert rejection or idempotent no-op. Evidence `.omo/evidence/task-12-linan-platform-bootstrap.md` with redacted identifiers.
  Commit: Y | `feat(payment): integrate verified WeChat payment`

- [ ] 13. Complete scoped roles, export protection and audit trail
  What to do / Must NOT do: enforce parent-own-family, school-own-school, guide-assigned-trip, finance-payment-only and administrator scopes at the API; audit refunds, permission changes, order edits and agreement confirmations. Do not rely on hidden menus for authorization.
  Parallelization: Wave 3 | Blocked by: 5–8 | Blocks: 14–16
  References: `docs/系统架构.md:28`, `docs/开发保护与恢复规则.md:41`, `docs/开发保护与恢复规则.md:58`
  Acceptance criteria: a permission matrix test proves all allowed and denied API paths, including direct IDs and exports; audit events identify actor/action/object/time without sensitive values.
  QA scenarios: happy, run `pnpm --filter @linan/api test:e2e -- test/permission-matrix.e2e-spec.ts` against every allowed cell in the versioned role/data-scope matrix. Failure, run every denied cell including cross-family, cross-school, direct-ID and direct-download attempts and assert 403/no file plus an audit event without sensitive values. Evidence `.omo/evidence/task-13-linan-platform-bootstrap.md`.
  Commit: Y | `feat(iam): enforce data scopes and audit actions`

- [ ] 14. Produce and harden the T+72-hour UAT candidate
  What to do / Must NOT do: run the full command suite, available miniapp surface journey, browser admin journey, deployment/rollback rehearsal and fictitious representative data; fix every blocker. Use real payment when Todo 12 has passed; otherwise use the mock provider and mark production payment/real enrollment blocked in the candidate evidence. Do not add post-core features, claim mock evidence is real payment or weaken failing tests to meet the date.
  Parallelization: Wave 3 | Blocked by: 6–10, 13 | Blocks: 16
  References: `docs/项目计划与进度.md:58`, `docs/项目计划与进度.md:82`, `docs/开发保护与恢复规则.md:58`
  Acceptance criteria: lint/typecheck/test/e2e/build pass; one multi-child path reconciles through the currently available payment provider; rollback restores the prior version; zero open blocker for amount, roster, permission or consent. If Todo 12 has not passed, the candidate explicitly fails the production-payment gate while remaining acceptable for contract-defined test-environment UAT.
  QA scenarios: happy, run the five root checks, `pnpm test:acceptance:core`, Playwright admin e2e, miniapp automator e2e and `docker compose` deploy/rollback rehearsal; capture commit IDs, screen states and reconciled totals. Failure, `pnpm test:release-gate -- --inject duplicate-callback,cross-school-export` must exit nonzero and name both blocked conditions. Evidence `.omo/evidence/task-14-linan-platform-bootstrap/`.
  Commit: Y | `fix(release): harden core enrollment candidate`

- [ ] 15. Add the confirmed controlled-trial process modules
  What to do / Must NOT do: implement full/partial refund, teacher import, vehicle suggestions with manual adjustment, pre-trip notice, guide check-in/records, authorized photo link/upload, evaluation template/export and insurance roster access. Use only rules and templates confirmed by October 8; defer unconfirmed automation.
  Parallelization: Wave 4 | Blocked by: 8, 13 and confirmed second-stage rules | Blocks: 16
  References: `docs/项目计划与进度.md:16`, `docs/项目计划与进度.md:67`, `docs/开发保护与恢复规则.md:58`
  Acceptance criteria: cumulative refund cannot exceed paid amount; partial refund preserves unaffected participants; teacher lines do not affect paid totals; vehicle/evaluation/insurance exports match confirmed templates and scopes.
  QA scenarios: happy, run `pnpm test:acceptance:trip` with the confirmed vehicle/evaluation/insurance templates and assert each exported row and amount. Failure, the same suite replays a refund, requests an over-refund, imports a duplicate teacher and uses an unauthorized insurance role; assert no double financial effect, no duplicate participant and no disclosure. Evidence `.omo/evidence/task-15-linan-platform-bootstrap/`.
  Commit: Y | `feat(trip): complete controlled research execution flow`

- [ ] 16. Rehearse one complete trip and enter controlled trial
  What to do / Must NOT do: create a production-like fictitious trip, perform enrollment/payment/refund/roster/vehicle/guide/photo/evaluation/insurance flows, reconcile balances and document rollback/support. Do not expand traffic if any financial, roster, consent or permission discrepancy remains.
  Parallelization: Wave 4 | Blocked by: 11–12, 14–15 and controlled-trial inputs | Blocks: final verification
  References: `docs/项目计划与进度.md:58`, `docs/项目计划与进度.md:82`, `docs/开发保护与恢复规则.md:43`, `docs/开发保护与恢复规则.md:58`
  Acceptance criteria: all automated checks and real surface scenarios pass; system balance, WeChat statement, paid roster and refund ledger reconcile; backup restore and previous-version deployment are observed working.
  QA scenarios: happy, run `pnpm test:acceptance:controlled-trip` and drive every named role through browser/miniapp surfaces within the approved participant cap; run backup restore and previous-image rollback and record the observed version/data checks. Failure, run `pnpm test:release-gate -- --inject amount-mismatch` and assert rollout stops with the mismatched order/roster identifiers redacted. Evidence `.omo/evidence/task-16-linan-platform-bootstrap/`.
  Commit: Y | `chore(release): prepare controlled research trial`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: a fresh plan-compliance reviewer reads this plan plus every `.omo/evidence/task-*` artifact, reruns `npm run repo:verify` and the five root checks, and produces `.omo/evidence/final-F1-plan-compliance.md`; reject any unmet criterion or self-reported-only proof.
- [ ] F2. Code quality review: `omo:review-work` inspects the full baseline-to-candidate diff, migrations, state machines and test assertions, reruns `git diff --check`, `pnpm audit --prod --audit-level high` and the secret scan configured in Todo 4, then writes `.omo/evidence/final-F2-code-quality.md`; reject suppressions, duplicated authority, high/critical production vulnerabilities or unowned complexity.
- [ ] F3. Real manual QA: `omo:visual-qa` drives Playwright browser flows and `$env:WECHAT_DEVTOOLS_CLI`/miniapp automator flows for parent, admin, guide and export surfaces; real-device payment/refund observations use the authorized operator from the external gate. Capture loading, failure, permission and rollback states in `.omo/evidence/final-F3-manual-qa/`; reject any required surface not actually observed.
- [ ] F4. Scope fidelity: a fresh scope reviewer compares the candidate, `docs/项目计划与进度.md:7`, `docs/项目计划与进度.md:16`, `docs/项目计划与进度.md:67` and the contract-derived evidence; writes `.omo/evidence/final-F4-scope-fidelity.md`; reject scope creep, missing contractual items and any silent data/permission rule change.

## Commit strategy

- Use Conventional Commit-style messages defined in `.gitmessage` because this is a new repository with no inherited history style.
- Keep each todo's implementation, migration and direct tests in one atomic commit.
- Keep generated lockfiles with the scaffold/dependency commit that created them.
- Do not mix account values, environment secrets, customer data, exported workbooks or evidence into commits.
- Tag the accepted September 29 candidate, October 7 core delivery and October 15 controlled trial only after their gates pass.

## Success criteria

- Repository guards demonstrably block a secret-like file and an oversized file while accepting normal source changes.
- C-drive capacity is safe before dependency installation and retains at least 10GB free; E is optional and remains unused until its NTFS repair is independently verified.
- Three applications and shared contracts install, typecheck, test, build and run from a clean clone.
- A parent can enroll multiple participants, pay, and see the authoritative result; admin roster/statistics/export reconcile exactly.
- Real payment callback/query, next-day statement, refund and permission checks pass with redacted evidence.
- Guardian agreement versions and sensitive-data scopes are enforced at the API.
- The September 29 candidate, October 7 core delivery and October 15 controlled trial each pass their matching surface QA and have a tested rollback.
- No raw contract, real personal data, production secret, proprietary travel asset or unapproved-license source exists in Git history.
