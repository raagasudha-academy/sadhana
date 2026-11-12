import CascadeDeleteControl from './CascadeDeleteControl';
import { DirectoryDataMenu, StudentCardBadges } from './DirectoryComponents';
import { persistArchiveState } from './archiveLifecycle';
import { filterStudentsByLocation, sortDirectoryStudents } from './directorySelectors';
import './registrationUxPolish.css';
import './registrationFamilyCards.css';
import './quickUnenrol.css';
import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  GraduationCap,
  Info,
  Plus,
  Search,
  ShieldCheck,
  UsersRound,
  X,
  Pencil,
  Archive,
  RotateCcw,
  CalendarDays,
  Download,
  Upload,
  List,
  Table2,
  Filter,
} from 'lucide-react';
import { institutions } from './institutions';
import { getEnrolmentStatus, maskPhone, newId, ukISODate } from './registry';
import PhoneField from './PhoneField';
import { lastFourWeeks, reportForStudent } from './practiceMath';

import {
  clean,
  familyLabel,
  readableLocation,
  studentLabel,
  Status,
  Modal,
  Field,
  StudentAvatar,
  NoResults,
  relationshipLabel,
  fmtDate,
} from './features/registration/registrationShared';
import {
  RegisterFamily,
  RegisterIndependent,
  AddChild,
} from './features/registration/registrationForms';
import {
  EnrolModal,
  EditName,
  ConfirmRemove,
  EditEnrolment,
} from './features/registration/registrationEnrolment';
import {
  FamilyDetail,
  UpdateFamily,
  ConvertToFamily,
} from './features/registration/registrationFamilies';
import { StudentRecord } from './features/registration/registrationStudents';

const ageFromDateOfBirth = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  )
    return '';
  const today = new Date();
  let age = today.getFullYear() - year;
  if (month < today.getMonth() + 1 || (month === today.getMonth() + 1 && day < today.getDate()))
    age--;
  return age >= 0 && age < 125 ? String(age) : '';
};

const displayAddress = (value: any) => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.values(value)
    .filter((part) => typeof part === 'string' && part.trim())
    .join(', ');
};

const displayStructuredDetails = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.entries(value)
    .filter(([, detail]) => detail !== '' && detail !== null && detail !== undefined)
    .map(([label, detail]) => {
      const readable = Array.isArray(detail)
        ? detail.join(', ')
        : typeof detail === 'object'
          ? JSON.stringify(detail)
          : String(detail);
      return readable ? `${label}: ${readable}` : '';
    })
    .filter(Boolean)
    .join('; ');
};

const displayAllergyDetails = (value: any) => {
  if (!value || typeof value !== 'object') return '';
  return [
    value.status === 'none' || value.status === 'no' ? 'No known allergies' : value.status,
    ...(Array.isArray(value.allergens) ? value.allergens : []),
    value.otherAllergens,
    value.details,
    value.reactionDetails,
    value.emergencyInstructions,
    value.carriesEmergencyMedication ? 'Carries emergency medication' : '',
  ]
    .filter(Boolean)
    .join('; ');
};

const consentText = (student: any) => {
  const consent =
    student.mediaConsent ||
    student.studentProfile?.mediaConsent ||
    student.consents?.photography ||
    student.studentProfile?.consents?.photography;
  if (typeof consent === 'boolean') return consent ? 'Granted' : 'Declined';
  if (typeof consent?.granted === 'boolean') return consent.granted ? 'Granted' : 'Declined';
  if (typeof consent?.photography === 'boolean')
    return consent.photography ? 'Granted' : 'Declined';
  return 'Not recorded';
};

const expandedStudentFields = (student: any, family: any, classes: string[], details: any = {}) => {
  const profile = { ...(student.studentProfile || {}), ...(details.studentProfile || {}) };
  const familyContact = details.familyContact || {};
  const emergency =
    profile.emergencyContactOverride ||
    student.emergencyContact ||
    familyContact.emergencyContact ||
    {};
  const allergy = profile.foodAllergies || student.foodAllergies;
  const dateOfBirth = profile.dateOfBirth || student.dateOfBirth;
  const mediaConsent = details.mediaConsent || profile.mediaConsent || student.mediaConsent;
  return {
    'Date of birth': dateOfBirth || '',
    Age: ageFromDateOfBirth(dateOfBirth),
    'Student email': student.email || details.email || family?.email || familyContact.email || '',
    'Parent / guardian': family?.parentName || '',
    'Parent email': family?.email || familyContact.email || '',
    'Parent phone': family?.phone || familyContact.phone || '',
    Address: displayAddress(
      student.contactAddress || student.address || details.address || familyContact.address,
    ),
    'Emergency contact': emergency.name || emergency.fullName || emergency.contactName || '',
    'Emergency phone': emergency.phone || emergency.mobile || emergency.contactPhone || '',
    'Dietary requirements / allergies': displayAllergyDetails(allergy),
    'Medical notes':
      profile.healthNotes || profile.srutiLearning?.medicalNotes || student.healthNotes || '',
    'Additional notes':
      profile.notes || student.notes || details.familyContact?.registrationNotes || '',
    'Social media consent': consentText({ ...student, studentProfile: profile, mediaConsent }),
    'Consent recorded at': mediaConsent?.recordedAt || profile.mediaConsent?.recordedAt || '',
    'Preferred class': profile.preferredClassId || student.preferredClassId || '',
    'Proposed start date': profile.proposedStartDate || student.proposedStartDate || '',
    'Contact preferences': displayStructuredDetails(
      profile.contactPreferences || student.contactPreferences,
    ),
    'Other registration details': displayStructuredDetails(
      profile.srutiLearning || student.srutiLearning,
    ),
    'Website registration':
      student.sourceWebsiteRegistrationId || details.sourceWebsiteRegistrationId || '',
    Classes: classes.join('; '),
  };
};

export default function RegistrationModule({
  workspace,
  families,
  members,
  enrolments,
  classes,
  setFamilies,
  setMembers,
  setEnrolments,
  initialClass = null,
  initialStudent = null,
  initialArea,
  initialFilter,
  initialView,
  practiceLogs = [],
  setPracticeLogs = () => {},
  isSuperAdmin = false,
  operationsApi = null,
  reload = async () => {},
}: any) {
  const [area, setArea] = useState(() => {
    try {
      if (initialArea) return initialArea;
      return sessionStorage.getItem(`sadhana:registration:${workspace}:area`) || 'students';
    } catch {
      return 'students';
    }
  });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(() => {
    try {
      if (initialFilter !== undefined) return initialFilter;
      return sessionStorage.getItem(`sadhana:registration:${workspace}:filter`) || 'All';
    } catch {
      return 'All';
    }
  });
  const [view, setView] = useState<'list' | 'table'>(() => {
    try {
      if (initialView) return initialView;
      return sessionStorage.getItem(`sadhana:registration:${workspace}:view`) === 'table'
        ? 'table'
        : sessionStorage.getItem(`sadhana:registration:${workspace}:view`) === 'list'
          ? 'list'
          : 'table';
    } catch {
      return 'list';
    }
  });
  // v096-table-sort-marker: presentation-only controls, never modify persisted records.
  const [tableSort, setTableSort] = useState<'roll' | 'name'>('roll');
  const [tableDirection, setTableDirection] = useState<'asc' | 'desc'>('asc');
  const [tableLocation, setTableLocation] = useState('All');
  const [directoryClass, setDirectoryClass] = useState('All');
  const [showAllFields, setShowAllFields] = useState(false);
  const [studentDetails, setStudentDetails] = useState<Record<string, any>>({});
  const [detailsError, setDetailsError] = useState('');
  const changeTableSort = (column: 'roll' | 'name') => {
    if (tableSort === column) setTableDirection((v) => (v === 'asc' ? 'desc' : 'asc'));
    else {
      setTableSort(column);
      setTableDirection('asc');
    }
  };
  useEffect(() => {
    try {
      sessionStorage.setItem(`sadhana:registration:${workspace}:area`, area);
      sessionStorage.setItem(`sadhana:registration:${workspace}:filter`, filter);
      sessionStorage.setItem(`sadhana:registration:${workspace}:view`, view);
    } catch {
      /* private mode */
    }
  }, [workspace, area, filter, view]);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [familyFocus, setFamilyFocus] = useState(null);
  const [studentFocus, setStudentFocus] = useState(initialStudent);
  const [dialog, setDialog] = useState(initialClass ? 'enrol' : null);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedClass, setSelectedClass] = useState(initialClass || '');
  const [newEnrolStudents, setNewEnrolStudents] = useState<any[]>([]);
  const [newEnrolFamilies, setNewEnrolFamilies] = useState<any[]>([]);
  const [flash, setFlash] = useState('');
  const [writeError, setWriteError] = useState('');
  const [writing, setWriting] = useState(false);
  const persist = async (work: () => Promise<any>, success: string, after?: () => void) => {
    if (writing) return;
    setWriting(true);
    setWriteError('');
    try {
      await work();
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Could not save to DynamoDB.');
      setWriting(false);
      return;
    }
    // The write has succeeded. A failed list refresh must not leave the modal
    // open (or falsely report that the student/enrolment was not saved).
    setDialog(null);
    setFlash(success);
    try {
      await reload();
    } catch {
      setFlash(
        `${success} The directory could not refresh; reload the page to see the saved record.`,
      );
    } finally {
      setWriting(false);
      after?.();
    }
  };
  const [editEnrol, setEditEnrol] = useState(null);
  const [removeEnrol, setRemoveEnrol] = useState<any>(null);
  const [removeContext, setRemoveContext] = useState<{
    studentName: string;
    className: string;
  } | null>(null);
  const scoped = useMemo(
    () => enrolments.filter((e) => e.institution === workspace),
    [enrolments, workspace],
  );
  const scopedIds = new Set(scoped.map((e) => e.studentId));
  const studentsInWorkspace = members.filter(
    (m) => scopedIds.has(m.id) || m.createdIn === workspace,
  );
  const studentStatus = (m: any) => {
    const statuses = scoped.filter((e) => e.studentId === m.id).map(getEnrolmentStatus);
    return m.archived
      ? 'Archived'
      : statuses.includes('Active')
        ? 'Active'
        : statuses.includes('Upcoming')
          ? 'Upcoming'
          : statuses.includes('Archived')
            ? 'Archived'
            : 'Registered';
  };
  const familyStatus = (f: any) => {
    if (f.archived) return 'Archived';
    const children = members.filter((m) => m.familyId === f.id);
    const statuses = children.map(studentStatus);
    return statuses.includes('Active')
      ? 'Active'
      : statuses.includes('Upcoming')
        ? 'Upcoming'
        : statuses.includes('Registered')
          ? 'Registered'
          : statuses.includes('Archived')
            ? 'Archived'
            : 'Registered';
  };
  const classNames = (m: any): string[] => [
    ...new Set<string>(
      scoped
        .filter((e) => e.studentId === m.id && !e.archived)
        .map((e) => classes.find((c) => c.id === e.classId)?.name as string | undefined)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const locationFor = (m: any) =>
    readableLocation(families.find((f) => f.id === m.familyId)?.location || m.location) || '—';
  const contactFor = (m: any) => m.phone || families.find((f) => f.id === m.familyId)?.phone || '';
  const exportCSV = async (allStudentFields = false) => {
    const details = allStudentFields ? await loadStudentDetails(tableStudents) : studentDetails;
    const defaultHeader = ['Roll No.', 'Student', 'Location', 'Phone', 'Classes', 'Status'];
    const detailHeader = [
      'Date of birth',
      'Age',
      'Student email',
      'Parent / guardian',
      'Parent email',
      'Parent phone',
      'Address',
      'Emergency contact',
      'Emergency phone',
      'Dietary requirements / allergies',
      'Medical notes',
      'Additional notes',
      'Social media consent',
      'Consent recorded at',
      'Preferred class',
      'Proposed start date',
      'Contact preferences',
      'Other registration details',
      'Website registration',
    ];
    const header =
      area !== 'families'
        ? [...defaultHeader, ...(allStudentFields ? detailHeader : [])]
        : ['Family ID', 'Parent / Guardian', 'Location', 'Students', 'Status', 'WhatsApp'];
    const rows =
      area !== 'families'
        ? tableStudents.map((m) => {
            const f = families.find((f) => f.id === m.familyId);
            const classList = classNames(m);
            const base = [
              studentLabel(m),
              m.name,
              locationFor(m),
              contactFor(m),
              classList.join('; '),
              studentStatus(m),
            ];
            return allStudentFields
              ? [
                  ...base,
                  ...Object.values(
                    expandedStudentFields(
                      m,
                      f,
                      classList,
                      details[`${workspace}:${m.id}:${m.version || 0}`],
                    ),
                  ).slice(0, -1),
                ]
              : base;
          })
        : visibleFamilies.map((f) => [
            familyLabel(f),
            f.parentName,
            f.location || '',
            members.filter((m) => m.familyId === f.id).length,
            familyStatus(f),
            f.phone || '',
          ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? '')
                .replace(/^[=+@\-\t\r]/, (m) => "'" + m)
                .replace(/"/g, '""') +
              '"',
          )
          .join(','),
      )
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sadhana-${area}-${workspace}${allStudentFields ? '-all-fields' : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const parseCSV = (raw: string) => {
    const rows: string[][] = [];
    let row: string[] = [],
      field = '',
      quote = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (quote) {
        if (c === '"' && raw[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') quote = false;
        else field += c;
      } else if (c === '"') quote = true;
      else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      } else field += c;
    }
    if (quote) throw Error('Unclosed quote in CSV.');
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim()));
  };
  const importCSV = async (file: File) => {
    setImportRows([]);
    setImportErrors([]);
    try {
      if (file.size > 250000) throw Error('CSV too large (max 250 KB).');
      const lines = parseCSV((await file.text()).replace(/^\uFEFF/, ''));
      const headers = (lines.shift() || []).map((x) => x.trim().toLowerCase());
      const required = [
        'student',
        'location',
        'student whatsapp',
        'family id',
        'parent / guardian',
        'parent whatsapp',
        'independent student',
      ];
      if (required.some((h) => !headers.includes(h)))
        throw Error('Use the import template; the required column headings do not match.');
      if (!lines.length) throw Error('CSV contains no student rows.');
      if (lines.length > 100) throw Error('Import up to 100 students per file.');
      const parsed = lines.map((row, i) => {
        const get = (h: string) => clean(row[headers.indexOf(h)] || '');
        return {
          line: i + 2,
          name: get('student'),
          location: get('location'),
          phone: get('student whatsapp').replace(/[\s-]/g, ''),
          familyNumber: get('family id'),
          parentName: get('parent / guardian'),
          parentPhone: get('parent whatsapp').replace(/[\s-]/g, ''),
          adultConfirmed: get('independent student').toLowerCase() === 'yes',
        };
      });
      const errors: string[] = [];
      const names = new Set<string>();
      parsed.forEach((r) => {
        const id = `${r.name.toLowerCase()}|${r.familyNumber || r.parentName.toLowerCase()}`;
        if (!r.name) errors.push(`Line ${r.line}: student name required`);
        if (
          names.has(id) ||
          members.some(
            (m) =>
              m.name.toLowerCase() === r.name.toLowerCase() &&
              (r.familyNumber
                ? families.some((f) => f.id === m.familyId && familyLabel(f) === r.familyNumber)
                : !m.familyId),
          )
        )
          errors.push(`Line ${r.line}: potential duplicate student`);
        names.add(id);
        if (r.phone && !/^\+[1-9]\d{7,14}$/.test(r.phone))
          errors.push(`Line ${r.line}: invalid student WhatsApp`);
        if (!r.familyNumber && !r.parentName && !r.adultConfirmed)
          errors.push(`Line ${r.line}: independent student must say Yes`);
        if (r.parentName && !/^\+[1-9]\d{7,14}$/.test(r.parentPhone))
          errors.push(`Line ${r.line}: parent WhatsApp required`);
        if (r.familyNumber && !families.some((f) => familyLabel(f) === r.familyNumber))
          errors.push(`Line ${r.line}: family number not found`);
      });
      setImportRows(parsed);
      setImportErrors(errors);
    } catch (e) {
      setImportErrors([e instanceof Error ? e.message : 'Unable to read CSV.']);
    }
  };
  const confirmImport = async () => {
    if (importBusy || importErrors.length || !importRows.length) return;
    setImportBusy(true);
    setWriteError('');
    try {
      const created = new Map<string, string>();
      for (const r of importRows) {
        let familyId = '';
        if (r.familyNumber) {
          familyId = families.find((f) => familyLabel(f) === r.familyNumber)?.id || '';
        } else if (r.parentName) {
          const key = `${r.parentName.toLowerCase()}|${r.parentPhone}`;
          familyId = created.get(key) || '';
          if (!familyId) {
            const existing = families.find(
              (f) =>
                f.parentName.toLowerCase() === r.parentName.toLowerCase() &&
                f.phone === r.parentPhone,
            );
            if (existing) familyId = existing.id;
            else {
              const result = await operationsApi.createOperation('family', workspace, {
                parentName: r.parentName,
                phone: r.parentPhone,
                location: r.location,
              });
              familyId = result.record.id;
            }
            created.set(key, familyId);
          }
        }
        await operationsApi.createOperation('student', workspace, {
          name: r.name,
          phone: r.phone,
          location: familyId ? '' : r.location,
          familyId,
          adultConfirmed: !familyId && r.adultConfirmed,
        });
      }
      await reload();
      setImportRows([]);
      setDialog(null);
      setFlash('CSV students imported and saved to DynamoDB.');
    } catch (e) {
      setWriteError(
        `Import stopped: ${e instanceof Error ? e.message : 'DynamoDB error'}. Earlier rows may have been saved. Refresh and review before retrying.`,
      );
      await reload();
      setDialog(null);
    } finally {
      setImportBusy(false);
    }
  };
  const downloadTemplate = () => {
    const csv =
      'Student,Location,Student WhatsApp,Family ID,Parent / Guardian,Parent WhatsApp,Independent Adult\r\n"Example Child","Newcastle","","","Example Parent","+447700900123","No"\r\n';
    const a = document.createElement('a'),
      url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.href = url;
    a.download = 'sadhana-student-import-template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // An earlier website importer created a one-person family for some adult students.
  // Treat only that exact legacy shape as an individual; preserve shared families.
  const isIndependentAdult = (m: any) => {
    if (!m.familyId) return true;
    if (!m.adultConfirmed || m.relationship === 'parent_guardian') return false;
    if (!m.sourceWebsiteRegistrationId) return false;
    const household = members.filter((person) => person.familyId === m.familyId);
    const family = families.find((f) => f.id === m.familyId);
    return (
      household.length === 1 &&
      household[0].id === m.id &&
      !!family &&
      family.sourceWebsiteRegistrationId === m.sourceWebsiteRegistrationId &&
      String(family.parentName || '')
        .trim()
        .toLowerCase() ===
        String(m.name || '')
          .trim()
          .toLowerCase()
    );
  };
  const isLegacyAdultFamily = (f: any) =>
    members.some((m) => m.familyId === f.id && isIndependentAdult(m));
  const visibleStudents = studentsInWorkspace.filter((m) => {
    if (area === 'individuals' && !isIndependentAdult(m)) return false;
    const matches = clean(
      `${m.name} ${m.id} ${studentLabel(m)} ${locationFor(m)} ${families.find((f) => f.id === m.familyId)?.parentName}`,
    )
      .toLowerCase()
      .includes(query.toLowerCase());
    const statuses = scoped.filter((e) => e.studentId === m.id).map(getEnrolmentStatus);
    const status = studentStatus(m);
    return matches && (filter === 'All' || filter === status);
  });
  const tableLocations = Array.from(
    new Set<string>(
      studentsInWorkspace
        .filter((m) => area !== 'individuals' || isIndependentAdult(m))
        .map((m) => String(locationFor(m) || '').trim())
        .filter((v) => v && v !== '—'),
    ),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const classFilteredStudents = visibleStudents.filter(
    (m) =>
      directoryClass === 'All' ||
      scoped.some((e) => e.studentId === m.id && e.classId === directoryClass && !e.archived),
  );
  const tableStudents = sortDirectoryStudents(
    filterStudentsByLocation(classFilteredStudents, tableLocation, locationFor),
    tableSort,
    tableDirection,
    studentLabel,
  );
  const loadStudentDetails = useCallback(
    async (rows: any[]) => {
      if (typeof operationsApi?.getStudentDetails !== 'function') {
        setDetailsError('Detailed student fields are unavailable from this API version.');
        return studentDetails;
      }
      const missing = rows.filter(
        (student) => !studentDetails[`${workspace}:${student.id}:${student.version || 0}`],
      );
      if (!missing.length) return studentDetails;
      const loaded: Record<string, any> = {};
      let failed = false;
      let firstError = '';
      for (let offset = 0; offset < missing.length; offset += 8) {
        const batch = missing.slice(offset, offset + 8);
        const results = await Promise.allSettled(
          batch.map((student) => operationsApi.getStudentDetails(workspace, student.id)),
        );
        results.forEach((result, index) => {
          if (result.status === 'fulfilled')
            loaded[`${workspace}:${batch[index].id}:${batch[index].version || 0}`] = result.value;
          else {
            failed = true;
            if (!firstError)
              firstError =
                result.reason instanceof Error ? result.reason.message : 'Request failed.';
          }
        });
      }
      if (Object.keys(loaded).length) setStudentDetails((current) => ({ ...current, ...loaded }));
      setDetailsError(failed ? `Some detailed fields could not be loaded: ${firstError}` : '');
      return { ...studentDetails, ...loaded };
    },
    [operationsApi, studentDetails, workspace],
  );
  useEffect(() => {
    if (showAllFields && area !== 'families') void loadStudentDetails(tableStudents);
  }, [showAllFields, area, tableStudents, loadStudentDetails]);
  const familyLocations = Array.from(
    new Set<string>(
      families
        .filter(
          (f) =>
            f.createdIn === workspace ||
            members.some((m) => m.familyId === f.id && scopedIds.has(m.id)),
        )
        .map((f) => String(f.location || '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const visibleFamilies = families
    .filter((f) => !isLegacyAdultFamily(f))
    .filter(
      (f) =>
        f.createdIn === workspace ||
        members.some((m) => m.familyId === f.id && scopedIds.has(m.id)),
    )
    .filter(
      (f) =>
        (tableLocation === 'All' ||
          String(f.location || '')
            .trim()
            .toLocaleLowerCase() === tableLocation.toLocaleLowerCase()) &&
        `${f.parentName} ${f.location || ''} ${f.id} ${familyLabel(f)} ${members
          .filter((m) => m.familyId === f.id)
          .map((m) => m.name)
          .join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === 'All' || familyStatus(f) === filter),
    );
  const openEnrol = (studentId = '', classId = '') => {
    setNewEnrolStudents([]);
    setNewEnrolFamilies([]);
    setSelectedStudent(studentId);
    setSelectedClass(classId);
    setDialog(studentId || classId ? 'enrol' : 'enrol-route');
  };
  const createAndEnrol = async (kind: 'family' | 'student', values: any) => {
    if (writing) return;
    setWriting(true);
    setWriteError('');
    try {
      const response = await operationsApi.createOperation(
        kind,
        workspace,
        kind === 'family'
          ? values
          : {
              name: values.name,
              email: values.email,
              phone: values.phone,
              location: values.location,
              familyId: '',
              adultConfirmed: true,
            },
      );
      const created = kind === 'family' ? response.students || [] : [response.record];
      if (!created.length)
        throw Error(
          'Registration saved, but no learner was returned. Refresh the directory before enrolling.',
        );
      setNewEnrolStudents(created.map((r: any) => ({ ...r, createdIn: workspace })));
      setNewEnrolFamilies(kind === 'family' ? [response.record] : []);
      setSelectedStudent(created.length === 1 ? created[0].id : '');
      // Keep this modal mounted until class enrolment finishes; reload on completion/cancel.
      setDialog('enrol');
      setFlash('Registration saved. Select the learner and class to complete enrolment.');
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Could not register student.');
    } finally {
      setWriting(false);
    }
  };
  const register = (values: any) =>
    void persist(
      async () => {
        await operationsApi.createOperation('family', workspace, values);
      },
      'Family and all selected learners saved together to DynamoDB.',
      () => {
        setArea('families');
        setQuery('');
        setFamilyFocus(null);
      },
    );
  const registerIndependent = (values: any) =>
    void persist(
      async () => {
        await operationsApi.createOperation('student', workspace, {
          name: values.name,
          email: values.email,
          phone: values.phone,
          location: values.location,
          familyId: '',
          adultConfirmed: true,
        });
      },
      'Independent Student saved to DynamoDB.',
      () => {
        setArea('students');
        setQuery('');
        setStudentFocus(null);
      },
    );
  const addChild = (values: any) =>
    void persist(async () => {
      if (values.existingPersonRole === 'primary_guardian') {
        if (!familyFocus || values.familyId !== familyFocus)
          throw Error('Choose the correct existing family.');
        await operationsApi.createOperation('student', workspace, {
          existingPersonRole: 'primary_guardian',
          familyId: familyFocus,
          relationship: 'parent_guardian',
        });
      } else {
        await operationsApi.createOperation('student', workspace, {
          name: values.name,
          email: values.email || '',
          phone: values.phone || '',
          familyId: familyFocus,
          relationship: 'child',
        });
      }
    }, 'Student registration saved. Select a class to enrol the learner.');
  const saveEnrol = (values: any) =>
    void persist(
      async () => {
        await operationsApi.createOperation('enrolment', workspace, {
          studentId: values.studentId,
          classId: values.classId,
          startDate: values.startDate,
          endDate: '',
        });
      },
      'Enrolment saved to DynamoDB.',
      () => {
        setStudentFocus(values.studentId);
        setFamilyFocus(null);
        setArea('students');
        setQuery('');
        setFilter('All');
      },
    );
  const updateRecord = (
    kind: 'family' | 'student' | 'enrolment',
    record: any,
    changes: any,
    message: string,
  ) =>
    void persist(async () => {
      await operationsApi.updateOperation(kind, workspace, record.id, changes, record.version);
    }, message);
  const confirmRemoveEnrol = () => {
    if (!removeEnrol || writing) return;
    const target = removeEnrol;
    void persist(
      async () => {
        await operationsApi.deleteEnrolment(workspace, target.id, target.version);
      },
      'Enrolment permanently removed. Student and family records were preserved.',
      () => {
        setRemoveEnrol(null);
        setRemoveContext(null);
      },
    );
  };
  const convertIndividual = (values: any) =>
    void persist(
      async () => {
        await operationsApi.createOperation('family', workspace, values);
      },
      'Family created and existing student linked. Original roll number and enrolments retained.',
      () => {
        setStudentFocus(null);
        setArea('families');
        setQuery('');
        setFilter('All');
      },
    );
  const [archiveTarget, setArchiveTarget] = useState<any>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);
  const confirmArchive = () => {
    if (!archiveTarget) return;
    const { kind, record, restore } = archiveTarget;
    setArchiveTarget(null);
    void persist(
      async () => {
        await persistArchiveState(operationsApi.updateOperation, kind, workspace, record, restore);
      },
      restore
        ? 'Record restored in DynamoDB.'
        : 'Record archived in DynamoDB; IDs and history preserved.',
    );
  };
  const family = families.find((f) => f.id === familyFocus);
  const person = members.find((m) => m.id === studentFocus);
  return (
    <div className="reg-module">
      {operationsApi && isSuperAdmin && (person || family) && (
        <CascadeDeleteControl
          allowed={isSuperAdmin}
          api={operationsApi}
          institution={workspace}
          target={
            person
              ? { type: 'students', id: person.id, name: person.name, version: person.version }
              : {
                  type: 'families',
                  id: family.id,
                  name: family.parentName,
                  version: family.version,
                }
          }
          onDeleted={async () => {
            setStudentFocus(null);
            setFamilyFocus(null);
            await reload();
          }}
        />
      )}
      {flash && (
        <div className="reg-success" role="status">
          <CheckCircle2 size={17} />
          <span>{flash}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setFlash('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {writeError && (
        <p role="alert" className="reg-error">
          {writeError}
        </p>
      )}
      {writing && (
        <p role="status" className="reg-footnote">
          Saving to DynamoDB…
        </p>
      )}
      {family ? (
        <FamilyDetail
          family={family}
          operationsApi={operationsApi}
          members={members}
          enrolments={enrolments}
          workspace={workspace}
          onBack={() => setFamilyFocus(null)}
          onAddChild={() => setDialog('child')}
          onEnrol={(id) => openEnrol(id)}
          classes={classes}
          onUpdate={() => setDialog('update-family')}
          onOpenStudent={(id) => {
            setFamilyFocus(null);
            setStudentFocus(id);
          }}
          onArchive={() => setArchiveTarget({ kind: 'family', record: family, restore: false })}
          onRestore={() => setArchiveTarget({ kind: 'family', record: family, restore: true })}
          onArchiveStudent={(student) =>
            setArchiveTarget({ kind: 'student', record: student, restore: false })
          }
          onRestoreStudent={(student) =>
            setArchiveTarget({ kind: 'student', record: student, restore: true })
          }
          onRemoveEnrol={(e, studentName, className) => {
            setRemoveEnrol(e);
            setRemoveContext({ studentName, className });
          }}
        />
      ) : person ? (
        <StudentRecord
          key={`${workspace}-${person.id}`}
          person={person}
          family={families.find((f) => f.id === person.familyId)}
          enrollments={enrolments}
          workspace={workspace}
          onBack={() => setStudentFocus(null)}
          onEnrol={(id) => openEnrol(id)}
          classes={classes}
          onEditName={() => setDialog('student-name')}
          onConvert={() => setDialog('convert-family')}
          onRemove={() => setArchiveTarget({ kind: 'student', record: person, restore: false })}
          onRestore={() => setArchiveTarget({ kind: 'student', record: person, restore: true })}
          onEditEnrol={(e) => {
            setEditEnrol(e);
            setDialog('edit-enrol');
          }}
          onRemoveEnrol={(e, studentName, className) => {
            setRemoveEnrol(e);
            setRemoveContext({
              studentName: studentName || person.name,
              className: className || classes.find((c) => c.id === e.classId)?.name || 'Class',
            });
          }}
          practiceLogs={practiceLogs}
        />
      ) : (
        <>
          <div className="reg-page-header">
            <div>
              <p className="reg-kicker">FAMILY & STUDENT MANAGEMENT</p>
              <h1>All Students</h1>
              <p>Browse students and linked family records for {institutions[workspace].name}.</p>
            </div>
          </div>
          <section className="surface reg-section">
            <div
              className="reg-toolbar"
              style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <div className="reg-tabs">
                <button
                  className={area === 'students' ? 'active' : ''}
                  onClick={() => {
                    setArea('students');
                    setQuery('');
                    setFilter('All');
                    setTableLocation('All');
                    setDirectoryClass('All');
                  }}
                >
                  Students
                </button>
                <button
                  className={area === 'families' ? 'active' : ''}
                  onClick={() => {
                    setArea('families');
                    setQuery('');
                    setFilter('All');
                    setTableLocation('All');
                    setDirectoryClass('All');
                  }}
                >
                  Family & Relationships
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginLeft: 'auto',
                }}
              >
                <div className="reg-search">
                  <Search size={17} />
                  <input
                    aria-label="Search family or student"
                    placeholder={
                      area === 'families'
                        ? 'Search families…'
                        : area === 'individuals'
                          ? 'Search individuals…'
                          : 'Search students…'
                    }
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <details className="reg-combined-filters">
                  <summary aria-label="Status, class and location filters">
                    <Filter size={15} /> Filters
                    {filter !== 'All' || tableLocation !== 'All' || directoryClass !== 'All'
                      ? ' · Active'
                      : ''}
                  </summary>
                  <div className="reg-combined-filter-panel">
                    <details className="reg-filter-section" open>
                      <summary>Status</summary>
                      <fieldset>
                        <legend>Status</legend>
                        {['All', 'Active', 'Upcoming', 'Registered', 'Archived'].map((v) => (
                          <label key={v}>
                            <input
                              type="radio"
                              name="directory-status"
                              checked={filter === v}
                              onChange={() => setFilter(v)}
                            />
                            {v === 'All' ? 'All statuses' : v}
                          </label>
                        ))}
                      </fieldset>
                    </details>
                    {area === 'students' && (
                      <details className="reg-filter-section">
                        <summary>Class</summary>
                        <fieldset>
                          <legend>Class</legend>
                          {[
                            { id: 'All', name: 'All classes' },
                            ...classes.map((c: any) => ({ id: c.id, name: c.name })),
                          ].map((c) => (
                            <label key={c.id}>
                              <input
                                type="radio"
                                name="directory-class"
                                checked={directoryClass === c.id}
                                onChange={() => setDirectoryClass(c.id)}
                              />
                              {c.name}
                            </label>
                          ))}
                        </fieldset>
                      </details>
                    )}
                    <details className="reg-filter-section">
                      <summary>Location</summary>
                      <fieldset>
                        <legend>Location</legend>
                        {['All', ...(area === 'families' ? familyLocations : tableLocations)].map(
                          (loc) => (
                            <label key={loc}>
                              <input
                                type="radio"
                                name="directory-location"
                                checked={tableLocation === loc}
                                onChange={() => setTableLocation(loc)}
                              />
                              {loc === 'All' ? 'All locations' : loc}
                            </label>
                          ),
                        )}
                      </fieldset>
                    </details>
                    <button
                      type="button"
                      onClick={() => {
                        setFilter('All');
                        setTableLocation('All');
                        setDirectoryClass('All');
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                </details>
                <DirectoryDataMenu
                  onImport={() => {
                    setImportRows([]);
                    setImportErrors([]);
                    setDialog('import-csv');
                  }}
                  onExportCurrent={() => exportCSV(false)}
                  onExportAll={area === 'families' ? undefined : () => exportCSV(true)}
                />
              </div>
            </div>
            <div
              className="reg-filter-line"
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                padding: '18px 0 16px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                role="group"
                aria-label="Directory view"
              >
                <button
                  type="button"
                  className={view === 'list' ? 'current' : ''}
                  aria-pressed={view === 'list'}
                  onClick={() => {
                    setView('list');
                    setShowAllFields(false);
                  }}
                >
                  <List size={15} /> List
                </button>
                <button
                  type="button"
                  className={view === 'table' ? 'current' : ''}
                  aria-pressed={view === 'table'}
                  onClick={() => setView('table')}
                >
                  <Table2 size={15} /> Table
                </button>
              </div>
              <div
                className="reg-actions"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginLeft: 'auto',
                }}
              >
                {area !== 'families' && (
                  <>
                    <label className="reg-show-all-fields">
                      <input
                        type="checkbox"
                        checked={showAllFields}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setShowAllFields(checked);
                          if (checked) setView('table');
                        }}
                      />
                      Show all fields
                    </label>
                    <button type="button" className="reg-secondary" onClick={() => openEnrol()}>
                      <GraduationCap size={16} /> Enrol student
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="reg-primary"
                  onClick={() => setDialog(area === 'individuals' ? 'independent' : 'family')}
                >
                  <Plus size={16} />
                  {area === 'individuals' ? 'Register individual' : 'Register family'}
                </button>
              </div>
            </div>
            {view === 'table' && area !== 'families' && (
              <>
                <p className="reg-table-result-count" role="status">
                  {tableStudents.length} student{tableStudents.length === 1 ? '' : 's'} shown
                </p>
                {detailsError && (
                  <p className="reg-details-error" role="status">
                    {detailsError}
                  </p>
                )}
              </>
            )}
            {view === 'table' ? (
              <div style={{ overflowX: 'auto' }}>
                <table
                  className={`reg-directory-table${showAllFields ? ' is-expanded' : ''}`}
                  style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
                >
                  <thead>
                    <tr>
                      {(area !== 'families'
                        ? [
                            'Roll No.',
                            'Student',
                            ...(showAllFields ? ['Date of birth', 'Age'] : []),
                            'Location',
                            'Phone',
                            ...(showAllFields
                              ? [
                                  'Student email',
                                  'Parent / guardian',
                                  'Parent email',
                                  'Parent phone',
                                  'Address',
                                  'Emergency contact',
                                  'Emergency phone',
                                  'Dietary requirements / allergies',
                                  'Medical notes',
                                  'Additional notes',
                                  'Social media consent',
                                  'Consent recorded at',
                                  'Preferred class',
                                  'Proposed start date',
                                  'Contact preferences',
                                  'Other registration details',
                                  'Website registration',
                                ]
                              : []),
                            'Classes',
                            'Status',
                          ]
                        : [
                            'Family ID',
                            'Parent / Guardian',
                            'Location',
                            'Phone',
                            'Students',
                            'Status',
                          ]
                      ).map((h) => (
                        <th
                          key={h}
                          scope="col"
                          aria-sort={
                            area !== 'families' &&
                            ((h === 'Roll No.' && tableSort === 'roll') ||
                              (h === 'Student' && tableSort === 'name'))
                              ? tableDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                          style={{ padding: '13px 12px', borderBottom: '1px solid #e4e9f1' }}
                        >
                          {area !== 'families' && (h === 'Roll No.' || h === 'Student') ? (
                            <button
                              type="button"
                              onClick={() => changeTableSort(h === 'Roll No.' ? 'roll' : 'name')}
                              aria-label={`Sort by ${h === 'Roll No.' ? 'roll number' : 'student name'}${(h === 'Roll No.' && tableSort === 'roll') || (h === 'Student' && tableSort === 'name') ? ', currently ' + (tableDirection === 'asc' ? 'ascending' : 'descending') : ''}`}
                              style={{
                                border: 0,
                                background: 'transparent',
                                color: 'inherit',
                                font: 'inherit',
                                fontWeight: 700,
                                cursor: 'pointer',
                                padding: 0,
                                display: 'inline-flex',
                                gap: 6,
                                alignItems: 'center',
                              }}
                            >
                              {h}
                              <span aria-hidden="true">
                                {(h === 'Roll No.' && tableSort === 'roll') ||
                                (h === 'Student' && tableSort === 'name')
                                  ? tableDirection === 'asc'
                                    ? '▲'
                                    : '▼'
                                  : '↕'}
                              </span>
                            </button>
                          ) : (
                            h
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {area !== 'families'
                      ? tableStudents.map((m) => {
                          const family = families.find((f) => f.id === m.familyId);
                          const classList = classNames(m);
                          const extended = expandedStudentFields(
                            m,
                            family,
                            classList,
                            studentDetails[`${workspace}:${m.id}:${m.version || 0}`],
                          );
                          return (
                            <tr
                              key={m.id}
                              onClick={() => setStudentFocus(m.id)}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') setStudentFocus(m.id);
                              }}
                              style={{ cursor: 'pointer', borderBottom: '1px solid #edf0f5' }}
                            >
                              <td style={{ padding: 12 }}>{studentLabel(m)}</td>
                              <td style={{ padding: 12 }}>
                                <strong>{m.name}</strong>
                              </td>
                              {showAllFields && (
                                <>
                                  <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                                    {extended['Date of birth'] || '—'}
                                  </td>
                                  <td style={{ padding: 12 }}>{extended.Age || '—'}</td>
                                </>
                              )}
                              <td style={{ padding: 12 }}>{locationFor(m)}</td>
                              <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                                {contactFor(m) || '—'}
                              </td>
                              {showAllFields &&
                                Object.entries(extended)
                                  .slice(2, -1)
                                  .map(([field, value]) => (
                                    <td key={field} style={{ padding: 12, minWidth: 140 }}>
                                      {value || '—'}
                                    </td>
                                  ))}
                              <td style={{ padding: 12 }}>{classList.join(', ') || '—'}</td>
                              <td style={{ padding: 12 }}>
                                <Status status={studentStatus(m)} />
                              </td>
                            </tr>
                          );
                        })
                      : visibleFamilies.map((f) => (
                          <tr
                            key={f.id}
                            onClick={() => setFamilyFocus(f.id)}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setFamilyFocus(f.id);
                            }}
                            style={{ cursor: 'pointer', borderBottom: '1px solid #edf0f5' }}
                          >
                            <td style={{ padding: 12 }}>{familyLabel(f)}</td>
                            <td style={{ padding: 12 }}>
                              <strong>{f.parentName}</strong>
                            </td>
                            <td style={{ padding: 12 }}>{f.location || '—'}</td>
                            <td style={{ padding: 12, whiteSpace: 'nowrap' }}>{f.phone || '—'}</td>
                            <td style={{ padding: 12 }}>
                              {members.filter((m) => m.familyId === f.id).length}
                            </td>
                            <td style={{ padding: 12 }}>
                              <Status status={familyStatus(f)} />
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            ) : area === 'families' ? (
              <div className="reg-stack">
                {visibleFamilies.map((f) => (
                  <button key={f.id} className="reg-entry" onClick={() => setFamilyFocus(f.id)}>
                    <span className="reg-icon">
                      <UsersRound size={19} />
                    </span>
                    <div className="reg-entry-main">
                      <strong>{f.parentName}</strong>
                      <small>
                        Family {familyLabel(f)} · {f.location || 'Location not set'} ·{' '}
                        {members.filter((m) => m.familyId === f.id).length} student(s) ·{' '}
                        {f.phone || 'No phone'}
                      </small>
                    </div>
                    <Status status={familyStatus(f)} />
                    <ChevronRight size={18} />
                  </button>
                ))}
                {!visibleFamilies.length && (
                  <NoResults
                    title="No families found"
                    detail="Register a family to create parent and student records."
                  />
                )}
              </div>
            ) : (
              <div className="reg-stack">
                {classFilteredStudents.map((m) => {
                  const family = families.find((f) => f.id === m.familyId);
                  return (
                    <div
                      className="reg-entry reg-directory-student-entry"
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open student profile: ${m.name}`}
                      onClick={() => setStudentFocus(m.id)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setStudentFocus(m.id);
                        }
                      }}
                    >
                      <StudentAvatar name={m.name} />
                      <div className="reg-entry-main">
                        <strong>{m.name}</strong>
                        <small>
                          {studentLabel(m)} · {locationFor(m)} · {contactFor(m) || 'No phone'} ·{' '}
                          {classNames(m).join(', ') || 'No class'} ·{' '}
                          {family?.parentName || 'Independent learner'}
                        </small>
                      </div>
                      <div className="reg-directory-student-trailing">
                        <Status status={studentStatus(m)} />
                        <div
                          className="reg-card-icon-actions reg-directory-student-actions"
                          role="group"
                          aria-label={`Actions for ${m.name}`}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="reg-card-icon"
                            title={`Edit profile: ${m.name}`}
                            aria-label={`Edit profile for ${m.name}`}
                            data-hint="Edit profile"
                            onClick={() => {
                              setStudentFocus(m.id);
                              setDialog('student-name');
                            }}
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            type="button"
                            className="reg-card-icon"
                            title={`Enrol in class: ${m.name}`}
                            aria-label={`Enrol ${m.name} in class`}
                            data-hint="Enrol in class"
                            disabled={!!m.archived}
                            onClick={() => openEnrol(m.id)}
                          >
                            <GraduationCap size={17} />
                          </button>
                          <button
                            type="button"
                            className={`reg-card-icon${m.archived ? '' : ' reg-card-icon-danger'}`}
                            title={`${m.archived ? 'Restore' : 'Archive'} student: ${m.name}`}
                            aria-label={`${m.archived ? 'Restore' : 'Archive'} student ${m.name}`}
                            data-hint={m.archived ? 'Restore student' : 'Archive student'}
                            onClick={() =>
                              setArchiveTarget({
                                kind: 'student',
                                record: m,
                                restore: !!m.archived,
                              })
                            }
                          >
                            {m.archived ? <RotateCcw size={17} /> : <Archive size={17} />}
                          </button>
                        </div>
                      </div>
                      <ChevronRight className="reg-directory-chevron" size={18} />
                    </div>
                  );
                })}
                {!visibleStudents.length && (
                  <NoResults
                    title="No matching students"
                    detail="Register a student or change the filter."
                  />
                )}
              </div>
            )}
            <p className="reg-footnote">
              <Info size={15} /> Records are saved to DynamoDB for this academy. Family and student
              IDs are shared across academies; class enrolments remain academy-specific.
            </p>
          </section>
        </>
      )}
      {dialog === 'import-csv' && (
        <Modal
          title="Import students from CSV"
          subtitle="Preview and validate before saving to DynamoDB. Roll numbers are allocated automatically."
          onClose={() => {
            if (!importBusy) setDialog(null);
          }}
        >
          <div className="reg-form">
            <p className="reg-muted">
              Use the template. For an existing family, enter its short Family ID. For a new family,
              enter parent name and WhatsApp. For an independent student, set Independent Adult to
              Yes.
            </p>
            <button type="button" className="reg-secondary" onClick={downloadTemplate}>
              <Download size={16} /> Download import template
            </button>
            <Field label="Choose CSV file">
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={importBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importCSV(f);
                }}
              />
            </Field>
            {importErrors.map((msg, i) => (
              <p className="reg-error" key={i}>
                {msg}
              </p>
            ))}
            {!!importRows.length && (
              <>
                <p>
                  <strong>{importRows.length} students ready for review</strong>
                </p>
                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                  <table style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Location</th>
                        <th>Family</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((r) => (
                        <tr key={r.line}>
                          <td>{r.name}</td>
                          <td>{r.location || '—'}</td>
                          <td>{r.familyNumber || r.parentName || 'Independent'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="reg-warning">
                  Import is not atomic: if a network failure occurs, some rows may already be saved.
                  Review the directory before retrying.
                </p>
              </>
            )}
            <div className="reg-modal-actions">
              <button
                type="button"
                className="reg-secondary"
                onClick={() => setDialog(null)}
                disabled={importBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="reg-primary"
                disabled={importBusy || !!importErrors.length || !importRows.length}
                onClick={() => void confirmImport()}
              >
                {importBusy ? 'Importing…' : `Confirm import (${importRows.length})`}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog === 'enrol-route' && (
        <Modal
          title="Enrol student"
          subtitle="Choose the right path for this learner. You can enrol a new or existing student."
          onClose={() => setDialog(null)}
        >
          <div className="reg-wizard-body">
            <div className="reg-wizard-progress">
              <span className="reg-wizard-progress-active">1 · Student</span>
              <span>2 · Registration</span>
              <span>3 · Class</span>
            </div>
            <div className="reg-wizard-eyebrow">STEP 1 OF 3</div>
            <h3 className="reg-wizard-question">Is the student already registered?</h3>
            <p className="reg-wizard-explain">
              Select an existing record to avoid duplicates, or register someone new before choosing
              their class.
            </p>
            <div className="reg-wizard-options">
              <button
                type="button"
                className="reg-wizard-option"
                onClick={() => setDialog('enrol')}
              >
                <span className="reg-wizard-option-icon">
                  <Search size={22} />
                </span>
                <span className="reg-wizard-option-copy">
                  <strong>Existing student</strong>
                  <small>Find a learner by name or roll number</small>
                </span>
                <ArrowRight size={19} />
              </button>
              <button
                type="button"
                className="reg-wizard-option"
                onClick={() => setDialog('enrol-new-type')}
              >
                <span className="reg-wizard-option-icon">
                  <Plus size={22} />
                </span>
                <span className="reg-wizard-option-copy">
                  <strong>New student</strong>
                  <small>Register a learner, then enrol them in a class</small>
                </span>
                <ArrowRight size={19} />
              </button>
            </div>
            <div className="reg-wizard-tip">
              <Info size={17} />
              <span>Existing students keep their permanent roll number and enrolment history.</span>
            </div>
            <div className="reg-wizard-footer">
              <button type="button" className="reg-secondary" onClick={() => setDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog === 'enrol-new-type' && (
        <Modal
          title="Register new student"
          subtitle="Choose how the learner belongs in Sadhana before selecting a class."
          onClose={() => setDialog(null)}
        >
          <div className="reg-wizard-body">
            <div className="reg-wizard-progress">
              <span className="reg-wizard-progress-done">1 · Student</span>
              <span className="reg-wizard-progress-active">2 · Registration</span>
              <span>3 · Class</span>
            </div>
            <div className="reg-wizard-eyebrow">STEP 2 OF 3</div>
            <h3 className="reg-wizard-question">How should we register this student?</h3>
            <p className="reg-wizard-explain">
              Each learner gets a unique roll number. Families can register multiple learners
              together.
            </p>
            <div className="reg-wizard-options">
              <button
                type="button"
                className="reg-wizard-option"
                onClick={() => setDialog('enrol-new-individual')}
              >
                <span className="reg-wizard-option-icon">
                  <GraduationCap size={22} />
                </span>
                <span className="reg-wizard-option-copy">
                  <strong>Independent Student</strong>
                  <small>A learner without a family record</small>
                </span>
                <ArrowRight size={19} />
              </button>
              <button
                type="button"
                className="reg-wizard-option"
                onClick={() => setDialog('enrol-new-family')}
              >
                <span className="reg-wizard-option-icon">
                  <UsersRound size={22} />
                </span>
                <span className="reg-wizard-option-copy">
                  <strong>Family registration</strong>
                  <small>Add a parent or guardian and one or more learners</small>
                </span>
                <ArrowRight size={19} />
              </button>
            </div>
            <div className="reg-wizard-footer">
              <button
                type="button"
                className="reg-secondary"
                onClick={() => setDialog('enrol-route')}
              >
                <ArrowLeft size={16} /> Back
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog === 'enrol-new-individual' && (
        <RegisterIndependent
          onClose={() => setDialog('enrol-new-type')}
          onSave={(v) => void createAndEnrol('student', v)}
        />
      )}
      {dialog === 'enrol-new-family' && (
        <RegisterFamily
          onClose={() => setDialog('enrol-new-type')}
          onSave={(v) => void createAndEnrol('family', v)}
        />
      )}
      {removeEnrol && (
        <Modal
          title="Un-enrol from class?"
          subtitle="Confirm removal of this class enrolment"
          onClose={() => {
            if (!writing) {
              setRemoveEnrol(null);
              setRemoveContext(null);
            }
          }}
        >
          <div className="reg-form">
            <p>
              Are you sure you want to un-enrol{' '}
              <strong>{removeContext?.studentName || 'this student'}</strong> from{' '}
              <strong>{removeContext?.className || 'this class'}</strong>?
            </p>
            <p className="reg-muted">
              This permanently removes the enrolment only. The student and family stay registered.
              Enrolments with learning history may be blocked by the backend.
            </p>
            <div className="reg-modal-actions">
              <button
                type="button"
                className="reg-secondary"
                disabled={writing}
                onClick={() => {
                  setRemoveEnrol(null);
                  setRemoveContext(null);
                }}
              >
                No, cancel
              </button>
              <button
                type="button"
                className="reg-danger"
                disabled={writing}
                onClick={confirmRemoveEnrol}
              >
                {writing ? 'Removing…' : 'Yes, un-enrol'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {archiveTarget && (
        <Modal
          title={`${archiveTarget.restore ? 'Restore' : 'Remove'} ${archiveTarget.kind}`}
          subtitle={archiveTarget.record.name || archiveTarget.record.parentName}
          onClose={() => {
            if (!cascadeBusy) setArchiveTarget(null);
          }}
        >
          <div className="reg-form">
            <div className="reg-warning">
              <CircleAlert size={18} />
              <span>
                {archiveTarget.restore
                  ? 'Restore this record to active directory use?'
                  : 'Archiving preserves identifiers, enrolments and academic history. Students with active enrolments, and families with unarchived members, cannot be archived.'}
              </span>
            </div>
            {archiveTarget.kind === 'student' &&
              !archiveTarget.restore &&
              operationsApi &&
              isSuperAdmin && (
                <CascadeDeleteControl
                  inline
                  allowed={isSuperAdmin}
                  api={operationsApi}
                  institution={workspace}
                  onBusyChange={setCascadeBusy}
                  target={{
                    type: 'students',
                    id: archiveTarget.record.id,
                    name: archiveTarget.record.name,
                    version: archiveTarget.record.version,
                  }}
                  onDeleted={async () => {
                    setArchiveTarget(null);
                    setStudentFocus(null);
                    await reload();
                  }}
                />
              )}
            <div className="reg-modal-actions">
              <button
                className="reg-secondary"
                disabled={cascadeBusy}
                onClick={() => setArchiveTarget(null)}
              >
                Cancel
              </button>
              <button className="reg-primary" disabled={cascadeBusy} onClick={confirmArchive}>
                {archiveTarget.restore ? 'Restore record' : 'Confirm archive'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog === 'family' && <RegisterFamily onClose={() => setDialog(null)} onSave={register} />}
      {dialog === 'convert-family' && person && !person.familyId && (
        <ConvertToFamily
          student={person}
          onClose={() => setDialog(null)}
          onSave={convertIndividual}
        />
      )}
      {dialog === 'independent' && (
        <RegisterIndependent onClose={() => setDialog(null)} onSave={registerIndependent} />
      )}
      {dialog === 'child' && family && (
        <AddChild family={family} onClose={() => setDialog(null)} onSave={addChild} />
      )}
      {dialog === 'enrol' && (
        <EnrolModal
          classes={classes}
          workspace={workspace}
          families={[
            ...families.filter((f: any) => !newEnrolFamilies.some((n: any) => n.id === f.id)),
            ...newEnrolFamilies,
          ]}
          members={[
            ...members.filter((m: any) => !newEnrolStudents.some((n: any) => n.id === m.id)),
            ...newEnrolStudents,
          ]}
          enrolments={enrolments}
          presetStudent={selectedStudent}
          presetClass={selectedClass}
          onSave={saveEnrol}
          onClose={() => {
            if (newEnrolStudents.length) void reload();
            setDialog(null);
          }}
        />
      )}
      {dialog === 'update-family' && family && (
        <UpdateFamily
          family={family}
          onClose={() => setDialog(null)}
          onSave={(changes) =>
            updateRecord('family', family, changes, 'Family details saved to DynamoDB.')
          }
        />
      )}
      {dialog === 'student-name' && person && (
        <EditName
          kind="student"
          record={person}
          family={families.find((f) => f.id === person.familyId)}
          onClose={() => setDialog(null)}
          onSave={(changes) =>
            updateRecord('student', person, changes, 'Student details saved to DynamoDB.')
          }
        />
      )}
      {dialog === 'edit-enrol' && editEnrol && (
        <EditEnrolment
          entry={editEnrol}
          onClose={() => setDialog(null)}
          onSave={(v) =>
            updateRecord('enrolment', editEnrol, v, 'Enrolment dates saved to DynamoDB.')
          }
        />
      )}
    </div>
  );
}
