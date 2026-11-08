# Sadhana ↔ Charu Integration — Requirements Register

**Version:** 1.7 (consolidated working specification)
**Updated:** 8 November 2026
**Systems:** Sadhana Academy Portal (Sruti and Raagasudha), Charu WhatsApp assistant
**Implementation status:** Requirements captured; migration/integration not authorised by this document
**Source:** Decisions gathered in the Sadhana project conversations

> **Scope note:** Charu is integrated with **WhatsApp**, not conventional SMS. Earlier references to “Charu SMS” are superseded by “Charu WhatsApp”. Cognito phone-number verification is a **separate** authentication requirement, not proof that a number can receive WhatsApp messages.
>
> **Status note:** “Confirmed” means agreed in conversation, not implemented or committed to a repository. Some requirements below are technical design proposals derived from those decisions and need validation against the current code and Charu runtime.

## 1. Objectives and agreed scope

1. Make **Sadhana the authoritative source** of student, guardian, class, timetable, event, enrolment, attendance and practice information that Charu needs.
2. **Replace Charu's existing Google Sheets dependencies** through secure, purpose-specific Sadhana APIs, without interrupting existing reminder and attendance workflows.
3. Add **optional outbound WhatsApp notifications via Charu** to relevant Sadhana admin/teacher action modals.
4. Preserve **in-app notifications** independently of WhatsApp delivery.
5. **Pause the in-app Charu chat widget** until the underlying Sheets-to-Sadhana migration is complete and validated.

### Scope boundaries

**In scope:** dependency inventory; data mapping; integration security; read APIs and authorised write-back for WhatsApp replies; WhatsApp notification UX; recipient policy; delivery tracking; regression and cutover checks.

**Out of scope for now:** in-app Charu chat assistant; curriculum/progression functionality; a new independent AI chat service; wholesale DynamoDB access for Charu.

## 2. Requirements register — Charu migration

| ID | Requirement | Status | Acceptance / implementation intent |
|---|---|---|---|
| CHARU-01 | Sadhana is the authoritative academy data source for Charu. | **Confirmed** | Charu obtains current academy data through Sadhana rather than treating Sheets as master. |
| CHARU-02 | Inventory every Google Sheets dependency. | **Planned / required** | Record each sheet, tab, column, lookup, class key, schedule, trigger, reminder and write-back operation. |
| CHARU-03 | Replace Google Sheets lookups with secure Sadhana API access. | **Confirmed direction** | Use purpose-specific backend endpoints, not browser calls or direct database credentials. |
| CHARU-04 | Preserve institution, role and user boundaries. | **Confirmed** | Charu cannot access or change records outside its authorised operation and institution. |
| CHARU-05 | Validate parity before switching workflows. | **Confirmed** | Compare legacy and Sadhana outputs for classes, recipients, schedule rules and replies; resolve discrepancies before cutover. |
| CHARU-06 | Retire legacy Sheets dependencies only after successful migration. | **Confirmed** | No Sheets job is disabled until the corresponding replacement is verified and rollback is available. |
| CHAT-01 | Embed interactive Charu chat widget in Sadhana. | **Paused / deferred** | Revisit only after data migration and existing automation workflows are stable. |

### Existing Charu behaviours to preserve during migration

The following are **existing or previously discussed behaviours requiring inventory and verification**, not assumptions that every path currently works correctly:

- Class-attendance reminders ahead of scheduled sessions, including family-level reminders and per-child RSVP/attendance replies.
- Class/teacher confirmation and class reports, including the previously discussed teacher confirmation after the session and auto-assume-held behaviour.
- Scheduled practice reminders, practice reports and practice logging.
- Institution/class-specific reminder schedules, potentially defined by current cron expressions.
- Correct handling of holidays, cancellations, rescheduling, class changes, teacher reassignment and time zones.
- Practice logging restrictions where applicable (for example, one daily practice record per student per institution and eligibility checks for manual logging).
- Correct identity mapping between WhatsApp contact, guardian/student, enrolment, class and institution.

**Migration acceptance:** each active workflow must be identified, mapped to Sadhana entities, tested against real schedules and explicitly signed off before the corresponding Sheets dependency is removed.

## 3. Requirements register — notifications and WhatsApp

The IDs below retain the numbering used in our conversation. NOTIF-01–10 belong to the wider Sadhana Notification Centre baseline and are summarised separately in §5.

| ID | Requirement | Status | Acceptance / expected behaviour |
|---|---|---|---|
| NOTIF-11 | Show **“Also send WhatsApp notification via Charu”** at the bottom of relevant admin/teacher modals. | **Confirmed** | Visible only on supported actions to authorised users. |
| NOTIF-12 | Dispatch only after the underlying action succeeds. | **Confirmed** | Failed save/publish/cancel must not enqueue a message. |
| NOTIF-13 | Resolve recipients from affected classes, events, enrolments and family links. | **Confirmed** | Server-side recipient query, not browser-supplied phone lists. |
| NOTIF-14 | Send only to eligible, authorised recipients with verified numbers. | **Confirmed principle** | Check student/guardian authorisation and WhatsApp eligibility/consent, not merely Cognito verification. |
| NOTIF-15 | Show generated message preview and recipient count. | **Confirmed** | Recipient count represents **unique eligible WhatsApp destinations**. |
| NOTIF-16 | Prevent accidental duplicate messages. | **Confirmed** | Deduplicate shared numbers and repeated requests within the same campaign while retaining per-student context. |
| NOTIF-17 | Track delivery attempts and outcomes. | **Confirmed** | Record queued/submitted/delivered/failed when the Charu transport supports them; do not equate submitted with delivered. |
| NOTIF-18 | Enforce sender permissions. | **Confirmed** | Teachers only their assigned classes; admins only their authorised institution/scope. |
| NOTIF-19 | Keep in-app notification even if WhatsApp fails. | **Confirmed** | In-app history persists separately from the outbound job. |
| NOTIF-20 | Connect Sadhana to Charu through the backend. | **Proposed technical requirement** | No exposed provider credentials or direct Charu access from the frontend. |
| NOTIF-21 | Use reliable retries, rate limits and monitoring. | **Proposed technical requirement** | Bounded retry, failure logging, alerting and dead-letter handling as applicable. |
| NOTIF-22 | Preserve message and delivery history subject to retention policy. | **Confirmed direction; retention open** | History queryable by authorised users; retention/deletion rules still to be defined. |
| NOTIF-23 | **Both parent and student** receive WhatsApp when both have verified, authorised numbers. | **Confirmed** | If only one is eligible, send to that person; identical numbers get one message per campaign. |
| NOTIF-24 | WhatsApp checkbox starts **unchecked**. | **Confirmed** | Each new modal opens with optional WhatsApp sending disabled. |
| NOTIF-25 | Assigned teachers may send announcements immediately. | **Confirmed** | No blanket admin-approval step for announcements to their own assigned classes. |
| NOTIF-26 | Automatically generate WhatsApp text, with preview. | **Confirmed** | Derived from announcement/action details; no separate editable text is part of the agreed baseline. |
| NOTIF-27 | Show recipient count and require explicit send confirmation. | **Confirmed** | Confirm after reviewing preview and resolved recipients before dispatch. |
| NOTIF-28 | Charu delivery channel is **WhatsApp**, not SMS. | **Confirmed correction** | UI labels, APIs, audit fields and documentation use WhatsApp terminology. |

## 4. Supported actions and role permissions

| Sadhana action | In-app notification | Optional Charu WhatsApp | Authorised initiator / audience |
|---|---|---|---|
| Create/publish event | Yes | Yes | Authorised admin or event-capable teacher → affected participants |
| Edit relevant published event details | Yes | Yes | Authorised admin/teacher → affected participants |
| Cancel event | Yes | Yes | Authorised admin/teacher → registered participants |
| Reschedule class | Yes | Yes | Admin or assigned teacher → affected enrolments/guardians |
| Cancel class | Yes | Yes | Admin or assigned teacher → affected enrolments/guardians |
| Change venue/location | Yes | Yes | Admin or assigned teacher → affected class/event participants |
| Administrator announcement | Yes | Yes | Admin → selected authorised institution/classes/groups |
| Teacher announcement | Yes | Yes | Assigned teacher → own assigned class(es) |

**Guardrails:** All role checks must occur on the server; the ability to open or modify a modal is not authorisation to send to arbitrary classes or numbers. Notifications should be scoped by institution and relevant relationships.

## 5. Sadhana Notification Centre baseline (related requirements)

These pre-existing requirements are distinct from the Charu outbound WhatsApp layer:

| ID | Requirement | Agreed position |
|---|---|---|
| NOTIF-01 | Email and SMS delivery available as Sadhana notification channels | Previously agreed for general notifications; **not** Charu's transport. Needs a separate delivery-provider plan. |
| NOTIF-02 | Admin chooses notification channel by type | Confirmed. |
| NOTIF-03 | Track failures and prevent duplicate sends | Proposed reliability requirement. |
| NOTIF-04 | Notification bell for teachers, students and parents | Confirmed direction; admin bell already exists. |
| NOTIF-05 | Unread count on bell | Confirmed. |
| NOTIF-06 | Mark one or all notifications as read | Confirmed. |
| NOTIF-07 | Notification links to the relevant entity/page | Confirmed. |
| NOTIF-08 | Institution, user and linked-child access scoping | Confirmed. |
| NOTIF-09 | Reuse existing admin notification infrastructure | Confirmed direction. |
| NOTIF-10 | Keep full notification history, with older items accessible | **Explicitly confirmed.** Subject to later lawful retention/deletion policy. |

**Channel clarification:** General SMS (if retained as a future Sadhana channel) is not delivered by Charu. The Charu integration described here sends WhatsApp messages. Mandatory Cognito phone verification is an authentication workflow and remains separate.

## 6. Confirmed WhatsApp recipient policy

**NOTIF-23:** Notify both parent/guardian and student where each has a verified phone number **and is an authorised WhatsApp recipient**.

| Guardian number | Student number | Expected outcome |
|---|---|---|
| Verified and eligible | Verified and eligible, different numbers | One message to each |
| Verified and eligible | Unverified/ineligible | Guardian only |
| Unverified/ineligible | Verified and eligible | Student only, if student direct messaging is permitted |
| Unverified/ineligible | Unverified/ineligible | No WhatsApp; keep in-app notification and record why |
| Same eligible verified number | Same eligible verified number | One WhatsApp message per campaign to that number |

**Safeguarding detail pending:** A verified number does not itself establish parental consent or permission to contact a minor directly. Apply age/safeguarding, guardian permissions and applicable messaging consent/opt-out rules before delivery.

## 7. Agreed modal behaviour

1. An admin/authorised teacher opens a supported create/update/cancel/announcement modal.
2. The **“Also send WhatsApp notification via Charu”** checkbox is **unchecked by default**.
3. The underlying action produces the appropriate **in-app** notification independently.
4. If the checkbox is checked, Sadhana resolves **eligible unique recipients** and automatically generates a WhatsApp preview.
5. The interface displays the **recipient count** and requests explicit confirmation before proceeding.
6. Sadhana authorises and persists the underlying action.
7. **Only after a successful action**, Sadhana records/queues the corresponding WhatsApp campaign.
8. Charu delivers asynchronously; delivery results and failures are recorded.
9. Failed WhatsApp delivery does **not** roll back the saved action or erase the in-app notification.

**Suggested checkbox label:** `Also send WhatsApp notification via Charu`.

### Illustrative request payload — design only

```json
{
  "action": "CLASS_CANCEL",
  "institutionId": "<institution-id>",
  "classId": "<class-uuid>",
  "occurrenceId": "<occurrence-uuid>",
  "reason": "Teacher unavailable",
  "notifications": {
    "inApp": true,
    "sendWhatsApp": true,
    "provider": "CHARU"
  },
  "idempotencyKey": "<unique-action-request-key>"
}
```

This is **not** an existing verified Charu endpoint or payload. The backend must derive recipients and reject unauthorised targets.

## 8. Architecture and data mapping

```text
Sadhana Portal (admin / teacher action)
    |
    v
Sadhana API (Cognito auth, role and institution authorisation)
    |
    +-- persist classes/events/announcements and in-app notifications
    |
    +-- durable notification job / outbox
              |
              v
       Charu integration adapter
              |
              v
           WhatsApp
              |
              v
     delivery status / inbound replies
              |
              v
       authorised Sadhana APIs
```

Charu should consume only what each job requires and never access DynamoDB with unrestricted credentials.

| Legacy Sheets concern | Sadhana logical domain / replacement |
|---|---|
| Student profile and verified contact mapping | **People** |
| Parents, children and guardian permissions | **People + Families** |
| Class membership, teacher allocation | **Academy** (classes, enrolments, assignments) |
| Timetables and dated sessions | **Scheduling** |
| Attendance responses and class reports | **Attendance + Scheduling** |
| Practice reminders and entries | **Attendance / Practice** |
| Event invitations and changes | **Events** |
| Notification campaigns and delivery history | **Notifications** |
| Integration mapping and failures | **Integrations / Audit** |

**Database programme dependency:** The Sadhana database rationalisation and selective pre-launch data reset must preserve institutions, admins, teachers, classes, venues, teacher assignments, class schedules/occurrences, events and configuration. Student-related test data is planned for selective removal only after inventory, backup, dry-run manifest and explicit approval.

## 9. Technical constraints and non-functional requirements

- **Security:** authenticate Charu requests; use narrow scopes/service credentials; validate teacher assignments and institution boundaries server-side.
- **Identity:** map WhatsApp numbers to eligible People/Family records; use canonical Sadhana identifiers and maintain legacy mapping during transition.
- **Reliability:** durable outbox/queue; idempotency for action and campaign; retries with caps; dead-letter or review queue; observable error states.
- **Delivery truthfulness:** distinguish queued, provider-accepted, delivered and failed statuses according to the provider's actual capabilities.
- **Privacy:** avoid exporting unnecessary personal data; apply consent, opt-out, safeguarding and retention rules; keep secrets out of the frontend.
- **Operations:** log who initiated messages, for which institution/class/event, recipient counts, failures and delivery state, without unnecessarily exposing message content to unrelated roles.
- **Time handling:** process schedules using the intended class/local timezone and daylight-saving rules; do not rely on server-local times.
- **Performance:** avoid expensive full-table scans for recipient discovery; use validated queries/indexes and bounded batch sizes.
- **Backward compatibility:** keep existing Charu reminders functioning until each migrated workflow passes parity tests.

## 10. Acceptance test checklist

- [ ] Checkbox begins unchecked in every supported modal.
- [ ] A normal save with checkbox unchecked creates no WhatsApp job.
- [ ] With checkbox checked, preview contains the correct event/class details.
- [ ] Preview displays a correct count of **unique eligible recipients**.
- [ ] Explicit confirmation is required before sending.
- [ ] A failed save/publish/cancel creates no WhatsApp job.
- [ ] An assigned teacher can message their own class immediately.
- [ ] A teacher cannot target another teacher's class by manipulating an API request.
- [ ] An admin cannot message users outside their authorised institution.
- [ ] Both parent and student receive when both are eligible at different numbers.
- [ ] Only one message is sent when guardian/student share a destination number.
- [ ] Repeated Save requests cannot duplicate a campaign or deliveries.
- [ ] WhatsApp failure does not remove in-app notifications or undo saved changes.
- [ ] Provider-accepted is not incorrectly displayed as delivered.
- [ ] Full in-app notification history remains available to the authorised recipient.
- [ ] Existing class reminders still target the correct family and date after migration.
- [ ] Attendance replies are linked to the right child and class occurrence.
- [ ] Practice reminders/logging preserve existing frequency and eligibility rules.
- [ ] Cancelled or rescheduled sessions do not receive stale reminders.
- [ ] Cross-institution data access is rejected.
- [ ] Every migrated Sheets workflow has a documented parity result and rollback method.

## 11. Open questions / technical discovery

| Topic | Pending item | Why it matters |
|---|---|---|
| Charu API | Endpoint(s), authentication, payloads, events/webhooks, error codes and rate limits | Cannot implement an adapter responsibly without the actual contract. |
| Current Charu runtime | Hosting, jobs, WhatsApp library/provider, queues, persistence, retry patterns | Reuse existing capabilities where safe. |
| Sheets inventory | All sheet IDs, tabs, columns, cron jobs, triggers and write paths | Required to avoid silent regression. |
| Two-way messaging | Exact WhatsApp reply formats, attendance response handling and practice write-back | Read APIs alone are insufficient. |
| Recipient eligibility | Consent/opt-out, student age/safeguarding, guardian authorisation, shared numbers | Verified phone != WhatsApp permission. |
| Notification provider | What delivers general Sadhana SMS/email versus Charu WhatsApp | Keep channel contracts separate. |
| Message templates | Approved formats, placeholders, length and institution branding | Need consistent and safe outbound messages. |
| Delivery tracking | Which message statuses Charu actually exposes | Avoid invented delivery confirmation. |
| Failure policy | Retry limits, alerts, reconciliation ownership, fallback procedures | Prevent duplicates and undetected misses. |
| Cutover order | Class-by-class vs institution-by-institution migration | Choose based on actual workflow coupling and risk. |
| History/retention | How long to keep message bodies, delivery logs, inbox history and audit trails | Full user-visible history must coexist with legal retention/deletion duties. |
| Phone updates | How new/changed verified numbers propagate to Charu eligibility | Prevent stale recipient lists. |

## 12. Sequencing and dependencies

| Order | Workstream | Deliverable / exit criterion |
|---|---|---|
| 1 | **Sadhana database readiness** | Stable source-of-truth entities, protected academy data, validated cleanup of approved student test records. |
| 2 | **Charu Sheets audit** | Complete live dependency and schedule inventory. |
| 3 | **API and identity mapping** | Secure read paths and required authorised write-back, with tests. |
| 4 | **Workflow-by-workflow migration** | Attendance, reminders, practice and replies pass parity checks. |
| 5 | **WhatsApp modal notifications** | Supported events, changes and announcements meet NOTIF-11–28 acceptance tests. |
| 6 | **Cutover/monitoring** | Sheets jobs retired only after validated replacement, recovery and monitoring. |
| Later | **Chat widget** | Remains paused until Charu migration is stable and separately prioritised. |

**Roadmap alignment:** Charu modernisation and WhatsApp were previously planned for the post-M6 integration phase, approximately M9 under the accelerated roadmap. Dates remain provisional and dependent on the actual Charu implementation and database readiness.

## 13. Explicitly agreed decisions — quick reference

1. **Use WhatsApp, not SMS, for Charu outbound messages.**
2. **Sadhana replaces Google Sheets as Charu's academy data source.**
3. **Parent and student both receive** when both have verified, eligible, authorised WhatsApp numbers.
4. **Checkbox is unchecked by default.**
5. **Teachers can immediately send** announcements to their assigned classes.
6. **Message is generated automatically** and presented in a preview.
7. **Recipient count and explicit confirmation** are required before sending.
8. **In-app notifications persist** even when WhatsApp fails.
9. **Full notification history** must be accessible, subject to retention policy.
10. **Chat widget stays paused** until Charu's Google Sheets reliance is removed and the replacement is validated.

---

### Document control

- **State:** Consolidated conversation requirements; not a codebase-backed implementation specification.
- **Approved changes to AWS, database or Charu:** **None** through this document.
- **Next artefact:** Charu current-state dependency inventory + endpoint/API contract + workflow mapping table.
- **Change control:** Any modification to confirmed user policies above should be recorded as a new register revision before implementation.
