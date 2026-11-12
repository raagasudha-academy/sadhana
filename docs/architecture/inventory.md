# Sadhana architecture inventory

Generated: 2026-11-12T00:04:04.230Z
Git HEAD: `0b56239`
Branch: `main`
Tracked TypeScript/TSX/CSS source files: **359**

## Largest files

| File                                                      | Lines | Approximate source imports by other files* |
| --------------------------------------------------------- | ----: | -----------------------------------------: |
| `app/src/styles.css`                                      |  6064 |                                          1 |
| `app/src/RegistrationModule.tsx`                          |  1621 |                                          1 |
| `backend/src/legacyHomework.ts`                           |  1602 |                                          3 |
| `app/src/api/sadhanaClient.ts`                            |  1506 |                                          7 |
| `app/src/app/AppTimetable.tsx`                            |  1498 |                                          1 |
| `app/src/app/AppManagedEvents.tsx`                        |  1438 |                                          2 |
| `app/src/App.tsx`                                         |  1383 |                                          4 |
| `app/src/WebsiteRegistrations.tsx`                        |  1314 |                                          0 |
| `backend/src/homework.ts`                                 |  1222 |                                          9 |
| `backend/src/finalMessages.ts`                            |  1185 |                                          2 |
| `backend/src/learningResources.ts`                        |  1083 |                                          2 |
| `app/src/features/learning/SyllabusLibrary.tsx`           |  1078 |                                          1 |
| `backend/src/coreWriteService.ts`                         |   971 |                                          3 |
| `app/src/app/AppDrawers.tsx`                              |   955 |                                          1 |
| `backend/src/academyOperations.ts`                        |   952 |                                          3 |
| `backend/src/lambda.ts`                                   |   899 |                                          3 |
| `app/src/features/learning/syllabusLibrary.css`           |   898 |                                          1 |
| `backend/src/scheduleStore.ts`                            |   895 |                                          3 |
| `app/src/features/learning/useStudentPortalController.ts` |   873 |                                         14 |
| `app/src/TeacherWorkspace.tsx`                            |   858 |                                          1 |
| `backend/src/finalScheduleSessionAdmin.ts`                |   855 |                                          2 |
| `app/src/websiteRegistrations.css`                        |   779 |                                          3 |
| `app/src/SrutiWebsiteRegistrations.tsx`                   |   762 |                                          0 |
| `app/src/LiveDashboard.tsx`                               |   710 |                                          0 |
| `app/src/AccountAccess.tsx`                               |   678 |                                          0 |
| `app/src/PracticeModule.tsx`                              |   677 |                                          0 |
| `app/src/workspaceVisualConsistency.css`                  |   656 |                                          2 |
| `app/src/app/AppRecords.tsx`                              |   617 |                                          2 |
| `app/src/AdminManagement.tsx`                             |   611 |                                          0 |
| `backend/src/__tests__/finalScheduleDataSecurity.test.ts` |   610 |                                          0 |

_Reference counts are heuristics based on import specifiers, not an authoritative dependency graph._

## Core entrypoints

- `app/src/App.tsx`: 1383 lines
- `app/src/StudentHome.tsx`: 48 lines
- `app/src/RegistrationModule.tsx`: 1621 lines
- `backend/src/lambda.ts`: 899 lines

## Version-like source filenames (review, do not rename automatically)

- `backend/scripts/verifyV074.ts`
- `src/familyCardsV096.css`

## Tracked backup/archive artefacts (review, do not delete automatically)

- None detected

## CSS imports (review order and global leakage)

- `app/src/AcademyOperations.tsx` → `./academyOperations.css`
- `app/src/AccountAccess.tsx` → `./accountAccess.css`
- `app/src/AccountAccess.tsx` → `./accountAccessControls.css`
- `app/src/App.tsx` → `./sharedShell.css`
- `app/src/App.tsx` → `./roleWorkspace.css`
- `app/src/App.tsx` → `./workspaceVisualConsistency.css`
- `app/src/App.tsx` → `./learnerContent.css`
- `app/src/App.tsx` → `./sessionFooter.css`
- `app/src/CascadeDeleteControl.tsx` → `./websiteRegistrations.css`
- `app/src/CognitoPassword.tsx` → `./cognitoPassword.css`
- `app/src/HomeworkMaterials.tsx` → `./homeworkIcons.css`
- `app/src/LiveDashboard.tsx` → `./academyOperations.css`
- `app/src/LiveDashboard.tsx` → `./teacherNextClass.css`
- `app/src/MessagesPage.tsx` → `./messagesPage.css`
- `app/src/MessagesWidget.tsx` → `./messagesWidget.css`
- `app/src/PracticeReview.tsx` → `./practiceInsights.css`
- `app/src/RegistrationModule.tsx` → `./registrationUxPolish.css`
- `app/src/RegistrationModule.tsx` → `./registrationFamilyCards.css`
- `app/src/RegistrationModule.tsx` → `./quickUnenrol.css`
- `app/src/SadhanaMyProfile.tsx` → `./sadhanaMyProfile.css`
- `app/src/SessionAttendanceRegister.tsx` → `./rsvpStatusPills.css`
- `app/src/SrutiWebsiteRegistrations.tsx` → `./websiteRegistrations.css`
- `app/src/StudentHome.tsx` → `./studentFamilyDashboard.css`
- `app/src/StudentHome.tsx` → `./studentTimetablePolish.css`
- `app/src/StudentHome.tsx` → `./studentUiFinish.css`
- `app/src/StudentHome.tsx` → `./studentExperience.css`
- `app/src/StudentHome.tsx` → `./studentPracticeRefined.css`
- `app/src/StudentHome.tsx` → `./practiceInsights.css`
- `app/src/StudentHome.tsx` → `./practiceUX.css`
- `app/src/StudentHome.tsx` → `./studentCompactHeader.css`
- `app/src/StudentHome.tsx` → `./homeworkInstructions.css`
- `app/src/StudentHome.tsx` → `./roleWorkspace.css`
- `app/src/StudentHome.tsx` → `./accountAccess.css`
- `app/src/StudentHome.tsx` → `./studentPortal.css`
- `app/src/StudentHome.tsx` → `./studentWorkspace.css`
- `app/src/StudentHome.tsx` → `./studentAccessRequest.css`
- `app/src/StudentHome.tsx` → `./learningExperience.css`
- `app/src/StudentHome.tsx` → `./studentNavigationLayout.css`
- `app/src/StudentHome.tsx` → `./embeddedCalendar.css`
- `app/src/StudentHome.tsx` → `./studentHomework.css`
- `app/src/StudentHome.tsx` → `./foundation.css`
- `app/src/StudentHome.tsx` → `./unifiedLayout.css`
- `app/src/StudentHome.tsx` → `./handoverLayout.css`
- `app/src/StudentHome.tsx` → `./workspaceLayout.css`
- `app/src/StudentHome.tsx` → `./shellPolish.css`
- `app/src/StudentHome.tsx` → `./academyDirectory.css`
- `app/src/StudentHome.tsx` → `./studentDashboardTypography.css`
- `app/src/StudentHome.tsx` → `./workspaceVisualConsistency.css`
- `app/src/TeacherWorkspace.tsx` → `./practiceInsights.css`
- `app/src/TeacherWorkspace.tsx` → `./homeworkCardActions.css`
- `app/src/TeacherWorkspace.tsx` → `./homeworkIcons.css`
- `app/src/TeacherWorkspace.tsx` → `./teacherWorkspace.css`
- `app/src/TeacherWorkspace.tsx` → `./learningExperience.css`
- `app/src/TeacherWorkspace.tsx` → `./unifiedLayout.css`
- `app/src/WebsiteRegistrations.tsx` → `./websiteRegistrations.css`
- `app/src/features/learning/StudentAttendance.tsx` → `../../studentUiFinish.css`
- `app/src/features/learning/SyllabusLibrary.tsx` → `./syllabusLibrary.css`
- `app/src/features/sadhanaCoreStarter/FeesComingSoon.tsx` → `./feesComingSoon.css`
- `app/src/features/sadhanaCoreStarter/HomeworkCard.tsx` → `./homeworkCard.css`
- `app/src/main.tsx` → `./styles.css`
- `app/src/main.tsx` → `./authPolish.css`

## Suggested boundaries (subject to source review)

- `app/src`: active frontend source, organized by application area and feature
- `app/tests`: frontend unit and component regression tests
- `backend/src`: Lambda entrypoint, domain modules and colocated unit tests
- `backend/src`: retain existing Lambda entrypoint and extract domain routes incrementally

## Safety gate

Before extraction: `npm run verify` and `(cd backend && npm run check && npm run build)`.
Do not rename CSS or move backend security handlers based only on this report.
