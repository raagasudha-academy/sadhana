import './sharedShell.css';
import './roleWorkspace.css';
import {learnerPageMap} from './app/learnerNavigation';
import './learnerContent.css';
import './sessionFooter.css';
import {lazy, Suspense, useEffect, useState} from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  LogOut,
  Menu,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {institutions} from './institutions';
import {ClassFormDialog, VenueFormDialog, VenueManager} from './ClassManagement';
import {initialEnrolments, initialFamilies, initialMembers} from './registry';
import AcademyBrandIcon from './AcademyBrandIcon';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import {adminPages, needsAcademySelection} from './workspacePolicy';

import {ICONS} from "./app/appShared";
import {Dashboard} from "./app/AppOverview";
import {Timetable} from "./app/AppTimetable";
import {CommsPage, ProfileScreen, SettingsPage} from "./app/AppRecords";
import {AcademySelection, NotificationDrawer, SessionDrawer, StaffPortrait} from "./app/AppDrawers";

const StudentHome = lazy(() => import('./StudentHome'));
const SadhanaMyProfile = lazy(() => import('./SadhanaMyProfile'));
const FeesComingSoon = lazy(() => import('./features/sadhanaCoreStarter/FeesComingSoon'));
const TeacherManagement = lazy(() => import('./TeacherManagement'));
const AdminManagement = lazy(() => import('./AdminManagement'));
const AccountAccess = lazy(() => import('./AccountAccess'));
const AcademyOperations = lazy(() => import('./AcademyOperations'));
const PersistentRegistration = lazy(() => import('./PersistentRegistration'));
const LiveDashboard = lazy(() => import('./LiveDashboard'));
const WebsiteRegistrations = lazy(() => import('./WebsiteRegistrations'));

export default function App({cloud}: { cloud?: CloudSession } = {}) {
  const [ownPhotoUrl, setOwnPhotoUrl] = useState(cloud?.staff.photoUrl || '');
  // Signed photo URLs are temporary; refresh the account's OWN portrait at bootstrap.
  // Never derive this avatar from the selected learner/child record.
  useEffect(() => {
    if (!cloud?.api) return;
    let active = true;
    setOwnPhotoUrl(cloud.staff.photoUrl || '');
    void cloud.api.getMyProfile().then(profile => {
      if (active) setOwnPhotoUrl(profile.photoUrl || '');
    }).catch(() => {/* The existing avatar remains usable if profile read-back fails. */
    });
    return () => {
      active = false;
    };
  }, [cloud?.api, cloud?.staff.subject]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const [workspace, setWorkspace] = useState(() => {
    try {
      return sessionStorage.getItem('sadhana:v095:workspace') || 'combined';
    } catch {
      return 'combined';
    }
  });
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const [role, setRole] = useState<'admin' | 'teacher' | 'student'>(() => {
    try {
      const saved = sessionStorage.getItem('sadhana:view-as');
      return saved === 'teacher' || saved === 'student' ? saved : 'admin';
    } catch {
      return 'admin';
    }
  });
  const [learnerInstitutions, setLearnerInstitutions] = useState<InstitutionId[]>([]);
  const [familyChoices, setFamilyChoices] = useState<Array<{
    institution: InstitutionId;
    id: string;
    name: string;
    rollNumber: string
  }>>([]);
  const [chosenStudent, setChosenStudent] = useState(() => {
    try {
      return sessionStorage.getItem('sadhana:selected-student') || '';
    } catch {
      return '';
    }
  });
  const [familyAccessError, setFamilyAccessError] = useState('');
  const [familyAccessRetry, setFamilyAccessRetry] = useState(0);
  // Do not treat an in-flight or failed family lookup as a confirmed access revocation.
  const [familyAccessResolved, setFamilyAccessResolved] = useState(false);
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    // A failed guardian lookup is not proof that the family has no approved children.
    Promise.allSettled((['raaga', 'sruti'] as InstitutionId[]).map(async institution => ({
      institution,
      records: (await cloud.api.myLinkedStudents(institution)).records
    })))
      .then(results => {
        if (!active) return;
        const institutions: InstitutionId[] = ['raaga', 'sruti'];
        const success = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        const failed = results.flatMap((result, index) => result.status === 'rejected' ? [institutions[index]] : []);
        setFamilyAccessError(failed.length ? `Could not verify approved family access for ${failed.map(i => i === 'raaga' ? 'Raagasudha' : 'Śruti Vedam').join(' and ')}. Please retry; this does not mean your approvals were removed.` : '');
        // Replace only verified academies. Failed academy lookups must not clear
        // previously approved choices or force a View As role transition.
        setLearnerInstitutions(previous => {
          const verified = new Set(success.map(r => r.institution));
          return [...previous.filter(i => !verified.has(i)), ...success.filter(r => r.records.length).map(r => r.institution)];
        });
        setFamilyChoices(previous => {
          const verified = new Set(success.map(r => r.institution));
          return [...previous.filter(c => !verified.has(c.institution)), ...success.flatMap(r => r.records.map(s => ({
            institution: r.institution,
            id: s.id,
            name: s.name,
            rollNumber: s.rollNumber
          })))];
        });
        if (!failed.length) setFamilyAccessResolved(true);
      });
    return () => {
      active = false
    };
  }, [cloud?.api, familyAccessRetry]);
  const [page, setPage] = useState(() => {
    try {
      return sessionStorage.getItem('sadhana:v095:page') || 'Dashboard';
    } catch {
      return 'Dashboard';
    }
  });
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem('sadhana:v095:page', page);
      sessionStorage.setItem('sadhana:v095:workspace', workspace);
    } catch {/* private mode */
    }
  }, [page, workspace]);
  const [student, setStudent] = useState(null);
  const [classProfile, setClassProfile] = useState(null);
  const [profileTab, setProfileTab] = useState('Overview');
  const [session, setSession] = useState(null);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [studentFilter, setStudentFilter] = useState('All');
  const [studentQuery, setStudentQuery] = useState('');
  const [classView, setClassView] = useState('month');
  const [weekOffset, setWeekOffset] = useState(0);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState('all');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [families, setFamilies] = useState(initialFamilies);
  const [members, setMembers] = useState(initialMembers);
  const [enrolments, setEnrolments] = useState(initialEnrolments);
  const [classes, setClasses] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [venueLinks, setVenueLinks] = useState<Record<string, { masters: number; sessions: number }>>({});
  const [venueError, setVenueError] = useState('');
  const [venueSuccess, setVenueSuccess] = useState('');
  const refreshLiveData = async () => {
    if (!cloud || cloud.staff.role === 'learner') return;
    const allowed = cloud.staff.institutions.filter((inst): inst is InstitutionId => inst === 'raaga' || inst === 'sruti');
    if (!allowed.length) return;
    const [directory, schedules] = await Promise.all([
      cloud.api.list('venues', allowed[0]),
      Promise.all(allowed.map(institution => cloud.api.listSchedule(institution))),
    ]);
    const links: Record<string, { masters: number; sessions: number }> = {};
    for (const [i, schedule] of schedules.entries()) for (const record of schedule.records || []) {
      // Count only records belonging to the requested institution.
      if (record.institution !== allowed[i] || !record.venueId) continue;
      if (!links[record.venueId]) links[record.venueId] = {masters: 0, sessions: 0};
      if (record.recordType === 'class') links[record.venueId].masters++;
      else if (record.recordType === 'class-session') links[record.venueId].sessions++;
    }
    setVenues(directory.records || []);
    setVenueLinks(links);
    setVenueError('');
  };
  useEffect(() => {
    if (!cloud || cloud.staff.role === 'learner') {
      setVenues([]);
      setVenueLinks({});
      return;
    }
    let alive = true;
    // Only update state while mounted; future reloads are triggered by the Sync button.
    const allowed = cloud.staff.institutions.filter((inst): inst is InstitutionId => inst === 'raaga' || inst === 'sruti');
    if (!allowed.length) return;
    Promise.all([cloud.api.list('venues', allowed[0]), Promise.all(allowed.map(inst => cloud.api.listSchedule(inst)))])
      .then(([directory, schedules]) => {
        if (!alive) return;
        setVenues(directory.records || []);
        const links: Record<string, { masters: number; sessions: number }> = {};
        schedules.forEach((schedule, i) => {
          for (const r of schedule.records || []) {
            if (r.institution !== allowed[i] || !r.venueId) continue;
            if (!links[r.venueId]) links[r.venueId] = {masters: 0, sessions: 0};
            if (r.recordType === 'class') links[r.venueId].masters++;
            else if (r.recordType === 'class-session') links[r.venueId].sessions++;
          }
        });
        setVenueLinks(links);
      }).catch((error: Error) => {
      if (alive) setVenueError(error.message);
    });
    return () => {
      alive = false;
    };
  }, [cloud?.api, cloud?.staff.role, cloud?.staff.subject]);
  const syncNow = async () => {
    if (!cloud || syncing) return;
    setSyncing(true);
    setSyncError('');
    setSyncMessage('');
    try {
      await refreshLiveData();
      setScheduleRevision(n => n + 1); // Force timetable to re-read Sadhana records.
      setSyncMessage(`Live data updated at ${new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date())}`);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Could not sync live data.');
    } finally {
      setSyncing(false);
    }
  };
  const [practiceLogs, setPracticeLogs] = useState<any[]>([]);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [classDialog, setClassDialog] = useState(null);
  const [venueDialog, setVenueDialog] = useState(null);
  const [changeNotice, setChangeNotice] = useState('');
  const [enrolClass, setEnrolClass] = useState('');
  const [registerOpenStudent, setRegisterOpenStudent] = useState('');
  const rawName = cloud?.staff.displayName?.trim() || 'Administrator';
  const displayName = rawName[0].toLocaleUpperCase('en-GB') + rawName.slice(1);
  const person = {
    label: displayName, initial: (displayName[0] || 'A').toLocaleUpperCase('en-GB'),
    institutions: cloud?.staff.institutions ?? [], admin: cloud?.staff.role === 'admin',
    teacher: !!cloud?.staff.teacherInstitutions?.length || cloud?.staff.role === 'viewer'
  };
  const availableInstitutions: InstitutionId[] = person.institutions;
  const verifiedTeachingInstitutions = (cloud?.staff.teacherInstitutions || []).filter(i => availableInstitutions.includes(i));
  // A selected view cannot create a permission; it only changes navigation.
  const currentRole = cloud?.staff.role === 'learner' ? 'student' : person.admin ? role : (verifiedTeachingInstitutions.length ? 'teacher' : learnerInstitutions.length ? 'student' : 'teacher');
  const studentMode = currentRole === 'student';
  const teacherMode = currentRole === 'teacher';
  const allowedWorkspaces = studentMode ? learnerInstitutions : teacherMode ? (verifiedTeachingInstitutions.length ? verifiedTeachingInstitutions : availableInstitutions) : person.admin && person.institutions.length > 1 ? ['combined', ...person.institutions] : person.institutions;
  const currentWorkspace = allowedWorkspaces.includes(workspace) ? workspace : (allowedWorkspaces[0] || 'sruti');
  const nav = (
    studentMode
      ? [
        'Dashboard',
        'My classes',
        'My learning',
        'My academy',
        'My profile',
      ]
      : teacherMode
        ? ['Dashboard', 'My Classes', 'My Students', 'Teachers', 'Venues']
        : [...adminPages.slice(0, -1), 'Account Access', 'Fees', ...adminPages.slice(-1)]
  ).filter(
    item =>
      item !== 'Website Registrations' ||
      (currentWorkspace === 'raaga' && person.admin && !teacherMode)
  );
  const activePage = page === 'My Profile' ? 'My Profile' : nav.some(item => item === page) ? page : 'Dashboard';
  const unread = notifications.filter(n => !n.read && availableInstitutions.includes(n.institution)).length;
  const switchWorkspace = (w) => {
    setWorkspace(w);
    if (!studentMode) setPage('Dashboard');
    setStudent(null);
    setClassProfile(null);
    setMobileNav(false);
  };
  const switchRole = (r: 'admin' | 'teacher') => {
    if (r === 'admin' && !person.admin) return;
    if (r === 'teacher' && !verifiedTeachingInstitutions.length) return;
    setRole(r);
    try {
      sessionStorage.setItem('sadhana:view-as', r);
    } catch {/* private mode */
    }
    if (r === 'teacher') setWorkspace(verifiedTeachingInstitutions[0]);
    setPage('Dashboard');
    setStudent(null);
    setClassProfile(null);
    setMobileNav(false);
  };
  // One explicit View As action selects both the student identity and its academy.
  const switchToStudent = (choice: { institution: InstitutionId; id: string }) => {
    if (!familyChoices.some(c => c.institution === choice.institution && c.id === choice.id)) return;
    setChosenStudent(choice.id);
    setWorkspace(choice.institution);
    setRole('student');
    try {
      sessionStorage.setItem('sadhana:view-as', 'student');
      sessionStorage.setItem('sadhana:selected-student', choice.id);
    } catch {/* private mode */
    }
    setPage('Dashboard');
    setStudent(null);
    setClassProfile(null);
    setMobileNav(false);
  };
  const goPage = (p) => {
    setEnrolClass('');
    setRegisterOpenStudent('');
    setPage(p);
    setStudent(null);
    setClassProfile(null);
    setMobileNav(false);
    if (p === 'Families & Students' || p === 'My Students') {
      setStudentFilter('All');
      setStudentQuery('');
    }
  };
  const openStudent = (s) => {
    setWorkspace(s.institution);
    setStudent(teacherMode ? s : null);
    setRegisterOpenStudent(teacherMode ? '' : s.id);
    setEnrolClass('');
    setClassProfile(null);
    setProfileTab('Overview');
    setPage(teacherMode ? 'My Students' : 'Families & Students');
  };
  const openClass = (c) => {
    setClassProfile(c);
    setStudent(null);
    setSession(null);
    setProfileTab('Overview');
    setPage(teacherMode ? 'My Classes' : 'Classes & Timetable');
  };
  const enrolFromClass = (id) => {
    setRegisterOpenStudent('');
    setEnrolClass(id);
    setClassProfile(null);
    setStudent(null);
    setPage('Families & Students');
  };
  const editClass = (c) => setClassDialog({record: c});
  const saveClass = (draft, id) => {
    if (id) {
      setClasses(prev => prev.map(c => c.id === id ? {...c, ...draft} : c));
      setClassProfile(prev => prev?.id === id ? {...prev, ...draft} : prev);
    } else setClasses(prev => [...prev, {
      ...draft,
      id: `${currentWorkspace === 'raaga' ? 'R' : 'S'}-${String(Math.max(100, ...prev.filter(c => c.institution === currentWorkspace).map(c => Number(c.id.match(/(\d+)$/)?.[1] || 0))) + 1)}`,
      institution: currentWorkspace,
      studentCount: 0,
      status: 'Scheduled'
    }]);
    setClassDialog(null);
    setChangeNotice(id ? 'Class updated locally.' : 'Class created locally.');
  };
  const saveVenue = async (draft: any, id?: string) => {
    if (!cloud || cloud.staff.role !== 'admin' || teacherMode) throw new Error('Administrator access is required to edit venues.');
    const institution: InstitutionId = (currentWorkspace === 'raaga' || currentWorkspace === 'sruti') && cloud.staff.institutions.includes(currentWorkspace)
      ? currentWorkspace : cloud.staff.institutions[0];
    if (!institution) throw new Error('An authorised academy administrator role is required to edit venues.');
    setVenueError('');
    setVenueSuccess('');
    try {
      if (id) {
        const existing = venues.find(v => v.id === id);
        if (!existing || !Number.isInteger(existing.version)) throw new Error('Venue version missing. Refresh before editing.');
        const result = await cloud.api.update('venues', id, institution, draft, existing.version);
        setVenues(prev => prev.map(v => v.id === id ? result.record : v));
      } else {
        const result = await cloud.api.create('venues', institution, draft);
        setVenues(prev => [...prev, result.record].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      }
      setVenueDialog(null);
      setVenueSuccess(id ? 'Venue details saved to DynamoDB. Linked calendar sessions now show the updated details.' : 'New venue saved to DynamoDB.');
    } catch (error) {
      if (error instanceof Error && /changed|refresh/i.test(error.message)) setVenueError('Conflict detected. Refresh the page before trying again.');
      throw error;
    }
  };
  const chooseAcademyForPage = (institution: InstitutionId) => {
    if (!availableInstitutions.includes(institution)) return;
    setWorkspace(institution);
    setStudent(null);
    setClassProfile(null);
    setMobileNav(false);
    // Keep the selected page: it becomes available in the chosen academy.
  };
  const requestDeleteClass = (record) => setDeletePrompt({type: 'class', record});
  const performDelete = () => {
    const {record} = deletePrompt;
    {
      const linked = enrolments.some(e => e.classId === record.id);
      if (linked) {
        setClasses(prev => prev.map(c => c.id === record.id ? {...c, archived: true} : c));
        setChangeNotice('Class archived because linked student enrolments exist. Historical records preserved.');
      } else {
        setClasses(prev => prev.filter(c => c.id !== record.id));
        setChangeNotice('Unlinked local class deleted.');
      }
      setClassProfile(null);
      setSession(null);
    }
    setDeletePrompt(null);
  };
  const workspaceName = currentWorkspace === 'combined' ? 'All Institutions' : institutions[currentWorkspace].name;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-show' : ''}`}>
      <div className="brand">
        <div className="brand-symbol"><AcademyBrandIcon/></div>
        <div><strong>Sadhana</strong><small>ACADEMY &amp; LEARNING PORTAL</small></div>
      </div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <div className="sidebar-workspace sadhana-workspace-dropdown">
        <button type="button"
                className="sadhana-workspace-button"
                aria-label="Choose workspace"
                aria-expanded={workspaceExpanded}
                onClick={() => setWorkspaceExpanded(v => !v)}>
    <span className="sidebar-work-icon">
      {currentWorkspace === 'sruti' ? <AcademyBrandIcon academy="sruti"/> : currentWorkspace === 'raaga' ?
        <AcademyBrandIcon academy="raaga"/> : <AcademyBrandIcon/>}
    </span>
          <span className="sadhana-workspace-text">
      <strong>{workspaceName}</strong>
      <small>{studentMode ? 'Learning portal' : teacherMode ? 'My Teaching' : 'Administration'}</small>
    </span>
          <ChevronDown size={17}
                       className={workspaceExpanded
                         ? 'sadhana-workspace-chevron open'
                         : 'sadhana-workspace-chevron'}/>
        </button>

        {workspaceExpanded &&
            <div className="sadhana-workspace-options"
                 role="group" aria-label="Select an institution">
              {studentMode && familyAccessError &&
                  <div role="alert" style={{padding: 10, fontSize: 12}}>{familyAccessError}
                      <button type="button" onClick={() => setFamilyAccessRetry(n => n + 1)}>Retry verification</button>
                  </div>}
              {allowedWorkspaces.map(w =>
                <button type="button" key={w}
                        className={w === currentWorkspace
                          ? 'sadhana-workspace-option active'
                          : 'sadhana-workspace-option'}
                        onClick={() => {
                          switchWorkspace(w);
                          setWorkspaceExpanded(false);
                        }}>
                  {w === 'combined' ? <AcademyBrandIcon size={19}/> : w === 'sruti' ?
                    <AcademyBrandIcon academy="sruti" size={19}/> : <AcademyBrandIcon academy="raaga" size={19}/>}
                  <span>{w === 'combined'
                    ? 'All Institutions'
                    : institutions[w].name}</span>
                  {w === currentWorkspace && <Check size={15}/>}
                </button>
              )}
            </div>
        }
      </div>
      {(studentMode || person.admin && (verifiedTeachingInstitutions.length > 0 || familyChoices.length > 0)) &&
          <fieldset className="sadhana-view-as" aria-label="View as" style={{
            margin: '12px 16px 16px',
            padding: '11px 13px',
            border: '1px solid #536781',
            borderRadius: 11,
            display: 'grid',
            gap: 9,
            color: '#eef3fb',
            fontSize: 13
          }}>
              <legend style={{
                padding: '0 5px',
                fontSize: 10,
                letterSpacing: '.13em',
                fontWeight: 700,
                color: '#c5d1e2'
              }}>VIEW AS
              </legend>
            {person.admin &&
                <label style={{display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer'}}><input type="radio"
                                                                                                         name="sadhana-view-as"
                                                                                                         checked={currentRole === 'admin'}
                                                                                                         onChange={() => switchRole('admin')}/> Administrator</label>}
            {person.admin && verifiedTeachingInstitutions.length > 0 &&
                <label style={{display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer'}}><input type="radio"
                                                                                                         name="sadhana-view-as"
                                                                                                         checked={currentRole === 'teacher'}
                                                                                                         onChange={() => switchRole('teacher')}/> Teacher</label>}
            {familyChoices.filter(child => currentWorkspace === 'combined' || child.institution === currentWorkspace).map(child =>
              <label key={`${child.institution}:${child.id}`}
                     style={{display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer'}}>
                <input type="radio" name="sadhana-view-as"
                       checked={studentMode && currentWorkspace === child.institution && chosenStudent === child.id}
                       onChange={() => switchToStudent(child)}/>
                <span>{child.name}</span>
              </label>)}
            {studentMode && !familyChoices.length &&
                <span>{familyAccessError ? 'Family access could not be verified.' : 'No approved students available.'}</span>}
          </fieldset>}
      <div className="sidebar-nav-scroll" tabIndex={0} aria-label="Sidebar menu, scroll for more options">
        <div className="sidebar-section-label">MENU</div>
        <nav aria-label="Primary navigation">{nav.map(p => {
          const Icon = ICONS[p];
          return <button key={p} onClick={() => goPage(p)}
                         className={`nav-link ${activePage === p ? 'nav-active' : ''}`}><Icon
            size={18}/><span>{p}</span>{p === 'Dashboard' && <span className="nav-tiny-dot"/>}</button>;
        })}</nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><Sparkles size={20}/><strong>Thoughtfully built, step by step.</strong><span>Academy and Learning Portal</span>
          </div>
          <span className="sidebar-foot">Raagasudha × Śruti Vedam</span></div>
      </div>
    </aside>
    {mobileNav &&
        <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <div className="app-main">
      <header className="topbar">
        <div className="topbar-left">
          <button className="mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label="Toggle menu"><Menu
            size={21}/></button>
        </div>
        <div className="topbar-actions">

          <div className="topbar-account">

            <button
              type="button"
              className="user-avatar sadhana-profile-avatar"
              onClick={() => goPage(studentMode ? 'My profile' : 'My Profile')}
              title="My Profile"
              aria-label="Open My Profile">
              <StaffPortrait
                name={person.label}
                initial={person.initial}
                photoUrl={ownPhotoUrl}
              />
            </button>

            <div className="topbar-account-details">

              <button
                type="button"
                className="topbar-account-name"
                onClick={() => goPage(studentMode ? 'My profile' : 'My Profile')}
                title="Open My Profile">
                {person.label}
              </button>

              <div className="topbar-account-tools">

                {person.admin && (
                  <button
                    type="button"
                    className="notification-trigger topbar-tool"
                    title="Notifications"
                    aria-label="Open notifications"
                    onClick={() => setNotifsOpen(true)}>
                    <Bell size={17}/>
                    {unread > 0 && <span>{unread}</span>}
                  </button>
                )}

                {cloud && (
                  <button
                    type="button"
                    className="cloud-topbar-btn sync-button topbar-tool"
                    onClick={() => void syncNow()}
                    disabled={syncing}
                    title={syncing ? 'Syncing…' : 'Sync live data'}
                    aria-label={syncing ? 'Syncing live data' : 'Sync live data'}>
                    <RefreshCw
                      size={17}
                      className={syncing ? 'sync-spinning' : ''}
                    />
                  </button>
                )}

                {cloud && (
                  <button
                    type="button"
                    className="cloud-logout topbar-tool"
                    onClick={() => void cloud.signOut()}
                    title="Sign out of Sadhana"
                    aria-label="Sign out of Sadhana">
                    <LogOut size={17}/>
                  </button>
                )}

              </div>
            </div>
          </div>
        </div>
      </header>
      {(syncMessage || syncError) && <div className={`sync-notice ${syncError ? 'sync-notice-error' : ''}`}
                                          role="status">{syncError || syncMessage}
          <button type="button" onClick={() => {
            setSyncMessage('');
            setSyncError('');
          }} aria-label="Dismiss sync message"><X size={14}/></button>
      </div>}
      <main className="content"><Suspense
        fallback={<p role="status">Loading section…</p>}>{studentMode && cloud && activePage === 'My profile' ?
        <SadhanaMyProfile cloud={cloud} onPhotoChange={setOwnPhotoUrl}/> : studentMode && cloud ? <StudentHome
          cloud={cloud}
          initialInstitution={currentWorkspace as InstitutionId}
          embedded
          page={learnerPageMap[activePage] || 'overview'}
          selectedStudentId={chosenStudent}
          onStudentChange={(id) => {
            if (familyChoices.some(c => c.institution === currentWorkspace && c.id === id)) switchToStudent({
              institution: currentWorkspace as InstitutionId,
              id
            });
          }}
          onNavigate={(destination) => {
            const section: Record<import('./StudentHome').LearnerPage, string> = {
              overview: 'Dashboard',
              classes: 'My classes',
              calendar: 'My classes',
              attendance: 'My classes',
              venues: 'My classes',
              homework: 'My learning',
              practice: 'My learning',
              teachers: 'My academy',
              profile: 'My profile',
              privacy: 'My profile',
            };

            goPage(section[destination]);
          }}
        /> : <>{venueSuccess &&
              <div className="reg-success" role="status"><CheckCircle2 size={17}/><span>{venueSuccess}</span>
                  <button aria-label="Dismiss" onClick={() => setVenueSuccess('')}><X size={15}/></button>
              </div>}{changeNotice &&
              <div className="reg-success" role="status"><CheckCircle2 size={17}/><span>{changeNotice} These changes are local only and reset on refresh.</span>
                  <button aria-label="Dismiss" onClick={() => setChangeNotice('')}><X size={15}/></button>
              </div>}{student ?
          <ProfileScreen student={student} activeTab={profileTab} setTab={setProfileTab} onBack={() => setStudent(null)}
                         enrolments={enrolments} members={members} isTeacher={teacherMode}/> : classProfile ?
            <ProfileScreen classItem={classProfile} activeTab={profileTab} setTab={setProfileTab}
                           onBack={() => setClassProfile(null)} enrolments={enrolments} members={members}
                           isTeacher={teacherMode} onEnrolFromClass={enrolFromClass} onEditClass={editClass}
                           onDeleteClass={requestDeleteClass}
                           cloud={cloud}/> : needsAcademySelection(currentWorkspace, activePage) ?
              <AcademySelection page={activePage} allowed={availableInstitutions}
                                onSelect={chooseAcademyForPage}/> : activePage === 'My Profile' && cloud ?
                <SadhanaMyProfile cloud={cloud}
                                  onPhotoChange={setOwnPhotoUrl}/> : activePage === 'Fees' && person.admin && !teacherMode ?
                  <FeesComingSoon/> : activePage === 'Website Registrations' && cloud && currentWorkspace === 'raaga' && person.admin && !teacherMode ?
                    <WebsiteRegistrations cloud={cloud}/> : activePage === 'Dashboard' && cloud ?
                      <LiveDashboard cloud={cloud} workspace={currentWorkspace} teacherMode={teacherMode}
                                     onChangePage={goPage}/> : activePage === 'Dashboard' ?
                        <Dashboard workspace={currentWorkspace} isTeacher={teacherMode} onOpenStudent={openStudent}
                                   onChangePage={goPage} onSelectInstitution={switchWorkspace} allClasses={classes}
                                   members={members} enrolments={enrolments}
                                   practiceLogs={practiceLogs}/> : activePage === 'Families & Students' || activePage === 'My Students' ? (teacherMode ?
                          <AcademyOperations cloud={cloud} workspace={currentWorkspace as InstitutionId}
                                             teacherMode={true} initialArea="enrolment"/> :
                          <PersistentRegistration cloud={cloud!} workspace={currentWorkspace as InstitutionId}
                                                  initialClass={enrolClass}
                                                  initialStudent={registerOpenStudent}/>) : activePage === 'Classes & Timetable' || activePage === 'My Classes' ?
                          <Timetable workspace={currentWorkspace} isTeacher={teacherMode} classView={classView}
                                     setClassView={setClassView} weekOffset={weekOffset} setWeekOffset={setWeekOffset}
                                     onSession={setSession} onClass={openClass} allClasses={classes}
                                     onCreateClass={() => setClassDialog({record: null})} onEditClass={editClass}
                                     onDeleteClass={requestDeleteClass} cloud={cloud} revision={scheduleRevision}
                                     venues={venues}/> : activePage === 'Practice & Reports' ?
                            <AcademyOperations cloud={cloud} workspace={currentWorkspace as InstitutionId}
                                               teacherMode={teacherMode}
                                               initialArea="practice"/> : activePage === 'Communications' ?
                              <CommsPage workspace={currentWorkspace}/> : activePage === 'Venues' ?
                                <VenueManager venues={venues} canEdit={!!cloud && person.admin && !teacherMode}
                                              linkedCounts={venueLinks} error={venueError}
                                              onAdd={() => setVenueDialog({record: null})}
                                              onEdit={v => setVenueDialog({record: v})}/> : activePage === 'Teachers' ?
                                  <TeacherManagement cloud={cloud}
                                                     workspace={currentWorkspace}/> : activePage === 'Administrators' ?
                                    <AdminManagement cloud={cloud}
                                                     workspace={currentWorkspace}/> : activePage === 'Account Access' && cloud ? (currentWorkspace === 'combined' ?
                                        <AcademySelection page="Account Access" allowed={availableInstitutions}
                                                          onSelect={switchWorkspace}/> :
                                        <AccountAccess cloud={cloud} institution={currentWorkspace as InstitutionId}/>) :
                                      <SettingsPage workspace={currentWorkspace}/>}</>}
      </Suspense></main>
      <footer className="main-footer">
        <span>Sadhana · Academy & Learning Portal</span><span>{cloud ? "Live timetable and venues · other records awaiting import" : "No backend session"}</span>
      </footer>
    </div>
    {deletePrompt && <div className="reg-shade" onMouseDown={e => {
      if (e.target === e.currentTarget) setDeletePrompt(null);
    }}>
        <section className="reg-modal" role="dialog" aria-modal="true" aria-label="Confirm delete or archive">
            <div className="reg-modal-head">
                <div><h2>Delete or archive class</h2><p>{deletePrompt.record.name}</p></div>
                <button className="reg-icon-btn" onClick={() => setDeletePrompt(null)}><X size={18}/></button>
            </div>
            <div className="reg-form">
                <div className="reg-warning"><CircleAlert
                    size={17}/><span>{enrolments.some(e => e.classId === deletePrompt.record.id) ? 'This class has student enrolments and will be archived to preserve history. It will no longer appear in active timetables.' : 'This locally created class has no enrolments and can be removed.'}</span>
                </div>
                <div className="reg-modal-actions">
                    <button className="reg-secondary" onClick={() => setDeletePrompt(null)}>Cancel</button>
                    <button className="reg-danger" onClick={performDelete}><Trash2
                        size={16}/>{enrolments.some(e => e.classId === deletePrompt.record.id) ? 'Archive class' : 'Delete class'}
                    </button>
                </div>
            </div>
        </section>
    </div>}
    {classDialog &&
        <ClassFormDialog workspace={currentWorkspace} record={classDialog.record} classes={classes} venues={venues}
                         onSave={saveClass} onClose={() => setClassDialog(null)}/>}
    {venueDialog && <VenueFormDialog record={venueDialog.record} venues={venues} onSave={saveVenue}
                                     onClose={() => setVenueDialog(null)}/>}
    {session &&
        <SessionDrawer session={session} canEdit={person.admin && !teacherMode} canDelete={person.admin && !teacherMode}
                       cloud={cloud} onSaved={() => {
          setSession(null);
          setScheduleRevision(n => n + 1);
        }} onClose={() => setSession(null)} onClass={openClass}/>}
    {notifsOpen && <NotificationDrawer notifications={notifications} setNotifications={setNotifications}
                                       allowed={availableInstitutions} filter={notifFilter} setFilter={setNotifFilter}
                                       onClose={() => setNotifsOpen(false)}/>}
  </div>;
}
