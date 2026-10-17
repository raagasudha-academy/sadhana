Sadhana calendar header cleanup; frontend only.
Replaces src/App.tsx from prior calendar Add Event package.
Removed Academy timetable panel and Refresh timetable button.
Global Sync Live Data remains, reloading venues and timetable.
Heading and record counts are dynamic.

Install:
cd ~/Dev/sadhana
cp src/App.tsx src/App.tsx.before-calendar-cleanup
unzip -o ~/Downloads/sadhana-v074-calendar-cleanup.zip -d .
npm run build
npm run dev
