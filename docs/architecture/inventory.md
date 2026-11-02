# Sadhana architecture inventory

Generated: 2026-11-02T21:20:14.201Z
Git HEAD: `5a7ebfb`
Branch: `refactor/modular-architecture`
Tracked TypeScript/TSX/CSS source files: **148**

## Largest files
| File | Lines | Approximate source imports by other files* |
|---|---:|---:|
| `src/RegistrationModule.tsx` | 3149 | 1 |
| `src/styles.css` | 2858 | 1 |
| `src/App.tsx` | 1491 | 1 |
| `src/TeacherManagement.tsx` | 452 | 1 |
| `src/studentPortal.css` | 426 | 1 |
| `backend/src/websiteRegistrationImport.ts` | 400 | 1 |
| `backend/src/lambda.ts` | 341 | 0 |
| `backend/src/scheduleStore.ts` | 339 | 2 |
| `backend/src/teacherDirectory.ts` | 335 | 4 |
| `backend/src/websiteRegistrationGateway.ts` | 288 | 6 |
| `src/AdminManagement.tsx` | 274 | 1 |
| `backend/src/academyOperations.ts` | 272 | 3 |
| `src/StudentHome.tsx` | 269 | 1 |
| `backend/src/homework.ts` | 247 | 5 |
| `src/WebsiteRegistrations.tsx` | 218 | 1 |
| `backend/src/repository.ts` | 211 | 1 |
| `src/api/sadhanaClient.ts` | 209 | 7 |
| `src/CloudAuth.tsx` | 179 | 16 |
| `backend/src/eventManagement.ts` | 153 | 1 |
| `backend/src/adminDirectory.ts` | 148 | 1 |
| `backend/src/familyAccess.ts` | 148 | 2 |
| `backend/src/profilePhotos.ts` | 143 | 5 |
| `backend/src/model.ts` | 142 | 25 |
| `backend/src/websiteRegistrationRevocation.ts` | 132 | 1 |
| `backend/src/guardianQueue.ts` | 118 | 3 |
| `src/PhotoAvatarEditor.tsx` | 118 | 4 |
| `src/CognitoPassword.tsx` | 116 | 1 |
| `backend/src/onlineClasses.ts` | 111 | 0 |
| `src/ClassManagement.tsx` | 111 | 1 |
| `src/types.ts` | 109 | 20 |

*Reference counts are heuristics based on import specifiers, not an authoritative dependency graph.*

## Core entrypoints
- `src/App.tsx`: 1491 lines
- `src/StudentHome.tsx`: 269 lines
- `src/RegistrationModule.tsx`: 3149 lines
- `backend/src/lambda.ts`: 341 lines

## Version-like source filenames (review, do not rename automatically)
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

## Tracked backup/archive artefacts (review, do not delete automatically)
- None detected

## CSS imports (review order and global leakage)
- `src/AcademyOperations.tsx` → `./academyOperations.css`
- `src/AccountAccess.tsx` → `./accountAccess.css`
- `src/AccountAccess.tsx` → `./accessV1274.css`
- `src/App.tsx` → `./sharedShell.css`
- `src/App.tsx` → `./roleWorkspace.css`
- `src/App.tsx` → `./learnerContent.css`
- `src/App.tsx` → `./sessionFooter.css`
- `src/CognitoPassword.tsx` → `./cognitoPassword.css`
- `src/HomeworkMaterials.tsx` → `./homeworkIcons.css`
- `src/LiveDashboard.tsx` → `./academyOperations.css`
- `src/PracticeReview.tsx` → `./practiceInsights.css`
- `src/RegistrationModule.tsx` → `./registrationUxPolish.css`
- `src/RegistrationModule.tsx` → `./familyCardsV096.css`
- `src/RegistrationModule.tsx` → `./quickUnenrol.css`
- `src/SadhanaMyProfile.tsx` → `./sadhanaMyProfile.css`
- `src/SessionAttendanceRegister.tsx` → `./rsvpStatusPills.css`
- `src/StudentHome.tsx` → `./familyDashboardV1.css`
- `src/StudentHome.tsx` → `./studentTimetablePolish.css`
- `src/StudentHome.tsx` → `./studentUiFinish.css`
- `src/StudentHome.tsx` → `./studentNavigationExperience.css`
- `src/StudentHome.tsx` → `./studentExperience.css`
- `src/StudentHome.tsx` → `./studentPracticeRefined.css`
- `src/StudentHome.tsx` → `./practiceInsights.css`
- `src/StudentHome.tsx` → `./practiceUX.css`
- `src/StudentHome.tsx` → `./compactHeaderV1281.css`
- `src/StudentHome.tsx` → `./homeworkInstructions.css`
- `src/StudentHome.tsx` → `./roleWorkspace.css`
- `src/StudentHome.tsx` → `./accountAccess.css`
- `src/StudentHome.tsx` → `./studentPortal.css`
- `src/StudentHome.tsx` → `./studentWorkspace.css`
- `src/StudentHome.tsx` → `./rollRequestV1275.css`
- `src/StudentHome.tsx` → `./learningUXV1276.css`
- `src/StudentHome.tsx` → `./studentNavigationV1277.css`
- `src/StudentHome.tsx` → `./embeddedCalendar.css`
- `src/StudentHome.tsx` → `./homeworkV1278.css`
- `src/StudentHome.tsx` → `./homeworkConfirmV1283.css`
- `src/StudentHome.tsx` → `./foundation.css`
- `src/StudentHome.tsx` → `./unifiedLayout.css`
- `src/StudentHome.tsx` → `./handoverLayout.css`
- `src/StudentHome.tsx` → `./workspaceLayout.css`
- `src/StudentHome.tsx` → `./shellPolish.css`
- `src/StudentHome.tsx` → `./academyDirectory.css`
- `src/TeacherWorkspace.tsx` → `./practiceInsights.css`
- `src/TeacherWorkspace.tsx` → `./homeworkCardActions.css`
- `src/TeacherWorkspace.tsx` → `./homeworkIcons.css`
- `src/TeacherWorkspace.tsx` → `./teacherWorkspace.css`
- `src/TeacherWorkspace.tsx` → `./learningUXV1276.css`
- `src/TeacherWorkspace.tsx` → `./unifiedLayout.css`
- `src/WebsiteRegistrations.tsx` → `./websiteRegistrations.css`
- `src/features/sadhanaCoreStarter/FeesComingSoon.tsx` → `./feesComingSoon.css`
- `src/features/sadhanaCoreStarter/HomeworkCard.tsx` → `./homeworkCard.css`
- `src/main.tsx` → `./styles.css`
- `src/main.tsx` → `./authPolish.css`

## Suggested boundaries (subject to source review)
- `src/app`: application shell, top-level navigation and route selection
- `src/features/registration`: registration and enrolment UI
- `src/features/learning`: student dashboard, homework, practice and timetable UI
- `src/features/administration`: admin and teacher management UI
- `src/components`: genuinely shared presentational components
- `backend/src`: retain existing Lambda entrypoint and extract domain routes incrementally

## Safety gate
Before extraction: `npm run verify` and `(cd backend && npm run check && npm run build)`.
Do not rename CSS or move backend security handlers based only on this report.
