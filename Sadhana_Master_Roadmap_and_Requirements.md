# Sadhana Academy & Learning Portal
## Master Roadmap & Requirements Register
**Baseline:** 2 November 2026 | **Updated:** 8 November 2026 | **Scope:** Raagasudha and Śruti Vedam | **Status:** Working baseline; not a complete recovered historical specification

### How to use this register
- **Evidence:** `Confirmed` = explicitly discussed, demonstrated, or found in supplied source; `Historical context` = recorded in project conversation but not currently source-verified; `Needs source` = original requirement or contract has not yet been recovered.
- **Delivery state:** `Implemented / verified` includes a specified verification scope; `Implemented / acceptance pending` is not equivalent to production sign-off; `Planned` is not implemented; `Deferred` is consciously postponed.
- **Do not invent requirements:** Charu's purpose and high-level user policies are now captured from [the Charu requirements baseline](docs/Sadhana_Charu_Requirements_v1.7.md). Its API, runtime, Sheets dependencies, and technical architecture are not verified against source. The document records requirements but does not authorize migration or integration.
- Update the **Decision log** whenever a requirement or priority changes. Never delete a requirement silently; mark `Superseded` and link the replacement.

## Current delivery snapshot — 8 November 2026

### Completed or verified

- Calendar API 503 fixes were deployed and the additional-session flow was live-tested.
- API endpoint inventory and regression work are in place. Local verification currently passes backend typecheck/build, 396 TypeScript tests, 473 MJS tests and 4 isolated HTTP API E2E scenarios. The 158-route matrix remains traceability, not proof of full behavioral coverage.
- Frontend verification currently passes lint, typecheck, 80 Vitest tests, Vite build and 51 Playwright tests across 36 screenshot baselines. The administrator portal was also reviewed live in read-only mode across its available sections.
- The notification bell and institution scope are now present for signed-in admin, teacher, student and guardian roles in local code. The feed and read state remain unconnected to a backend notification service; this UI change has not been deployed.
- Admin and teacher sidebars now link to the existing **My Profile** page; local role tests cover both links.
- Charu requirements v1.7 were recovered as a policy baseline. No Charu integration or migration was authorized.

### Remaining or awaiting acceptance

- Finish API behavioral and access-control coverage, including role permissions and academy isolation; verify each new DELETE operation.
- Complete live administrator, teacher, student and guardian UI acceptance, including broader responsive and accessibility checks.
- Reconcile unrelated local infrastructure/script changes before release; backend TypeScript/MJS regression tests now live under `backend/src/__tests__/`.
- Complete profile and directory acceptance, release parity, rollback and monitoring checks.
- Design and implement an academy learning library with student starter packs and syllabus/resources for Raagasudha and Śruti Vedam. Start with clear empty states for students and teachers; let administrators add, edit, update and publish academy resources. Confirm the useful document categories and upload rules with the academies before finalizing the structure.
- Simplify administrator navigation by grouping related pages into a small number of sections with contextual tabs; review the proposed layout with the user before implementation.
- **Before the production deployment:** write administrator and teacher user guides with release-matching screenshots. Decide later whether to deliver these as a tutorial site or a document.
- Resolve Charu's live dependencies, API/auth/write-back contract, consent and safeguarding requirements before considering integration.

This snapshot distinguishes completed local or live checks from work that still needs acceptance. A passing local suite does not by itself establish production readiness.

## A. Verified baseline
| ID | Area | Requirement / current finding | Delivery state | Evidence / limitation | Priority | Next action |
|---|---|---|---|---|---|---|
| CORE-01 | Registration | Raagasudha website submissions, approval/import, parent-child records, roll numbers | Implemented / acceptance pending | Project test history | Maintain | Regression against live workflow |
| CORE-02 | Identity | Cognito authenticated accounts, role-scoped academy APIs | Implemented / acceptance pending | Lambda and client supplied | Critical | Access matrix negative tests |
| CORE-03 | Guardian | Independent administrator review, linked child access, revocation | Implemented / acceptance pending | Project history and learner endpoints | Critical | Direct API denial tests |
| CORE-04 | Portal | Student/guardian dashboard, classes, profile, practice, attendance | Implemented / acceptance pending | StudentHome source | High | Cross-role UX checks |
| CORE-05 | Homework | Publish, submissions, evidence and teacher feedback endpoints | Implemented / acceptance pending | lambda and sadhanaClient source | High | End-to-end tests; preserve agreed media limits |
| CORE-06 | Directory | Academy teachers/admins, photos, combined affiliation labels, three desktop columns | Implemented / visually verified | Screenshots and live confirmation; academy-only isolation not independently tested | High | Security/mobile acceptance |
| CORE-07 | Admin title | Title preserved from Cognito `name` on directory | Implemented / user verified | Cognito values and successful redeployment | Maintain | Commit local change if not committed |
| CORE-08 | Staff photographs | Private S3 photo, signed URLs, linked staff identities | Implemented / visually verified | Supplied photo code; screenshots | High | Expiry and permission tests |
| CORE-09 | Scheduling | Master classes, dated sessions, recurring rules, venue management | Implemented / acceptance pending | Project history, lambda routes | High | Dated-rule regression; implement and verify the venue visibility policy in VENUE-01 |
| CORE-10 | Engineering | Source/test naming cleanup, regression suite, GitHub Pages workflow, Lambda ESM build | Implemented / check sync | User reports 175 backend tests and clean-up | High | Verify remote branch/deployed source parity |
| LEARN-01 | Learning library | Academy-specific syllabus and student starter packs for Raagasudha and Śruti Vedam, with flexible resource categories | UI and academy-scoped HTTPS-link API implemented locally; not deployed. Student view is read-only; administrators have CRUD, publish, and archive controls. Direct file uploads and teacher access remain follow-up decisions. | User request, 9 Nov 2026. | High | Verify the implementation, deploy through the guarded backend/frontend process, add approved resources, and decide direct file uploads and teacher read-only access |
| UX-03 | Administrator navigation | Group related administrator pages into clear sections with contextual tabs while keeping selected pages standalone | Draft revised per user feedback; not implemented | Keep Teachers, Administrators and Venues in the sidebar. People tabs, in order: Website Registrations, Account Access, Families & Students. Learning (classes/timetable, practice/reports, syllabus/resources) and Operations (communications, fees, settings) remain grouped; keep Dashboard and My Profile easy to reach. | Medium | Review the revised visual draft with the user; confirm responsive behavior, permissions, URLs and direct-link compatibility before implementation |
| VENUE-01 | Venue visibility | Teachers see venues assigned to them; designated exceptional event venues are visible to users across both institutions; other venues are visible only to related students and teachers | Requirement captured; implementation and access behavior not verified | User decision, 9 Nov 2026. Examples of exceptional event venues: Hindu temple events and Hanuman Chalisa events. Examples of institution-scoped venues: Durham, Middlesbrough and Newcastle. | High | Define the exceptional-event classification and student relationship rule; enforce scope in venue list/detail and scheduling APIs; add positive and cross-institution denial tests for both institutions and all roles |

## B. Previously identified workstreams / gaps
| ID | Area | Requirement | Delivery state | Evidence | Priority | Acceptance gate |
|---|---|---|---|---|---|---|
| INT-CHARU-01 | Charu | Replace Charu's Google Sheets dependencies with purpose-specific Sadhana APIs; preserve existing reminders, attendance replies, practice workflows and rollback until parity is accepted | Requirements captured; current-state discovery and technical contract pending. Integration/migration not authorized by requirements document. | [Charu requirements v1.7](docs/Sadhana_Charu_Requirements_v1.7.md) (8 Nov 2026); requirements are conversation-confirmed, while technical proposals are not code/runtime verified | High, after current P0 API security work | Inventory live sheets/jobs/triggers and Charu runtime; confirm API/auth/write-back contract, map workflows and test parity before any cutover |
| COM-01 | Communications | Academy-specific announcements | Planned | Previous App communications placeholder | Medium/High | Recipients/permissions, delivery audit and opt-out specification |
| COM-02 | Communications | Optional outbound Charu WhatsApp notifications from supported admin/teacher actions, with delivery history | Policy requirements captured; not implemented; provider/runtime contract and retention still open | Charu v1.7 confirms opt-in checkbox unchecked by default, generated preview, unique eligible recipient count, explicit confirmation, action-success-before-queue, teacher assigned-class scope, in-app independence and truthful delivery states | High, after API/security and provider/consent contracts | Confirm Charu transport/API, safeguarding/opt-out eligibility, approved templates, persistence/outbox, retries, status callbacks and retention |
| COM-03 | Communications | General Sadhana Notification Centre and any separate Reminder Service integration | Planned; distinct from Charu WhatsApp | Charu v1.7 distinguishes general Email/SMS channels from Charu WhatsApp; reminder provider/API is not specified | Medium/High | Confirm provider/API, consent, schedules, channel ownership and idempotency |
| CONSENT-01 | Privacy | Versioned notices, acknowledgements and privacy preferences | Planned | Student portal explicit placeholder | High | Guardian rights and audit/versioning approved |
| CONSENT-02 | Privacy | Recording/photo permissions by student | Planned | Prior scope discussion | High | Appropriate consent and revocation implementation |
| REPORT-01 | Insights | Academy attendance/enrolment/practice/homework reports | Planned | Prior roadmap | Medium | Roles, institution filters and exports spec |
| UX-01 | Profiles | Photograph hydration immediately on fresh login | Acceptance pending | Previously identified behaviour | High | Fresh-sign-in check |
| UX-02 | UI | Responsive mobile/tablet and accessibility regression | Acceptance pending | Directory desktop accepted | High | Live cross-device tests |
| SEC-01 | Access | Śruti-only, Raagasudha-only and dual-academy boundaries | Acceptance pending | Directory API enforces learner links; user acceptance pending | Critical | Deny unintended academy via direct URLs |
| SEC-02 | Access | Guardian revocation blocks live data across endpoints | Acceptance pending | Prior revocation tests | Critical | Comprehensive negative suite |
| OPS-01 | Release | Runbooks, rollback, deployment parity, monitoring | Planned | Existing manual Lambda and Actions deployment | Critical | Reproducible guarded deployment |
| SMS-01 | Account | SMS phone verification production delivery | **Deferred** | AWS Cognito `SNSSandbox`, account `SANDBOX`; user deferred | Low | Exit sandbox, UK sender compliance, delivery tests |
| SMS-02 | Account | Synchronise verified contact number only after confirmation | **Deferred** | Prior discussion | Low | No premature mutation of contacts |
| DOC-01 | Homework | Document upload | **Deferred / out of current scope** | Explicit user decision; use instructions links | Low | Reconsider only when needed |
| DOC-02 | Release documentation | Admin and teacher user guides with screenshots for common workflows | Planned; required before production deployment. Delivery format (tutorial site or document) undecided. | User decision, 8 Nov 2026 | High, pre-production | Prepare role-specific, task-based guidance with screenshots matching the release; choose and review the delivery format before production sign-off |

## C. Charu requirements recovery and technical discovery

Requirements source recovered: [Sadhana_Charu_Requirements_v1.7.md](docs/Sadhana_Charu_Requirements_v1.7.md), copied from the supplied document with only trailing-whitespace normalization and updated 8 November 2026. It consolidates agreed conversation decisions, separates proposed technical design from confirmed policy, and explicitly states that it does not authorize migration or integration. Requirements are not evidence of implementation.

### Captured policy and scope

- Sadhana is intended to become Charu's authoritative source for academy data; Google Sheets dependencies should be retired only after workflow parity, acceptance and rollback are established.
- Existing class attendance reminders/replies, class reports/teacher confirmation, practice reminders/logging, schedules, holidays/reschedules and identity mapping must be inventoried and preserved during migration.
- Charu outbound messages use WhatsApp, not SMS. General Sadhana Email/SMS and Cognito phone verification are separate concerns.
- Supported admin/teacher actions may offer a WhatsApp option, unchecked by default. The backend resolves eligible unique recipients; the user sees a generated preview/count and explicitly confirms. Queue only after the underlying action succeeds; retain in-app notifications if WhatsApp fails.
- Teachers may message only their assigned classes. Both guardian and student may be recipients only when individually eligible and authorised; shared numbers receive one campaign message. Verified phone alone is not consent or safeguarding permission.
- The in-app Charu chat widget remains paused until Sheets migration and existing automations are stable and validated.

### Open implementation contracts — not confirmed by the requirements document

| Decision needed | Present state |
|---|---|
| Live Google Sheets inventory, tabs, columns, formulas, cron jobs, triggers, and write-backs | Not supplied; discover from the actual Charu environment |
| Charu runtime, WhatsApp provider/library, hosting, queues and persistence | Not supplied; inspect current runtime before designing an adapter |
| API endpoints, service authentication/scopes, payloads, webhooks, errors and limits | Open; the example payload in v1.7 is illustrative only and is not an existing API contract |
| Attendance/practice reply formats and authorised write-back | Open; map every inbound workflow and identity join |
| Recipient age/safeguarding, consent, opt-out and student-direct-message policy | Open; verified phone is insufficient proof of WhatsApp eligibility |
| Approved message templates, branding and provider delivery statuses | Open |
| Retention/deletion for message bodies, notifications and delivery/audit history | Open |
| Retry, alerting, reconciliation, rate limits and cutover/rollback ownership | Proposed direction captured; actual operational design and owners are open |
| Database cleanup dependency | v1.7 mentions a selective test-data cleanup as a dependency, but it requires a separate inventory, dry run and explicit approval; it is outside this roadmap's authorized work |

**Decision:** use v1.7 as the recovered requirements baseline. Treat its high-level policies as agreed requirements, its technical architecture as a proposal, and all unspecified contracts as open. Do not implement endpoints, migrate Sheets, change AWS/database state, or disable existing jobs based on this document alone.

## D. Next implementation bundle — proposed v13.10 Foundation & Acceptance
1. **Repository/deployment reconciliation:** ensure the locally fixed administrator-title code is committed and the frontend source branch aligns with published Pages; avoid destructive Git operations.
2. **Profile and directory regression:** title display, signed photo fallback/expiry, stable identity merge, fresh login photo, 3/2/1 responsive card columns.
3. **Access-isolation regression:** a Śruti-only account must not fetch Raagasudha records, dual accounts only see approved records, revoked guardian links fail every learner endpoint. Use negative tests; no permission expansion.
4. **Charu discovery after API P0:** inventory the live Sheets/runtime dependencies; document identity/data mappings, all workflows and API/write-back contracts; verify safeguarding, consent, templates, delivery states, rollback and owners. Implement only after these gates are reviewed.

### Out of bundle
No new role grants, direct Cognito group changes, parent link creation, record migration/cleanup, disabling Sheets jobs, automatic SMS enablement, or new Charu API endpoints without confirmed design and explicit authorization.

## E. Delivery waves (order, not calendar promises)
| Wave | Milestone | Entry gate | Exit gate |
|---|---|---|---|
| 1 | v13.10 Foundation & Acceptance | Baseline verified | Profile/directory, security negative tests, clean commit/deploy parity |
| 2 | Charu current-state discovery and contract | API P0 security work complete; access to Charu/Sheets inventory | Dependency inventory, API/auth/write-back contract, workflow mapping, safeguarding and rollback plan reviewed |
| 3 | Charu migration and WhatsApp implementation | Wave 2 contract approved and implementation separately authorized | Workflow-by-workflow parity, notifications meet NOTIF acceptance tests, retries/observability, no access regression |
| 4 | General communications and reminder workflows | Provider and consent requirements approved; separate from Charu WhatsApp | Delivery/failure audits and role checks |
| 5 | Consent, reports, learning operations | Priorities confirmed | Explicit acceptance for each module |
| 6 | v14.0 release readiness | Feature freeze | Cross-role E2E, mobile, security, rollback, monitoring, and approved administrator/teacher guides with release-matching screenshots completed before production deployment |

## F. Decision log
| Date | Decision | Source / status |
|---|---|---|
| 2026-10-29 | Homework uploads limited to images/audio/video; documents shared using links | User decision; confirmed |
| 2026-11-02 | Keep SMS delivery in low-priority backlog | User decision; confirmed |
| 2026-11-02 | Staff directory separated by role, merged affiliations, three-card desktop grid and photographs | User acceptance; confirmed |
| 2026-11-02 | Administrator titles must reflect Cognito name | User acceptance after backend deployment; confirmed |
| 2026-11-02 | Keep Charu and earlier requirement gathering in master roadmap | User decision; confirmed |
| 2026-11-08 | Adopt `docs/Sadhana_Charu_Requirements_v1.7.md` as the recovered conversation-requirements baseline; distinguish confirmed policy from proposed technical design | User-supplied document copied with trailing-whitespace normalization; migration/integration explicitly not authorized by the document |
| 2026-11-08 | Add administrator and teacher user guides with screenshots as a required pre-production task; defer site-versus-document format decision | User decision |

## G. Progress update — 8 November 2026

- **Live admin navigation:** signed in to the published GitHub Pages portal using an administrator account and opened the dashboard, website registrations, families/students, timetable, practice/reports, communications, teachers, venues, administrators, account access, fees and settings. Read-only navigation only; no records were changed.
- **Live page behavior:** timetable settled to 316 dated entries, 16 master classes and 5 events. Practice & Reports briefly showed its initial empty state while requests were pending, then loaded 5 students, 3 enrolments, 1 practice entry, 1 RSVP and eligible class rosters. This is not a confirmed data mismatch, though an explicit loading state would improve clarity.
- **Feature status:** Communications, Fees and Settings open their planned-feature previews; they are not implemented workflows. Teacher and student account navigation and mobile/accessibility acceptance remain unchecked.
- **API regression work:** the working route matrix inventories 158 method/path rows and is not complete behavioral coverage. The coverage gate verifies that each row points to an executable test file, but important per-route security, validation, audit and mutation assertions remain open. Current local verification: 396 backend TypeScript tests, 473 MJS tests, 4 backend HTTP E2E scenarios, 80 frontend unit tests and 51 Playwright tests pass; frontend lint/typecheck/build and backend typecheck/build pass. The latest notification and profile-navigation UI changes are local only and were not deployed.
- **Charu requirements:** recovered and reconciled from [docs/Sadhana_Charu_Requirements_v1.7.md](docs/Sadhana_Charu_Requirements_v1.7.md). Confirmed user policies are recorded separately from proposed architecture and open runtime/API/Sheets/consent contracts. This document does not authorize integration or migration.
- **Next action:** finish P0 behavioral gaps and security boundaries in the API audit, then complete profile/directory and access-isolation acceptance. Charu live dependency/API discovery follows; no implementation or cutover until its open contracts are resolved and separately authorized.

## H. Source recovery procedure
1. Treat `docs/Sadhana_Charu_Requirements_v1.7.md` as the consolidated conversation baseline; check for later decisions before changing confirmed policy.
2. Recover the live Charu/Sheets/runtime facts and resolve the open API, consent, safeguarding, retention, template and operations contracts without assuming the proposed design is implemented.
3. Compare the confirmed requirements with current code and deployed endpoints; classify each as Done / Partial / Pending / Deferred / Superseded.
4. Do not declare a wave complete from passing unit tests alone; record local build, deployment, API and user acceptance separately.

**Known gap:** Charu conversation requirements are now captured, but the live integration specification, dependency inventory, and full historic Sadhana requirements may still be incomplete.
