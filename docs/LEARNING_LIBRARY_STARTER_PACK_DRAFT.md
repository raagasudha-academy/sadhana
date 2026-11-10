# Learning library and student starter pack — draft

**Status:** implemented locally; academy-scoped HTTPS resource links have API and UI support. Not deployed.

## Student and family view

Add **My Syllabus** as a standalone student navigation page, separate from **My learning**. A family account sees a separate pack for each selected child. Resources are scoped to the current academy, so Raagasudha and Śruti Vedam content never appears in the other academy's pack.

Show a compact welcome panel, then resource cards grouped by category:

- **Syllabus** — course outline, levels and progression.
- **Getting started** — welcome notes and what to bring or practise first.
- **Practice resources** — reference sheets, recordings and exercises.
- **Policies & forms** — academy documents relevant to learners and families.

Each card shows its title, short description, version label when provided, and an **Open resource** action. An empty category stays hidden. If the academy has not published resources, show: “Your starter pack will appear here when it is ready.”

## Teacher view

Teacher read-only access is a follow-up decision; it is not included in the current request scope.

## Administrator view

Add **Learning resources** to the academy administration workspace. Keep the list scoped to the active academy, with fields for:

- Title and brief description
- Category and intended audience
- HTTPS resource link (file uploads are not included yet)
- Draft / Published / Archived status
- Optional version label and publish date

Administrators can add, edit, publish, archive, and replace resources. Publish and archive actions record the actor, academy, resource, and timestamp. Published resources are read-only to students, families, and teachers.

## Remaining decisions and follow-up

The first implementation supports HTTPS links to approved documents and resources. Direct file uploads, including PDF storage and replacement workflows, still need a separate decision on accepted file types, size limits, and storage.

## Follow-up decisions

Confirm direct file upload types and size limits, whether teacher read-only access is needed, and whether older syllabus versions should remain visible. The current backend restricts each resource to its academy and audits administrator writes.
