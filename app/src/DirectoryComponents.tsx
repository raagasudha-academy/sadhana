import { Download, Upload } from 'lucide-react';

/** Shared family-card state badges; archived status must appear only once. */
export function StudentCardBadges({
  archived,
  activeEnrolmentCount,
  enrolmentStatus,
}: {
  archived: boolean;
  activeEnrolmentCount: number;
  enrolmentStatus: string;
}) {
  return (
    <div className="reg-card-badges">
      {archived ? (
        <span className="reg-enrolment-state is-archived">Archived</span>
      ) : (
        <>
          <span className="reg-student-registration">Registered</span>
          <span
            className={`reg-enrolment-state ${activeEnrolmentCount ? 'is-enrolled' : 'is-not-enrolled'}`}
          >
            {enrolmentStatus}
          </span>
        </>
      )}
    </div>
  );
}

/** Directory data menu: actions are injected so rendering tests never touch CSV or DynamoDB. */
export function DirectoryDataMenu({
  onImport,
  onExportCurrent,
  onExportAll,
}: {
  onImport: () => void;
  onExportCurrent: () => void;
  onExportAll?: () => void;
}) {
  return (
    <details className="reg-data-menu">
      <summary className="reg-secondary" aria-label="CSV data actions">
        Data <span aria-hidden="true">▾</span>
      </summary>
      <div className="reg-data-menu-options">
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.closest('details')?.removeAttribute('open');
            onImport();
          }}
        >
          <Download size={16} aria-hidden="true" data-testid="import-arrow" /> Import CSV
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.closest('details')?.removeAttribute('open');
            onExportCurrent();
          }}
        >
          <Upload size={16} aria-hidden="true" data-testid="export-arrow" /> Export filtered CSV
        </button>
        {onExportAll && (
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.closest('details')?.removeAttribute('open');
              onExportAll();
            }}
          >
            <Upload size={16} aria-hidden="true" /> Export all student fields
          </button>
        )}
      </div>
    </details>
  );
}
