# Sadhana Academy & Learning Portal
## Master Roadmap & Requirements Register
**Baseline:** 2 November 2026 | **Scope:** Raagasudha and Śruti Vedam | **Status:** Working baseline; not a complete recovered historical specification

### How to use this register
- **Evidence:** `Confirmed` = explicitly discussed, demonstrated, or found in supplied source; `Historical context` = recorded in project conversation but not currently source-verified; `Needs source` = original requirement or contract has not yet been recovered.
- **Delivery state:** `Implemented / verified` includes a specified verification scope; `Implemented / acceptance pending` is not equivalent to production sign-off; `Planned` is not implemented; `Deferred` is consciously postponed.
- **Do not invent requirements:** Charu's purpose, interfaces, auth, data model, and ownership are **not yet confirmed**. Recover original design before implementing it.
- Update the **Decision log** whenever a requirement or priority changes. Never delete a requirement silently; mark `Superseded` and link the replacement.

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
| CORE-09 | Scheduling | Master classes, dated sessions, recurring rules, venue management | Implemented / acceptance pending | Project history, lambda routes | High | Dated-rule/venue regression |
| CORE-10 | Engineering | Source/test naming cleanup, regression suite, GitHub Pages workflow, Lambda ESM build | Implemented / check sync | User reports 175 backend tests and clean-up | High | Verify remote branch/deployed source parity |

## B. Previously identified workstreams / gaps
| ID | Area | Requirement | Delivery state | Evidence | Priority | Acceptance gate |
|---|---|---|---|---|---|---|
| INT-CHARU-01 | Charu | **Charu integration** explicitly identified as omitted from shortened roadmap | **Requirements recovery required** | User explicitly recalled prior requirements; no precise contract available in accessible sources | High | Locate original Charu requirement discussion and integration/API design before implementing |
| COM-01 | Communications | Academy-specific announcements | Planned | Previous App communications placeholder | Medium/High | Recipients/permissions, delivery audit and opt-out specification |
| COM-02 | Communications | WhatsApp delivery records and failed messages | Planned | App placeholder and prior roadmap | Medium/High | Provider contract, message states, failure/retry handling |
| COM-03 | Communications | Reminder Service integration/status | Planned | App placeholder | Medium/High | Confirm provider/API, consent, schedules and idempotency |
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

## C. Charu integration discovery checklist — unresolved, not assumptions
| Decision needed | Present state |
|---|---|
| What Charu is, and which users interact with it | Handover context says Charu provides WhatsApp practice assistance and its opt-in default is OFF. Exact user journeys, provider/API, data ownership, and operating responsibilities remain unknown; recover original discussion. |
| Integration purpose and user journeys | Unknown |
| Ownership of student, parent, teacher or learning records | Unknown |
| API/event endpoints, payloads, schemas, credentials | Unknown |
| Data direction and frequency; conflict/reconciliation rules | Unknown |
| Consent, safeguarding, retention and data permissions | Unknown |
| Error handling, replay/idempotency, test environment | Unknown |
| Rollout, rollback and operational monitoring | Unknown |

**Decision:** Charu is a high-priority workstream. The available handover only confirms the high-level practice/WhatsApp context and opt-in default; it is not a connector contract. Do not build a speculative integration. Reconcile original agreed specifications first. Mark recovered lines as Confirmed, unresolved decisions as Open.

## D. Next implementation bundle — proposed v13.10 Foundation & Acceptance
1. **Repository/deployment reconciliation:** ensure the locally fixed administrator-title code is committed and the frontend source branch aligns with published Pages; avoid destructive Git operations.
2. **Profile and directory regression:** title display, signed photo fallback/expiry, stable identity merge, fresh login photo, 3/2/1 responsive card columns.
3. **Access-isolation regression:** a Śruti-only account must not fetch Raagasudha records, dual accounts only see approved records, revoked guardian links fail every learner endpoint. Use negative tests; no permission expansion.
4. **Requirements recovery:** import original Charu and communications decisions into this register, with status/owner/acceptance criteria; implement Charu only after the contract is recovered.

### Out of bundle
No new role grants, direct Cognito group changes, parent link creation, record migration, automatic SMS enablement, or new Charu API endpoints without confirmed design.

## E. Delivery waves (order, not calendar promises)
| Wave | Milestone | Entry gate | Exit gate |
|---|---|---|---|
| 1 | v13.10 Foundation & Acceptance | Baseline verified | Profile/directory, security negative tests, clean commit/deploy parity |
| 2 | Charu requirements reconciliation | Original specification obtained | Confirmed architecture and acceptance tests |
| 3 | Charu integration implementation | Wave 2 approved | End-to-end tests, retry/observability, no access regression |
| 4 | Communications and reminder workflows | Provider and consent requirements approved | Delivery/failure audits and role checks |
| 5 | Consent, reports, learning operations | Priorities confirmed | Explicit acceptance for each module |
| 6 | v14.0 release readiness | Feature freeze | Cross-role E2E, mobile, security, rollback, monitoring |

## F. Decision log
| Date | Decision | Source / status |
|---|---|---|
| 2026-10-29 | Homework uploads limited to images/audio/video; documents shared using links | User decision; confirmed |
| 2026-11-02 | Keep SMS delivery in low-priority backlog | User decision; confirmed |
| 2026-11-02 | Staff directory separated by role, merged affiliations, three-card desktop grid and photographs | User acceptance; confirmed |
| 2026-11-02 | Administrator titles must reflect Cognito name | User acceptance after backend deployment; confirmed |
| 2026-11-02 | Keep Charu and earlier requirement gathering in master roadmap | User decision; confirmed |

## G. Progress update — 8 November 2026

- **Live admin navigation:** signed in to the published GitHub Pages portal using an administrator account and opened the dashboard, website registrations, families/students, timetable, practice/reports, communications, teachers, venues, administrators, account access, fees and settings. Read-only navigation only; no records were changed.
- **Live page behavior:** timetable settled to 316 dated entries, 16 master classes and 5 events. Practice & Reports briefly showed its initial empty state while requests were pending, then loaded 5 students, 3 enrolments, 1 practice entry, 1 RSVP and eligible class rosters. This is not a confirmed data mismatch, though an explicit loading state would improve clarity.
- **Feature status:** Communications, Fees and Settings open their planned-feature previews; they are not implemented workflows. Teacher and student account navigation and mobile/accessibility acceptance remain unchecked.
- **API regression work:** the working route matrix still inventories 158 method/path rows and is not complete behavioral coverage. New focused event validation/version cases are recorded in `backend/docs/api-coverage-audit.csv`. Current local verification: 391 backend TypeScript tests and 466 MJS tests pass; backend typecheck and bundle build pass. Frontend `npm run verify` passes lint, typecheck, 53 tests and Vite build. No Lambda or infrastructure deployment was made for these test/document changes.
- **Next action:** finish P0 behavioral gaps and security boundaries in the API audit, then complete profile/directory and access-isolation acceptance. Do not start speculative Charu, WhatsApp, reminder or consent integrations before their requirements and provider/privacy contracts are recovered.

## H. Source recovery procedure
1. Search past Sadhana/Charu chats, documents and design notes for exact `Charu`, `Reminder Service`, `WhatsApp`, `consent`, and `roadmap` discussions.
2. Transcribe requirements without reinterpretation, recording original wording and decisions in a separate Charu specification section.
3. Compare with current code and deployed endpoints; classify as Done / Partial / Pending / Deferred / Superseded.
4. Do not declare a wave complete from passing unit tests alone; record local build, deployment, API and user acceptance separately.

**Known gap:** This baseline uses currently accessible project context and provided files only. It is not an assertion that all historic project requirements have been recovered.
