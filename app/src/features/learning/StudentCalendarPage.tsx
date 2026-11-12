import type { StudentPortalContext } from './useStudentPortalController';
import { StudentCalendar, weekLabel, monthLabel, shiftMonth, shiftWeek } from './StudentTimetable';

export function StudentCalendarPage({ context }: { context: StudentPortalContext }) {
  const {
    calendarView,
    setCalendarView,
    calendarAnchor,
    setCalendarAnchor,
    weekAnchor,
    setWeekAnchor,
    detail,
  } = context;
  return (
    <section className="sv1277-calendar">
      <p>Read-only schedule for the selected student’s approved classes.</p>
      <div className="sv1277-calendar-toolbar">
        <div className="sv1277-calendar-nav">
          <button
            type="button"
            onClick={() =>
              calendarView === 'week'
                ? setWeekAnchor((d) => shiftWeek(d, -1))
                : setCalendarAnchor((m) => shiftMonth(m, -1))
            }
            aria-label={calendarView === 'week' ? 'Previous week' : 'Previous month'}
          >
            ‹
          </button>
          <strong>
            {calendarView === 'week' ? weekLabel(weekAnchor) : monthLabel(calendarAnchor)}
          </strong>
          <button
            type="button"
            onClick={() =>
              calendarView === 'week'
                ? setWeekAnchor((d) => shiftWeek(d, 1))
                : setCalendarAnchor((m) => shiftMonth(m, 1))
            }
            aria-label={calendarView === 'week' ? 'Next week' : 'Next month'}
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              setCalendarAnchor(new Date().toISOString().slice(0, 7));
              setWeekAnchor(new Date().toISOString().slice(0, 10));
            }}
          >
            Today
          </button>
        </div>
        <div className="sv1277-calendar-mode" role="group" aria-label="Calendar view">
          {(['month', 'week', 'list'] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              aria-pressed={calendarView === mode}
              className={calendarView === mode ? 'active' : ''}
              onClick={() => {
                if (mode === 'week' && calendarView !== 'week')
                  setWeekAnchor(new Date().toISOString().slice(0, 10));
                setCalendarView(mode);
              }}
            >
              {mode === 'month' ? 'Month' : mode === 'week' ? 'Week' : 'List'}
            </button>
          ))}
        </div>
      </div>
      <StudentCalendar
        sessions={Array.isArray(detail.calendarSessions) ? detail.calendarSessions : []}
        anchor={calendarAnchor}
        weekAnchor={weekAnchor}
        mode={calendarView}
      />
    </section>
  );
}
