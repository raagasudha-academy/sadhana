import { useEffect, useState } from 'react';
import type { StudentPortalContext } from './useStudentPortalController';
import '../../classNotes.css';

type ClassNote = {
  id: string;
  classId: string;
  className: string;
  date: string;
  note: string;
};

export function StudentClassNotes({ context }: { context: StudentPortalContext }) {
  const { cloud, inst, activeId } = context;
  const [notes, setNotes] = useState<ClassNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!activeId) {
      setNotes([]);
      return;
    }
    setNotes([]);
    setBusy(true);
    setError('');
    void cloud.api
      .listLearnerClassNotes(inst, activeId)
      .then((result) => {
        if (active) setNotes(result.records);
      })
      .catch((loadError) => {
        if (active)
          setError(loadError instanceof Error ? loadError.message : 'Unable to load class notes.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [cloud.api, inst, activeId]);

  const notesByClass = new Map<string, ClassNote[]>();
  for (const note of notes) {
    const group = notesByClass.get(note.classId) ?? [];
    group.push(note);
    notesByClass.set(note.classId, group);
  }
  const classGroups = Array.from(notesByClass, ([classId, classNotes]) => ({
    classId,
    className: classNotes[0]?.className || 'Class',
    notes: classNotes,
  }));

  return (
    <section className="sv-class-notes">
      <header>
        <h2>
          Class Notes
          {classGroups.length === 1 ? ` · ${classGroups[0].className}` : ''}
        </h2>
        <p>Short takeaways shared by your teachers after each session.</p>
      </header>
      {error && (
        <p role="alert" className="sadhana-sync-error">
          {error}
        </p>
      )}
      {busy ? (
        <p role="status">Loading class notes…</p>
      ) : classGroups.length ? (
        classGroups.map((group) => (
          <section className="sv-class-notes-group" key={group.classId}>
            {classGroups.length > 1 && <h3>{group.className}</h3>}
            <div className="table-scroll sv-class-notes-table-wrap">
              <table className="data-table sv-class-notes-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Takeaway</th>
                  </tr>
                </thead>
                <tbody>
                  {group.notes.map((note) => (
                    <tr key={note.id}>
                      <td data-label="Date" className="sv-class-note-date">
                        {new Date(`${note.date}T12:00:00Z`).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </td>
                      <td data-label="Takeaway">
                        <p className="sv-class-note-takeaway">{note.note}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      ) : (
        <p className="sv-class-notes-empty">No class notes have been shared yet.</p>
      )}
    </section>
  );
}
