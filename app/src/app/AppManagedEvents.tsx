import { useEffect, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { institutions } from '../institutions';
import { ukToday } from './appShared';

export function ManagedEvents({
  cloud,
  workspace,
  isTeacher,
  venues,
  onChanged,
  openRequest,
  onClose,
}: any) {
  const allowed = (cloud?.staff.institutions || []).filter(
    (i: string) => i === 'sruti' || i === 'raaga',
  );
  const [institution, setInstitution] = useState<string>('');
  const selectedInstitution =
    workspace === 'sruti' || workspace === 'raaga' ? workspace : institution;
  const [teachers, setTeachers] = useState<any[]>([]);
  const [teacherId, setTeacherId] = useState('');
  // v13.7.7 teacher calendar verified identity
  const [calendarTeacherIdentity, setCalendarTeacherIdentity] = useState<{
    linked: boolean;
    teacherId?: string;
  } | null>(null);
  const [calendarIdentityLoading, setCalendarIdentityLoading] = useState(false);
  const [calendarIdentityError, setCalendarIdentityError] = useState('');
  const [teacherPickerOpen, setTeacherPickerOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [programme, setProgramme] = useState('');
  const [eventKind, setEventKind] = useState('recurring');
  const sharedEvent = eventKind === 'event';
  const [recurringUntil, setRecurringUntil] = useState('');
  const [repeatFrequency, setRepeatFrequency] = useState('weekly');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatEndMode, setRepeatEndMode] = useState('date');
  const [repeatCount, setRepeatCount] = useState(12);
  const [recurringPreview, setRecurringPreview] = useState<any>(null);
  const [date, setDate] = useState(ukToday().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [mode, setMode] = useState('In person');
  const [venueId, setVenueId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [venueRows, setVenueRows] = useState<any[]>([]);
  const [additionalMasters, setAdditionalMasters] = useState<any[]>([]);
  const [additionalClassId, setAdditionalClassId] = useState('');
  const [additionalReview, setAdditionalReview] = useState(false);
  const [additionalRepeatCount, setAdditionalRepeatCount] = useState(3);
  const [additionalRows, setAdditionalRows] = useState([
    { date: ukToday().toISOString().slice(0, 10), startTime: '10:00', endTime: '11:00' },
  ]);
  useEffect(() => {
    if (!openRequest || !selectedInstitution || !cloud) return;
    let live = true;
    cloud.api
      .listSchedule(selectedInstitution)
      .then((result: any) => {
        if (live)
          setAdditionalMasters(
            (result.records || []).filter(
              (r: any) => r.recordType === 'class' && r.lifecycleStatus !== 'archived',
            ),
          );
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [cloud?.api, selectedInstitution, openRequest]);
  const selectableMasters = additionalMasters.filter(
    (r: any) =>
      !isTeacher ||
      (calendarTeacherIdentity?.linked && r.teacherId === calendarTeacherIdentity.teacherId),
  );
  const selectedMaster = selectableMasters.find((r: any) => r.id === additionalClassId);
  const addConsecutiveRows = () =>
    setAdditionalRows((rows) => {
      if (rows.length >= 20) return rows;
      const last = rows[rows.length - 1];
      const duration =
        Number(last.endTime.slice(0, 2)) * 60 +
        Number(last.endTime.slice(3)) -
        Number(last.startTime.slice(0, 2)) * 60 -
        Number(last.startTime.slice(3));
      const end = Number(last.endTime.slice(0, 2)) * 60 + Number(last.endTime.slice(3)) + duration;
      if (duration <= 0 || end >= 1440) {
        setError('The next consecutive session would cross midnight. Choose an earlier time.');
        return rows;
      }
      const t = (n: number) =>
        `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
      setAdditionalReview(false);
      setError('');
      return [...rows, { date: last.date, startTime: last.endTime, endTime: t(end) }];
    });
  const addWeeklyRows = () => {
    setAdditionalRows((rows) => {
      const source = rows[rows.length - 1];
      const count = Math.min(additionalRepeatCount, 20 - rows.length);
      const dates = Array.from({ length: count }, (_, i) => {
        const d = new Date(`${source.date}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 7 * (i + 1));
        return { ...source, date: d.toISOString().slice(0, 10) };
      });
      return [...rows, ...dates];
    });
    setAdditionalReview(false);
    setError('');
  };
  const validateAdditionalPreview = () => {
    if (!selectedMaster) throw Error('Choose an existing assigned master class.');
    if (
      isTeacher &&
      (calendarIdentityLoading ||
        !calendarTeacherIdentity?.linked ||
        selectedMaster.teacherId !== calendarTeacherIdentity.teacherId)
    )
      throw Error('Verified teacher assignment required.');
    if (additionalRows.length < 1 || additionalRows.length > 20)
      throw Error('Choose 1 to 20 sessions.');
    const keys = new Set<string>();
    for (const [i, r] of additionalRows.entries()) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
        Number.isNaN(Date.parse(r.date + 'T12:00:00Z')) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.endTime) ||
        r.startTime >= r.endTime
      )
        throw Error(`Session ${i + 1}: enter a valid date and time range.`);
      const key = `${r.date}|${r.startTime}|${r.endTime}`;
      if (keys.has(key)) throw Error(`Session ${i + 1} duplicates another proposed session.`);
      keys.add(key);
    }
  };
  useEffect(() => {
    if (!isTeacher || !openRequest || !cloud || !selectedInstitution) {
      setCalendarTeacherIdentity(null);
      setCalendarIdentityLoading(false);
      setCalendarIdentityError('');
      return;
    }
    let active = true;
    setCalendarTeacherIdentity(null);
    setCalendarIdentityLoading(true);
    setCalendarIdentityError('');
    void cloud.api
      .myTeacherIdentity(selectedInstitution)
      .then((identity: { linked: boolean; teacherId?: string }) => {
        if (!active) return;
        setCalendarTeacherIdentity(identity);
        if (identity.linked && identity.teacherId) setTeacherId(identity.teacherId);
        else
          setCalendarIdentityError(
            'Your login is not linked to an active registered teacher for this academy.',
          );
      })
      .catch((error: unknown) => {
        if (active) {
          setCalendarTeacherIdentity(null);
          setCalendarIdentityError(
            error instanceof Error ? error.message : 'Unable to verify teacher identity.',
          );
        }
      })
      .finally(() => {
        if (active) setCalendarIdentityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isTeacher, openRequest, cloud?.api, cloud?.staff.subject, selectedInstitution]);

  useEffect(() => {
    if (!openRequest || !cloud) return;
    const directoryInstitution = selectedInstitution || (sharedEvent ? allowed[0] : '');
    if (!directoryInstitution) return;
    let active = true;
    cloud.api
      .listTeachers(directoryInstitution)
      .then((r: any) => {
        if (active) setTeachers(r.records.filter((t: any) => t.active));
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    cloud.api
      .list('venues', directoryInstitution)
      .then((r: any) => {
        if (active) setVenueRows(r.records || []);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [cloud?.api, selectedInstitution, sharedEvent, openRequest]);
  useEffect(() => {
    if (!openRequest) return;
    const entry = openRequest.record || null;
    setAdditionalReview(false);
    setAdditionalClassId('');
    setAdditionalRows([
      { date: ukToday().toISOString().slice(0, 10), startTime: '10:00', endTime: '11:00' },
    ]);
    setEditing(entry);
    setInstitution(entry?.institution || '');
    setName(entry?.name || '');
    setProgramme(
      entry?.eventKind === 'event'
        ? 'Event'
        : entry?.programme ||
            (!entry && workspace === 'raaga'
              ? 'Singing'
              : !entry && workspace === 'sruti'
                ? 'Vedam'
                : ''),
    );
    setEventKind(
      entry?.eventKind ||
        (!entry
          ? isTeacher
            ? 'class'
            : 'recurring'
          : entry?.programme === 'Event'
            ? 'event'
            : 'class'),
    );
    setRecurringUntil('');
    setRepeatFrequency('weekly');
    setRepeatInterval(1);
    setRepeatEndMode('date');
    setRepeatCount(12);
    setRepeatDays([
      new Date(`${entry?.date || ukToday().toISOString().slice(0, 10)}T12:00:00Z`).getUTCDay(),
    ]);
    setRecurringPreview(null);
    setDate(entry?.date || ukToday().toISOString().slice(0, 10));
    setStartTime(entry?.startTime || '10:00');
    setEndTime(entry?.endTime || '11:00');
    setMode(entry?.mode || 'In person');
    setVenueId(entry?.venueId || '');
    setTeacherId(entry?.teacherId || '');
    setTeacherPickerOpen(false);
    setError('');
  }, [openRequest]);
  useEffect(() => {
    setRecurringPreview(null);
  }, [name, programme, teacherId, mode, venueId, date, startTime, endTime, selectedInstitution]);
  if (!openRequest || !cloud) return null;
  const locations = venueRows.length ? venueRows : venues || [];
  const chosenVenue = locations.find((v: any) => v.id === venueId);
  const eventOnline = sharedEvent && venueId === 'online';
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (eventKind === 'additional') {
        if (!selectedInstitution) throw Error('Choose an academy.');
        validateAdditionalPreview();
        if (!additionalReview) {
          setAdditionalReview(true);
          return;
        }
        await cloud.api.createAdditionalSessions(selectedInstitution, {
          classId: selectedMaster.id,
          sessions: additionalRows,
        });
        await onChanged();
        onClose();
        return;
      }
      // These checks are intentionally shared by Preview and Save. Custom teacher buttons
      // cannot rely on native HTML `required` validation.
      if (!['recurring', 'class', 'event'].includes(eventKind))
        throw Error('Choose a calendar entry type.');
      if (!name.trim()) throw Error('Enter a class or event name.');
      if (sharedEvent) {
        if (!allowed.includes('raaga') || !allowed.includes('sruti') || isTeacher)
          throw Error('Shared events require administrator access to both academies.');
        if (programme !== 'Event') throw Error('Event programme must be Event.');
      } else {
        if (!selectedInstitution || !allowed.includes(selectedInstitution))
          throw Error('Choose an authorised academy.');
        const validProgrammes =
          selectedInstitution === 'raaga' ? ['Singing'] : ['Vedam', 'Vedanta'];
        if (!validProgrammes.includes(programme))
          throw Error(
            `Choose a valid ${selectedInstitution === 'raaga' ? 'Raagasudha' : 'Sruti'} programme.`,
          );
        if (!['In person', 'Online'].includes(mode)) throw Error('Choose a delivery mode.');
        if (!isTeacher && !teacherId) throw Error('Choose a registered teacher.');
        if (!isTeacher && !teachers.some((t: any) => t.id === teacherId))
          throw Error('Choose an active teacher from the directory.');
        if (isTeacher) {
          if (calendarIdentityLoading)
            throw Error('Teacher identity verification is still in progress.');
          if (!calendarTeacherIdentity?.linked || !calendarTeacherIdentity.teacherId)
            throw Error(
              calendarIdentityError || 'Your login must be linked to an active registered teacher.',
            );
          if (editing?.teacherId && editing.teacherId !== calendarTeacherIdentity.teacherId)
            throw Error('You cannot modify a calendar entry assigned to another teacher.');
        }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z')))
        throw Error('Choose a valid class or event date.');
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
        endTime <= startTime
      )
        throw Error('Choose a start and end time; the end must be later than the start.');
      if (sharedEvent) {
        if (!eventOnline && !chosenVenue) throw Error('Choose a saved venue or Online.');
      } else if (mode !== 'Online' && !chosenVenue)
        throw Error('Choose a venue from the directory.');
      if (eventKind === 'recurring') {
        if (
          !['daily', 'weekly', 'monthly'].includes(repeatFrequency) ||
          !Number.isInteger(repeatInterval) ||
          repeatInterval < 1 ||
          repeatInterval > 4
        )
          throw Error('Choose a valid repeat frequency and interval.');
        if (
          repeatFrequency === 'weekly' &&
          (!repeatDays.length ||
            repeatDays.some((d: number) => !Number.isInteger(d) || d < 0 || d > 6))
        )
          throw Error('Select at least one weekday.');
        if (repeatEndMode === 'date') {
          if (
            !recurringUntil ||
            recurringUntil < date ||
            !Number.isFinite(Date.parse(recurringUntil + 'T12:00:00Z'))
          )
            throw Error('Choose a last class date on or after the first class date.');
        } else if (repeatEndMode === 'count') {
          if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 80)
            throw Error('Enter a number of sessions between 1 and 80.');
        } else throw Error('Choose when the recurring class ends.');
      }
      if (eventKind === 'recurring') {
        if (isTeacher)
          throw Error('Recurring class creation requires academy administrator access.');
        if (!selectedInstitution || !teacherId)
          throw Error('Choose an academy and registered teacher.');
        if (mode !== 'Online' && !chosenVenue) throw Error('Choose a venue.');
        const recurrence = {
          frequency: repeatFrequency,
          interval: repeatInterval,
          weekdays: repeatFrequency === 'weekly' ? repeatDays : undefined,
          endMode: repeatEndMode,
          until: repeatEndMode === 'date' ? recurringUntil : undefined,
          count: repeatEndMode === 'count' ? repeatCount : undefined,
        };
        const draft = {
          name,
          programme,
          teacherId,
          mode,
          location: mode === 'Online' ? 'Online' : chosenVenue.name,
          venueId: mode === 'Online' ? '' : chosenVenue.id,
          date,
          startTime,
          endTime,
          recurrence,
        };
        if (!recurringPreview) {
          const result = await cloud.api.previewRecurringClass(selectedInstitution, draft);
          setRecurringPreview(result);
          return;
        }
        await cloud.api.createRecurringClass(selectedInstitution, draft);
        await onChanged();
        onClose();
        return;
      }
      if (
        (sharedEvent && !eventOnline && !chosenVenue) ||
        (eventKind !== 'event' && mode !== 'Online' && !chosenVenue)
      )
        throw Error('Choose a venue from the directory or Online.');
      const payload = {
        name,
        programme: eventKind === 'event' ? 'Event' : programme,
        eventKind,
        date,
        startTime,
        endTime,
        mode: eventKind === 'event' ? 'Event' : mode,
        location:
          eventOnline || (!sharedEvent && mode === 'Online') ? 'Online' : chosenVenue?.name || '',
        venueId: eventOnline || (!sharedEvent && mode === 'Online') ? '' : chosenVenue?.id || '',
        ...(eventKind === 'event' || isTeacher ? {} : { teacherId }),
      };
      if (sharedEvent) {
        if (editing && editing.sharedEvent)
          await cloud.api.updateSharedEvent(editing.id, payload, editing.version);
        else if (editing)
          throw Error(
            'An older academy-only event cannot be converted to shared in place. Create a new shared event.',
          );
        else await cloud.api.createSharedEvent(payload);
      } else {
        if (editing && editing.sharedEvent) throw Error('A shared event cannot become a class.');
        if (editing)
          await cloud.api.updateManagedEvent(
            selectedInstitution,
            editing.id,
            payload,
            editing.version,
          );
        else await cloud.api.createManagedEvent(selectedInstitution, payload);
      }
      await onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save event.');
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!editing || !window.confirm('Cancel this event? It will remain in history.')) return;
    setBusy(true);
    try {
      if (editing.sharedEvent) await cloud.api.cancelSharedEvent(editing.id, editing.version);
      else await cloud.api.cancelManagedEvent(selectedInstitution, editing.id, editing.version);
      await onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to cancel event.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reg-shade">
      <style>{`
  .sadhana-calendar-entry-modal .sadhana-edit-field select {
    -webkit-appearance: none;
    appearance: none;
    padding-right: 54px !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%2355667e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 24px center;
    background-size: 18px 18px;
  }

  /* Match recurrence selection typography to the rest of the Sadhana modal. */
  .sadhana-calendar-entry-modal .sadhana-recurrence-days {
    min-width: 0;
    margin: 0;
    padding: 12px 14px 14px;
    border: 1px solid #dbe2eb;
    border-radius: 10px;
  }
  .sadhana-calendar-entry-modal .sadhana-recurrence-days legend {
    padding: 0 6px;
    color: #293950;
    font-size: 14px;
    line-height: 1.4;
    font-weight: 600;
  }
  .sadhana-calendar-entry-modal .sadhana-recurrence-weekdays {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sadhana-calendar-entry-modal .sadhana-weekday {
    width: 42px;
    height: 36px;
    padding: 0;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #fff;
    color: #293950;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
  }
  .sadhana-calendar-entry-modal .sadhana-weekday.selected {
    background: #e5edff;
    border-color: #9daed2;
    color: #293950;
  }
  .sadhana-calendar-entry-modal .sadhana-weekday:focus-visible {
    outline: 2px solid #91a5d1;
    outline-offset: 2px;
  }
  /* Required indicators: visual only; existing validation remains authoritative. */
  .sadhana-calendar-entry-modal .sadhana-required-label::after {
    content: ' *';
    color: #dc2626;
    font-weight: 800;
    font-size: 15px;
  }
  .sadhana-calendar-entry-modal .sadhana-required-note {
    margin: 0 0 4px;
    font-size: 12px;
    color: #64748b;
  }
  .sadhana-calendar-entry-modal .sadhana-required-note strong { color: #dc2626; }
  .sadhana-calendar-entry-modal .sadhana-edit-field select:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

.sadhana-calendar-entry-modal.sadhana-additional-modal{width:min(780px,calc(100vw - 28px));max-width:780px;max-height:calc(100vh - 36px);overflow-y:auto}
.sadhana-additional{display:grid;gap:16px;min-width:0}
.sadhana-additional-intro{display:grid;gap:4px;color:#233755}.sadhana-additional-intro span{color:#667893;font-size:13px}
.sadhana-additional-context{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px;border:1px solid #dce5f1;border-radius:12px;background:#f7f9fd}
.sadhana-additional-context>div{display:grid;gap:4px;min-width:0}.sadhana-additional-context small{color:#6b7b93}.sadhana-additional-context strong{font-size:13px;overflow-wrap:anywhere}
.sadhana-additional-heading{display:flex;justify-content:space-between;gap:8px;align-items:center}.sadhana-additional-heading span{font-size:12px;color:#64748b}
.sadhana-additional-rows{display:grid;gap:12px}.sadhana-additional-row{padding:14px;border:1px solid #dce5f1;border-radius:12px;background:white;min-width:0}
.sadhana-additional-row-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;color:#263d5c}.sadhana-additional-row-actions{display:flex;gap:8px}
.sadhana-additional-row-actions button,.sadhana-additional-tools button,.sadhana-additional-weekly button,.sadhana-additional-review button{min-height:34px;border:1px solid #cbd7e8;border-radius:8px;background:#fff;color:#2e4b74;padding:6px 11px;font-size:13px;font-weight:600;cursor:pointer}
.sadhana-additional-row-actions .sadhana-additional-remove{color:#a23838}
.sadhana-additional button:disabled{cursor:not-allowed;opacity:.5}
.sadhana-additional-fields{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(2,minmax(0,1fr));gap:12px;min-width:0}
.sadhana-additional-fields label{display:grid;gap:6px;color:#334766;font-size:12px;font-weight:600;min-width:0}
.sadhana-additional-fields input{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;height:42px;border:1px solid #cbd7e8;border-radius:9px;background:#fff;color:#253752;padding:8px;font:inherit;font-size:14px}
.sadhana-additional-tools{display:flex;gap:10px;flex-wrap:wrap}
.sadhana-additional-weekly{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px;border-radius:10px;background:#f6f8fc;font-size:13px}.sadhana-additional-weekly label{display:flex;align-items:center;gap:6px}.sadhana-additional-weekly select{height:34px;border-radius:8px;border:1px solid #cbd7e8;padding:4px}
.sadhana-additional-note{display:grid;gap:5px;padding:13px;border-left:3px solid #5c78a7;background:#f6f9fd;font-size:13px;color:#425570}.sadhana-additional-note strong{color:#233755}
.sadhana-additional-review{padding:16px;border:1px solid #d6e1f2;border-radius:12px;background:#f7f9fe}.sadhana-additional-review p{font-size:13px}.sadhana-additional-review ol{max-height:260px;overflow:auto;padding-left:24px;line-height:1.9;font-size:13px}
@media(max-width:600px){.sadhana-additional-context{grid-template-columns:1fr}.sadhana-additional-fields{grid-template-columns:1fr 1fr}.sadhana-additional-fields label:first-child{grid-column:1 / -1}.sadhana-additional-modal .reg-form{padding:16px}}
`}</style>
      <section
        className={`reg-modal sadhana-calendar-entry-modal ${eventKind === 'additional' ? 'sadhana-additional-modal' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Manage calendar event"
      >
        <div className="reg-modal-head">
          <h2>{editing ? 'Edit calendar event' : 'Add Event'}</h2>
          <button className="reg-icon-btn" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form
          className="reg-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="sadhana-required-note">
            <strong>*</strong> Required fields
          </p>
          <label className="sadhana-edit-field">
            <span>Calendar entry type</span>
            <select
              required
              value={eventKind}
              disabled={!!editing}
              onChange={(e) => {
                const kind = e.target.value;
                setEventKind(kind);
                setProgramme(
                  kind === 'event'
                    ? 'Event'
                    : selectedInstitution === 'raaga'
                      ? 'Singing'
                      : selectedInstitution === 'sruti'
                        ? 'Vedam'
                        : '',
                );
                setError('');
              }}
            >
              <option value="recurring">New recurring class</option>
              <option value="class">Standalone class event</option>
              {!editing && (
                <option value="additional">Additional sessions for existing class</option>
              )}
              <option value="event">Event</option>
            </select>
          </label>
          {!sharedEvent && (
            <label className="sadhana-edit-field">
              <span className={!selectedInstitution ? 'sadhana-required-label' : undefined}>
                Academy
              </span>
              <select
                required
                value={selectedInstitution}
                disabled={workspace !== 'combined' || !!editing}
                onChange={(e) => {
                  setInstitution(e.target.value);
                  setTeacherId('');
                  setTeacherPickerOpen(false);
                  setVenueId('');
                  setProgramme(
                    eventKind === 'event'
                      ? 'Event'
                      : e.target.value === 'raaga'
                        ? 'Singing'
                        : e.target.value === 'sruti'
                          ? 'Vedam'
                          : '',
                  );
                  setError('');
                }}
              >
                <option value="">Choose academy</option>
                {allowed.map((i: string) => (
                  <option key={i} value={i}>
                    {institutions[i].name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sharedEvent && (
            <p className="reg-footnote">
              This event appears in both Raagasudha and Sruti calendars. Changes and cancellation
              apply to both.
            </p>
          )}
          {eventKind === 'additional' && (
            <div className="sadhana-additional" aria-label="Additional class sessions">
              <div className="sadhana-additional-intro">
                <strong>Additional sessions</strong>
                <span>
                  Extra teaching dates for an existing class. The regular timetable stays unchanged.
                </span>
              </div>
              <label className="sadhana-edit-field">
                <span>Existing master class *</span>
                <select
                  required
                  value={additionalClassId}
                  onChange={(e) => {
                    setAdditionalClassId(e.target.value);
                    setAdditionalReview(false);
                    setError('');
                  }}
                >
                  <option value="">Select assigned class</option>
                  {selectableMasters.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedMaster && (
                <div className="sadhana-additional-context">
                  <div>
                    <small>Teacher</small>
                    <strong>{selectedMaster.teacher || 'Registered teacher'}</strong>
                  </div>
                  <div>
                    <small>Delivery / venue</small>
                    <strong>
                      {selectedMaster.mode === 'Online'
                        ? 'Online'
                        : selectedMaster.location || 'Saved venue'}
                    </strong>
                  </div>
                  <div>
                    <small>Academy</small>
                    <strong>
                      {institutions[selectedInstitution]?.name || selectedInstitution}
                    </strong>
                  </div>
                </div>
              )}
              <div className="sadhana-additional-heading">
                <strong>Session dates and times</strong>
                <span>{additionalRows.length} / 20</span>
              </div>
              {!additionalReview ? (
                <>
                  <div className="sadhana-additional-rows">
                    {additionalRows.map((row, i) => (
                      <div className="sadhana-additional-row" key={i}>
                        <div className="sadhana-additional-row-head">
                          <strong>Session {i + 1}</strong>
                          <div className="sadhana-additional-row-actions">
                            {additionalRows.length > 1 && (
                              <button
                                type="button"
                                className="sadhana-additional-remove"
                                onClick={() => {
                                  setAdditionalRows((rows) => rows.filter((_, j) => j !== i));
                                  setError('');
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="sadhana-additional-fields">
                          <label>
                            Date
                            <input
                              aria-label={`Additional session ${i + 1} date`}
                              type="date"
                              required
                              value={row.date}
                              onChange={(e) => {
                                setAdditionalRows((rows) =>
                                  rows.map((r, j) =>
                                    i === j ? { ...r, date: e.target.value } : r,
                                  ),
                                );
                                setError('');
                              }}
                            />
                          </label>
                          <label>
                            Start time
                            <input
                              aria-label={`Additional session ${i + 1} start`}
                              type="time"
                              required
                              value={row.startTime}
                              onChange={(e) => {
                                setAdditionalRows((rows) =>
                                  rows.map((r, j) =>
                                    i === j ? { ...r, startTime: e.target.value } : r,
                                  ),
                                );
                                setError('');
                              }}
                            />
                          </label>
                          <label>
                            End time
                            <input
                              aria-label={`Additional session ${i + 1} end`}
                              type="time"
                              required
                              value={row.endTime}
                              onChange={(e) => {
                                setAdditionalRows((rows) =>
                                  rows.map((r, j) =>
                                    i === j ? { ...r, endTime: e.target.value } : r,
                                  ),
                                );
                                setError('');
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="sadhana-additional-tools">
                    <button
                      type="button"
                      disabled={additionalRows.length >= 20}
                      onClick={() => {
                        setAdditionalRows((rows) => [...rows, { ...rows[rows.length - 1] }]);
                        setError('');
                      }}
                    >
                      + Add another date
                    </button>
                    <button
                      type="button"
                      disabled={additionalRows.length >= 20}
                      onClick={addConsecutiveRows}
                    >
                      + Next consecutive session
                    </button>
                  </div>
                  <div className="sadhana-additional-weekly">
                    <span>Or repeat the last session weekly</span>
                    <label>
                      Weeks
                      <select
                        aria-label="Number of additional weeks"
                        value={additionalRepeatCount}
                        onChange={(e) => setAdditionalRepeatCount(Number(e.target.value))}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={additionalRows.length >= 20}
                      onClick={addWeeklyRows}
                    >
                      Generate dates
                    </button>
                  </div>
                </>
              ) : (
                <div className="sadhana-additional-review">
                  <strong>Review before creating</strong>
                  <p>
                    These {additionalRows.length} sessions will be linked to{' '}
                    <b>{selectedMaster?.name}</b>. Check each date and time.
                  </p>
                  <ol>
                    {additionalRows.map((r, i) => (
                      <li key={i}>
                        {new Date(`${r.date}T12:00:00Z`).toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}{' '}
                        · {r.startTime}–{r.endTime}
                      </li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    onClick={() => {
                      setAdditionalReview(false);
                      setError('');
                    }}
                  >
                    ← Edit session dates
                  </button>
                </div>
              )}
              <div className="sadhana-additional-note">
                <strong>Student visibility</strong>
                <span>
                  Only approved students enrolled in the selected master class can see these
                  sessions. Times are UK local (Europe/London). RSVP and attendance remain separate
                  for every date.
                </span>
              </div>
              {error && (
                <p role="alert" className="sadhana-sync-error">
                  {error}
                </p>
              )}
            </div>
          )}
          {eventKind !== 'additional' && (
            <>
              <label className="sadhana-edit-field">
                <span className="sadhana-required-label">Event / class name</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="sadhana-edit-field">
                <span>Programme</span>
                <select
                  required
                  disabled={eventKind === 'event' || !selectedInstitution}
                  value={eventKind === 'event' ? 'Event' : programme}
                  onChange={(e) => setProgramme(e.target.value)}
                >
                  {eventKind === 'event' ? (
                    <option value="Event">Event</option>
                  ) : selectedInstitution === 'raaga' ? (
                    <option value="Singing">Singing</option>
                  ) : selectedInstitution === 'sruti' ? (
                    <>
                      <option value="Vedam">Vedam</option>
                      <option value="Vedanta">Vedanta</option>
                    </>
                  ) : (
                    <option value="">Choose academy first</option>
                  )}
                </select>
              </label>
              <label className="sadhana-edit-field">
                <span>{eventKind === 'recurring' ? 'First class date' : 'Date'}</span>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setRecurringPreview(null);
                    if (eventKind === 'recurring')
                      setRepeatDays([new Date(`${e.target.value}T12:00:00Z`).getUTCDay()]);
                  }}
                />
              </label>
              {eventKind === 'recurring' && (
                <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#293950' }}>
                      Repeat every
                    </span>
                    <select
                      required
                      aria-label="Repeat interval"
                      value={repeatInterval}
                      onChange={(e) => {
                        setRepeatInterval(Number(e.target.value));
                        setRecurringPreview(null);
                      }}
                      style={{
                        width: 72,
                        minHeight: 38,
                        padding: '7px 26px 7px 12px',
                        fontSize: 14,
                        borderRadius: 9,
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option value={n} key={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <select
                      required
                      aria-label="Repeat frequency"
                      value={repeatFrequency}
                      onChange={(e) => {
                        setRepeatFrequency(e.target.value);
                        setRecurringPreview(null);
                      }}
                      style={{
                        width: 124,
                        minHeight: 38,
                        padding: '7px 30px 7px 12px',
                        fontSize: 14,
                        borderRadius: 9,
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      <option value="daily">day(s)</option>
                      <option value="weekly">week(s)</option>
                      <option value="monthly">month(s)</option>
                    </select>
                  </div>
                  {repeatFrequency === 'weekly' && (
                    <div>
                      <span
                        style={{
                          display: 'block',
                          marginBottom: 8,
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#293950',
                        }}
                      >
                        Repeat on
                      </span>
                      <div
                        role="group"
                        aria-label="Repeat on weekdays"
                        style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}
                      >
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, j) => {
                          const i = (j + 1) % 7;
                          return (
                            <button
                              key={d}
                              type="button"
                              aria-label={d}
                              aria-pressed={repeatDays.includes(i)}
                              aria-required={repeatFrequency === 'weekly'}
                              onClick={() => {
                                setRepeatDays((v) =>
                                  v.includes(i) ? v.filter((x) => x !== i) : [...v, i],
                                );
                                setRecurringPreview(null);
                              }}
                              style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: 22,
                                minWidth: 45,
                                minHeight: 34,
                                padding: '6px 9px',
                                fontSize: 13,
                                fontWeight: 600,
                                background: repeatDays.includes(i) ? '#e5edff' : 'white',
                                color: '#263952',
                                cursor: 'pointer',
                              }}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#293950' }}>Until</span>
                    <select
                      required
                      aria-label="Recurrence ends"
                      value={repeatEndMode}
                      onChange={(e) => {
                        setRepeatEndMode(e.target.value);
                        setRecurringPreview(null);
                      }}
                      style={{
                        width: 158,
                        minHeight: 38,
                        padding: '7px 30px 7px 12px',
                        fontSize: 14,
                        borderRadius: 9,
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      <option value="date">On a date</option>
                      <option value="count">After sessions</option>
                    </select>
                    {repeatEndMode === 'date' ? (
                      <>
                        <span
                          className="sadhana-required-label"
                          style={{ fontSize: 13, color: '#293950' }}
                        >
                          Last class date
                        </span>
                        <input
                          aria-label="Last class date (inclusive)"
                          type="date"
                          required
                          min={date}
                          value={recurringUntil}
                          onChange={(e) => {
                            setRecurringUntil(e.target.value);
                            setRecurringPreview(null);
                          }}
                          style={{
                            minHeight: 38,
                            flex: '1 1 175px',
                            minWidth: 175,
                            fontSize: 14,
                            borderRadius: 9,
                            border: '1px solid #cbd5e1',
                          }}
                        />
                      </>
                    ) : (
                      <input
                        aria-label="Number of sessions (maximum 80)"
                        type="number"
                        required
                        min="1"
                        max="80"
                        value={repeatCount}
                        onChange={(e) => {
                          setRepeatCount(Number(e.target.value));
                          setRecurringPreview(null);
                        }}
                        style={{
                          width: 90,
                          minHeight: 38,
                          fontSize: 14,
                          borderRadius: 9,
                          border: '1px solid #cbd5e1',
                        }}
                      />
                    )}
                  </div>
                  {recurringPreview && (
                    <div
                      role="status"
                      style={{
                        border: '1px solid #d8e1ed',
                        borderRadius: 12,
                        padding: '14px 16px',
                        background: '#f7f9fc',
                        color: '#293950',
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                          marginBottom: 8,
                        }}
                      >
                        <strong style={{ fontSize: 14, fontWeight: 650 }}>
                          Review class schedule
                        </strong>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '4px 9px',
                            background: '#e8eef9',
                            borderRadius: 999,
                          }}
                        >
                          {recurringPreview.count}{' '}
                          {recurringPreview.count === 1 ? 'session' : 'sessions'}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px 8px',
                          maxHeight: 116,
                          overflowY: 'auto',
                        }}
                      >
                        {recurringPreview.dates.map((d: string) => (
                          <span
                            key={d}
                            style={{
                              display: 'inline-block',
                              border: '1px solid #d9e1ed',
                              borderRadius: 7,
                              background: 'white',
                              padding: '5px 9px',
                              fontSize: 13,
                            }}
                          >
                            {new Intl.DateTimeFormat('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              timeZone: 'UTC',
                            }).format(new Date(d + 'T12:00:00Z'))}
                          </span>
                        ))}
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b', margin: '9px 0 0' }}>
                        UK local time · No records are changed during preview
                      </p>
                      {recurringPreview.duplicateNames?.length > 0 && (
                        <p style={{ color: '#a02727', fontSize: 13 }}>
                          Existing class with the same name:{' '}
                          {recurringPreview.duplicateNames.map((x: any) => x.name).join(', ')}.
                          Rename before saving.
                        </p>
                      )}
                    </div>
                  )}
                  <p className="reg-footnote">
                    Preview is read-only. Confirm creates one master class and all dated sessions
                    together (maximum 80).
                  </p>
                </div>
              )}
              <div className="sadhana-edit-time-row">
                <label className="sadhana-edit-field">
                  <span>Start time</span>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="sadhana-edit-field">
                  <span>End time</span>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </label>
              </div>
              {eventKind !== 'event' && (
                <div className="sadhana-edit-field">
                  <label id="sadhana-event-teacher-label" className="sadhana-required-label">
                    Teacher
                  </label>
                  {isTeacher ? (
                    <input
                      readOnly
                      value={
                        teachers.find((t) => t.cognitoSub === cloud.staff.subject)?.displayName ||
                        editing?.teacher ||
                        'Your linked teacher account'
                      }
                    />
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        aria-labelledby="sadhana-event-teacher-label"
                        aria-haspopup="listbox"
                        aria-expanded={teacherPickerOpen}
                        aria-required={true}
                        onClick={() => setTeacherPickerOpen((v) => !v)}
                        style={{
                          width: '100%',
                          minHeight: 44,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '10px 18px',
                          border: '1px solid #cbd5e1',
                          borderRadius: 10,
                          background: '#fff',
                          color: teacherId ? '#293950' : '#69768b',
                          font: 'inherit',
                          fontSize: 14,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <span>
                          {teachers.find((t) => t.id === teacherId)?.displayName ||
                            'Choose teacher'}
                        </span>
                        <ChevronDown
                          size={17}
                          style={{
                            flexShrink: 0,
                            marginRight: 6,
                            transform: teacherPickerOpen ? 'rotate(180deg)' : 'none',
                          }}
                        />
                      </button>
                      {teacherPickerOpen && (
                        <div
                          role="listbox"
                          aria-labelledby="sadhana-event-teacher-label"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setTeacherPickerOpen(false);
                              e.stopPropagation();
                            }
                          }}
                          style={{
                            maxHeight: 196,
                            overflowY: 'auto',
                            overscrollBehavior: 'contain',
                            WebkitOverflowScrolling: 'touch',
                            marginTop: 5,
                            background: '#fff',
                            border: '1px solid #cbd5e1',
                            borderRadius: 10,
                            boxShadow: '0 6px 18px rgba(20,33,55,.10)',
                          }}
                        >
                          {teachers.map((t) => (
                            <button
                              key={t.id}
                              role="option"
                              aria-selected={teacherId === t.id}
                              type="button"
                              onClick={() => {
                                setTeacherId(t.id);
                                setTeacherPickerOpen(false);
                              }}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                textAlign: 'left',
                                padding: '10px 16px',
                                background: teacherId === t.id ? '#eff4ff' : 'transparent',
                                border: 0,
                                color: '#293950',
                                font: 'inherit',
                                fontSize: 14,
                                cursor: 'pointer',
                              }}
                            >
                              <span>{t.displayName}</span>
                              {teacherId === t.id && <Check size={15} />}
                            </button>
                          ))}
                          {!teachers.length && (
                            <p style={{ padding: '10px 16px', margin: 0 }}>
                              No active teachers available
                            </p>
                          )}
                        </div>
                      )}
                      {!teacherId && (
                        <input
                          tabIndex={-1}
                          aria-hidden="true"
                          required
                          value=""
                          onChange={() => {}}
                          style={{
                            position: 'absolute',
                            width: 1,
                            height: 1,
                            opacity: 0,
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
              {eventKind !== 'event' && (
                <label className="sadhana-edit-field">
                  <span>Delivery</span>
                  <select
                    required
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value);
                      setVenueId('');
                      setRecurringPreview(null);
                    }}
                  >
                    <option>In person</option>
                    <option>Online</option>
                  </select>
                </label>
              )}
              {sharedEvent && (
                <label className="sadhana-edit-field">
                  <span className="sadhana-required-label">Venue</span>
                  <select required value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                    <option value="">Choose venue</option>
                    <option value="online">Online</option>
                    {locations.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {eventKind !== 'event' &&
                (mode === 'Online' ? (
                  <label className="sadhana-edit-field">
                    <span>Venue</span>
                    <input readOnly required value="Online" />
                  </label>
                ) : (
                  <label className="sadhana-edit-field">
                    <span className="sadhana-required-label">Venue</span>
                    <select required value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                      <option value="">Choose venue</option>
                      {locations.map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              {error && (
                <p role="alert" className="sadhana-sync-error">
                  {error}
                </p>
              )}
            </>
          )}
          <div className="reg-modal-actions">
            <button type="button" className="reg-secondary" onClick={onClose}>
              Close
            </button>
            {editing && (
              <button
                type="button"
                className="reg-danger"
                disabled={busy}
                onClick={() => void cancel()}
              >
                Cancel event
              </button>
            )}
            <button
              type="submit"
              className="reg-primary"
              disabled={
                busy ||
                (!sharedEvent && !selectedInstitution) ||
                (eventKind === 'recurring' && isTeacher) ||
                (eventKind === 'recurring' && !!recurringPreview?.duplicateNames?.length) ||
                (sharedEvent &&
                  (isTeacher || !allowed.includes('raaga') || !allowed.includes('sruti')))
              }
            >
              {busy
                ? 'Saving…'
                : eventKind === 'recurring'
                  ? recurringPreview
                    ? 'Confirm & create class'
                    : 'Preview class dates'
                  : eventKind === 'additional'
                    ? additionalReview
                      ? `Confirm & create ${additionalRows.length} sessions`
                      : `Review ${additionalRows.length} sessions`
                    : 'Save calendar entry'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
export const sadhanaMasterDeleteStyles = `
.sadhana-master-delete-link{margin:18px 0 4px;display:flex;justify-content:flex-start}
.sadhana-master-delete-link button{display:inline-flex;align-items:center;gap:8px;font-size:13px!important;width:auto!important}
.sadhana-master-delete-overlay{position:fixed!important;inset:0!important;z-index:10010!important;display:flex!important;align-items:center;justify-content:center;padding:18px;background:rgba(24,36,58,.53)}
.sadhana-master-delete-dialog{width:min(100%,470px)!important;max-height:88vh!important;overflow-y:auto;margin:auto!important;border-radius:16px!important}
.sadhana-master-delete-content{padding:20px;display:grid;gap:14px;font-size:14px}
.sadhana-master-delete-content>strong{overflow-wrap:anywhere;font-size:15px}
.sadhana-master-delete-summary{display:grid;grid-template-columns:1fr auto;gap:9px;background:#f4f6fa;padding:14px;border-radius:10px;color:#65728a}
.sadhana-master-delete-summary strong{color:#2e3a51;text-align:right}
.sadhana-master-delete-content p{display:flex;align-items:flex-start;gap:8px;margin:0;color:#8d3947;font-size:13px;line-height:1.5}
.sadhana-master-delete-content p svg{flex:0 0 auto}
.sadhana-master-delete-content details{font-size:12px;color:#65728a}
.sadhana-master-delete-dates{display:flex;gap:6px;flex-wrap:wrap;max-height:110px;overflow:auto;margin-top:8px}
.sadhana-master-delete-dates span{padding:4px 8px;border-radius:6px;background:#f4f6fa}
.sadhana-master-delete-buttons{display:flex;justify-content:flex-end;gap:9px;padding:16px 20px 20px;border-top:1px solid #edf0f5}
.sadhana-master-delete-buttons button{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:auto!important;padding:9px 14px!important;font-size:13px!important;min-height:39px;margin:0!important}
/* Same-row session actions; compact enough for the details drawer. */
.sadhana-session-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;align-items:stretch!important}
.sadhana-session-actions>button{grid-column:auto!important;min-width:0!important;width:100%!important;margin:0!important;padding:9px 5px!important;min-height:41px!important;font-size:12px!important;white-space:normal!important;line-height:1.25!important;justify-content:center!important;text-align:center!important}
.sadhana-session-actions:not(:has(.reg-danger)){grid-template-columns:repeat(2,minmax(0,1fr))!important}
@media(max-width:370px){.sadhana-session-actions>button{font-size:11px!important;padding:8px 3px!important}}
`;
