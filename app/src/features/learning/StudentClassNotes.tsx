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

  return (
    <section className="sv-class-notes">
      <header>
        <h2>Class Notes</h2>
        <p>Short takeaways shared by your teachers after each session.</p>
      </header>
      {error && (
        <p role="alert" className="sadhana-sync-error">
          {error}
        </p>
      )}
      {busy ? (
        <p role="status">Loading class notes…</p>
      ) : notes.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id}>
                  <td>
                    {new Date(`${note.date}T12:00:00Z`).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td>
                    <small className="sv-class-note-class">{note.className}</small>
                    <p>{note.note}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="sv-class-notes-empty">No class notes have been shared yet.</p>
      )}
    </section>
  );
}
