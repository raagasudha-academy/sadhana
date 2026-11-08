# Sadhana Academy & Learning Portal — Modernisation Plan and Conversation Handover

**Updated:** 2 November 2026  
**Project:** Sadhana Academy & Learning Portal (Sruti and Raagasudha)  
**Local repository:** `~/Dev/sadhana` (macOS)  
**Current refactor branch:** `refactor/modular-architecture`  
**Baseline commit:** `5a7ebfb` — `chore: establish stable baseline before modularisation`  
**Baseline tag:** `baseline-before-modularisation`  
**Latest confirmed M2 commit:** `dbc6bcd` — `chore: establish architecture conventions and inventory`

> **Resume point:** M1 (architecture audit) is complete. M2.1 (conventions and automated inventory) has been committed and frontend verification passed. **Next: M2.2 — inspect CSS selectors and dependency order, then implement the first safe, focused filename / stylesheet consolidation commit.** Do not assume work after `dbc6bcd` has been committed unless confirmed by fresh Git output.

## 1. Project objectives and current product state

Sadhana is the administrative, teacher and family/student learning portal for the Sruti and Raagasudha academies. It includes website-registration approval/import, teacher and administrator management, families, enrolments, scheduling and venues, attendance/RSVP, practice, homework, guardian/student access and Cognito identities.

Recent working functionality to preserve:

- Website registrations, approvals, imports, family records, roll numbers, independent guardian-access approval and approved parent/child links.
- Parent/family dashboard with multiple linked children; correct **Parent/Child** relationship labels; student switching; RSVP persistence.
- Student sidebar navigation: **Dashboard**, **My classes**, **My learning**, **My academy**, **My profile**. Dashboard quick actions synchronize the corresponding sidebar highlighting.
- Student timetable: polished typography, responsive cards, correct current-week anchoring, seven-day previous/next navigation and Today action.
- Homework and practice workflows, teacher feedback and guarded file-upload rules.
- Admin/teacher role and academy-scoping security; website revocation protections.

Keep the working frontend, API routes, Cognito provisioning, DynamoDB records, Lambda deployment and authorisation semantics intact while restructuring.

## 2. Why modernise

Large, densely written components and overlapping global CSS have made seemingly small changes difficult. The goal is a **feature-based modular monolith**, not an immediate migration to independently deployed AWS microservices. Make modules comprehensible, testable and loosely coupled; introduce additional services/packages only if justified by ownership or deployment needs.

The initial repository audit found **148** tracked TypeScript/TSX/CSS source files across `src` and `backend/src`. The prior shell audit counted about **17,912 lines** of source. Largest files according to `docs/architecture/inventory.md` (line counters may differ by one from `wc`):

| Path | Inventory lines | Priority |
|---|---:|---|
| `src/RegistrationModule.tsx` | 3,149 | Highest complexity; refactor only after behavior-locking tests |
| `src/styles.css` | 2,858 | Global selector review and gradual feature ownership |
| `src/App.tsx` | 1,491 | Extract shell, navigation, view composition |
| `src/TeacherManagement.tsx` | 452 | Later feature extraction |
| `src/studentPortal.css` | 426 | Student styling consolidation |
| `backend/src/websiteRegistrationImport.ts` | 400 | Security-sensitive import workflow |
| `backend/src/lambda.ts` | 341 | Route composition; keep entrypoint |
| `backend/src/scheduleStore.ts` | 339 | Preserve schedule contracts |
| `backend/src/teacherDirectory.ts` | 335 | Preserve identity/permissions |
| `src/StudentHome.tsx` | 269 | Dense JSX and mixed dashboard/timetable/homework/practice logic |

**Important nuance:** `StudentHome.tsx` has few physical lines but is dense, so file length understates complexity. `docs/architecture/inventory.md` explicitly marks import counts as heuristic; do not treat the counts as an authoritative dependency graph.

## 3. Completed milestones

### M0 — Stable baseline (complete)

- Frontend and backend working baseline committed as `5a7ebfb` on the previous `feature/sadhana-v1-student-portal` branch.
- Local tag `baseline-before-modularisation` created.
- A clean working tree was reported immediately after baseline commit.

### M1 — Read-only architecture audit (complete)

- Surveyed source sizes, directories, scripts, imports, CSS dependencies and version-like filenames.
- Agreed to feature-based extraction, small commits and unchanged runtime contracts.

### M2.1 — Conventions and repeatable inventory (complete)

Committed as `dbc6bcd` on `refactor/modular-architecture`:

- `CONTRIBUTING.md`
- `scripts/auditArchitecture.mjs`
- `docs/architecture/inventory.md`

User ran frontend `npm run verify`; it passed through the Vite production build. Build output: **1,663 modules transformed**, CSS ~225.71 kB, JS ~733.42 kB (gzip ~200.91 kB). Vite warned that a chunk is over 500 kB; this is **not** a build failure and should be addressed later with measured lazy loading / bundle splitting, not by simply suppressing the warning. Backend checks were prescribed, but their execution for this exact M2.1 commit was **not explicitly shown**.

**Inventory provenance:** The generated inventory still prints `Git HEAD: 5a7ebfb` because the inventory was produced before the `dbc6bcd` commit; this is normal, not a contradiction. The current known latest commit is `dbc6bcd`.

## 4. Next action: M2.2 CSS and filename consolidation

The uploaded inventory identifies the following **version-like filenames** for careful review (do not blindly rename):

- `backend/scripts/verifyV074.ts`
- `src/accessV1274.css`
- `src/compactHeaderV1281.css`
- `src/familyCardsV096.css`
- `src/familyDashboardV1.css`
- `src/homeworkConfirmV1283.css`
- `src/homeworkV1278.css`
- `src/learningUXV1276.css`
- `src/rollRequestV1275.css`
- `src/studentNavigationV1277.css`

The inventory lists **no tracked backup or archive artifacts**.

`src/StudentHome.tsx` imports many global stylesheets, including `familyDashboardV1.css`, `studentTimetablePolish.css`, `studentUiFinish.css`, `studentNavigationExperience.css`, `studentExperience.css`, `studentPracticeRefined.css`, `practiceInsights.css`, `practiceUX.css`, `compactHeaderV1281.css`, `studentPortal.css`, `studentWorkspace.css`, `rollRequestV1275.css`, `learningUXV1276.css`, `studentNavigationV1277.css`, `embeddedCalendar.css`, `homeworkV1278.css`, `homeworkConfirmV1283.css`, `foundation.css`, `unifiedLayout.css`, `handoverLayout.css`, `workspaceLayout.css`, `shellPolish.css` and `academyDirectory.css`. **Order matters:** the styles likely rely on cascade overrides. `RegistrationModule.tsx` imports `registrationUxPolish.css`, `familyCardsV096.css` and `quickUnenrol.css`. `TeacherWorkspace.tsx` also imports `learningUXV1276.css` and `unifiedLayout.css`; `AccountAccess.tsx` imports `accessV1274.css`.

### M2.2 procedure

1. Verify branch, commit and clean status: `git branch --show-current`, `git log -1 --oneline`, `git status --short`.
2. Read `docs/architecture/inventory.md`, `CONTRIBUTING.md` and actual source CSS/imports; make an import/selector map, including shared CSS imported by multiple components.
3. Identify equivalent selectors, repeated declarations, global leakage and stylesheet order dependencies. Distinguish true duplicates from intentional later overrides.
4. Pick **one small, low-risk rename batch**, update *all* import/reference paths, and **preserve existing import order**. Prefer descriptive, feature-owned filenames (`FamilyDashboard.css` etc.) while avoiding collisions on case-insensitive macOS filesystems. Use `git mv` and verify cross-file import strings. Do not consolidate rules until visual regressions can be assessed.
5. Run `npm run verify` and `(cd backend && npm run check && npm run build)`; verify core UI paths with browser/manual or Playwright as appropriate, especially Family Dashboard, My classes/Timetable, My learning, TeacherWorkspace and Account Access.
6. Commit a single change with a precise message, e.g. `refactor(styles): standardize student stylesheet names`.
7. In a **separate** commit, progressively eliminate duplicated CSS selectors / relocate feature-owned styles, preserving specificity and behavior. Never bulk-delete styles on the basis of names or apparent redundancy.

**Note:** Since the complete local repo was not uploaded here, no code rename or CSS consolidation has been executed or verified yet. The next conversation should work from the real files (upload source files, a repository snapshot, or a connected repository branch); don't invent edits.

## 5. Full modernisation roadmap

| Milestone | Scope | Deliverable / acceptance gate |
|---|---|---|
| **M2 — Hygiene and boundaries** | Conventions, imports, CSS audit, meaningful filenames, feature folder scaffolding; remove only proven dead code | No behavior change; all builds/tests pass; clean focused commits |
| **M3 — Student portal extraction** | Split `StudentHome.tsx` into Family Dashboard, Timetable, Homework, Practice, Teachers/Academy, contextual navigation, student selection hooks | Five sidebar areas and nested navigation preserve state; RSVP, homework and practice still work; tests under `test/` |
| **M4 — Registration/family management** | Break up `RegistrationModule.tsx` into registration, student/family records, enrolment, approval/import UI and form/dialog components | No loss to family data, registration/import, roll-number allocation, guardian approvals, academy isolation |
| **M5 — App shell and styling** | Thin `App.tsx`; extract role-aware page registry, shell, navigation, common layout; complete CSS ownership | No access/role regression; View As and My profile remain distinct where intended; visual parity |
| **M6 — Backend modular routes** | Route groups per domain with same Lambda entrypoint; isolate domain services and infrastructure adapters | Keep API URLs, IAM/Cognito authorization, DynamoDB keys, Lambda packaging and deploy interface unchanged; backend tests pass |
| **M7 — Performance and delivery** | Profile duplicate family/learner requests, avoid unnecessary reloads when switching children/RSVP, lazy-load large pages, bundle analysis, CI and deployment checks | Measured improvement with no visible loading regressions; reproducible builds, no  unreviewed infrastructure changes |

Milestone ordering may adjust as dependency review reveals safer extraction boundaries. In particular, moving CSS imports or splitting App while preserving styling might need a small coordinated M3/M5 change.

## 6. Proposed target layout (illustrative, not created yet)

```text
sadhana/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── AppShell.tsx
│   │   └── navigation/
│   ├── features/
│   │   ├── registration/
│   │   ├── families/
│   │   ├── students/
│   │   ├── learning/
│   │   │   ├── dashboard/
│   │   │   ├── homework/
│   │   │   ├── practice/
│   │   │   └── timetable/
│   │   ├── calendar/
│   │   ├── attendance/
│   │   ├── teachers/
│   │   ├── administration/
│   │   └── profile/
│   ├── components/
│   ├── api/
│   ├── hooks/
│   ├── styles/
│   └── types/
├── backend/
│   ├── src/
│   │   ├── lambda.ts
│   │   ├── routes/
│   │   ├── modules/
│   │   ├── infrastructure/
│   │   └── shared/
│   └── test/
├── test/
├── scripts/
└── docs/architecture/
```

Retain current working entry points until a tested migration removes their old dependencies. Avoid a wholesale directory move.

## 7. Strict engineering and deployment rules

- **Never accidentally overwrite recent working UI changes.** Read current files, diff before edits, keep commits small and reviewable.
- Use Git for rollback. Do not create committed `.bak`, `backup`, `orig`, generated ZIP or source filenames like `V1234` for new work. Temporary external delivery archives are acceptable when necessary, but keep them **outside the repository**; user prefers direct normal filenames and Git changes.
- Keep regression tests under root `test/` or `backend/test/`, not scattered through `src`.
- Name components by feature/domain, not sprint/version. Use consistent casing for TS/TSX/CSS and avoid case-only renames on macOS without a two-step `git mv`.
- Do not change database schemas, allocation logic, registration/guardian permission checks, API response contracts or deployment setup under a structural refactor.
- Guardian access is separately administrator-approved. Relationship labels (`parent`/`child`) are **not** permission grants; academy-scoped access checks remain authoritative.
- Preserve Cognito identity linkage, website import/revocation fences and teacher/student permission boundaries.
- **Do not deploy AWS** unless a separate, explicit deployment step is agreed and verified. Previous Lambda packaging mistakes caused a temporary broken API. Current build produces `backend/dist/lambda.mjs` from `backend/src/lambda.ts`; preserve handler/bundle naming if/when deployment is considered.
- Use an observable test gate before and after each structural commit. Do not claim local verification was performed unless command output is provided.
- Avoid changing all CSS imports at once. CSS load order, selector specificity, responsiveness and role-specific visibility are critical.
- Keep `SadhanaMyProfile` behavior distinct from the learner's in-component profile route where the parent `App.tsx` intentionally renders the separate profile component.

## 8. Commands and diagnostics

```bash
cd ~/Dev/sadhana

git branch --show-current
git log -1 --oneline
git status --short

# Frontend verification
npm run verify

# Backend verification
(cd backend && npm run check && npm run build)

# Regenerate tracked inventory when appropriate
node scripts/auditArchitecture.mjs > docs/architecture/inventory.md

# CSS/import discovery
rg -n "import ['\"].*\.css" src
rg -n "V[0-9]+.*\.css|familyDashboardV1|learningUXV1276" src test
```

Root `npm run verify` runs ESLint, TypeScript, Vitest and Vite build. Backend `npm run check` runs backend TypeScript and Node/tsx tests, followed by `npm run build` bundling the Lambda with esbuild. The project also has Playwright end-to-end scripts (`npm run test:e2e`).

### Bundling warning / later performance work

Build was successful but emitted the Vite 500 kB chunk warning (`dist/assets/index-W0QEraX0.js` ~733.42 kB). Investigate `React.lazy`/dynamic imports at page boundaries and actual navigation performance in M7. Don't over-optimize M2 cosmetic/naming changes.

## 9. Specific context for student navigation and UX

The parent `App.tsx` controls sidebar state (`activePage` / `goPage`) and passes `page`, selected learner and an `onNavigate` callback to `StudentHome`. The mapping **sidebar → learner tab** (`learnerPageMap`) and **learner tab → sidebar** (`learnerSectionMap`) both exist after a TypeScript missing-name fix. The StudentHome `navigateTo(destination)` helper calls local `setTab` and parent `onNavigate`; dashboard quick actions must use `navigateTo`, not only `setTab`, or the sidebar highlight desynchronizes. Context-preserving tab logic retains a nested tab when remaining within the same parent sidebar section.

The timetable was recently polished: typography, session card wrapping and Week view anchored to current week. **These behaviors are already working and should not regress.** `App.tsx` renders `SadhanaMyProfile` when `activePage === 'My profile'`, rather than always routing to the StudentHome internal profile page.

Potential later performance issue: family linked-students calls may be duplicated between App and StudentHome; student dashboard detail and extras load include sequential stages. Treat performance changes as M7 with timings, caching/invalidations and academy/permissions considered.

## 10. How to continue in a new ChatGPT conversation

1. Upload this handover Markdown and `docs/architecture/inventory.md` (optional if the full repo is connected and can be inspected).
2. Share a fresh `git branch --show-current && git log -1 --oneline && git status --short` so the new conversation doesn't assume remote/local parity.
3. For actual code modifications, provide the relevant files or connect/push the correct repository branch. The prior connected GitHub repository did not expose the local `refactor/modular-architecture` branch; never edit an older remote branch based on assumptions.
4. Ask for **M2.2 implementation**, beginning with a CSS import/selector audit and the smallest safe rename batch. Request conventional filenames and diff/apply instructions rather than versioned patch artifacts.

### Copy/paste new-chat prompt

> Resume the **Sadhana Academy & Learning Portal Codebase Modernisation** from the attached `SADHANA_MODERNISATION_HANDOVER.md` and `docs/architecture/inventory.md`.
>
> We established the stable baseline at commit `5a7ebfb`, tagged `baseline-before-modularisation`, and are working on branch `refactor/modular-architecture`. M1 architecture audit is complete. M2.1 conventions/inventory was committed as `dbc6bcd`; frontend `npm run verify` passed. The inventory file's HEAD value `5a7ebfb` predates that commit.
>
> **Start M2.2 now:** inspect actual CSS files, stylesheet import order and shared selectors; plan and implement the first small, safe stylesheet renaming / consolidation change. Keep behavior, UI, Cognito permissions, website registration/import, family relationships, RSVP and timetable unchanged. Preserve API, Lambda and DynamoDB contracts; no AWS deployment. Make clear code changes with standard filenames, regression tests under `test/` or `backend/test/`, and Git-focused commits. Do not generate versioned backups or ZIP artifacts in the repo.
>
> Verify actual repo state and imports before editing. Show precisely what changed, how to apply it and which verification commands to run. Progress through M2 as small independently verifiable commits, then continue M3–M7 per the handover.

---

**Source of record:** The actual repository and its tests, not the illustrative target structure. This plan reflects the user-provided generated inventory dated `2026-11-02T21:20:14.201Z` and the latest confirmed terminal transcript through commit `dbc6bcd`.
