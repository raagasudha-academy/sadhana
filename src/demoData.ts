import type {ClassRecord, StudentSummary, VenueRecord, InstitutionId} from './types';

// FICTIONAL data for UX exploration only. Do not use as academy records.
export const institutions: Record<InstitutionId, {name:string;fullName:string;descriptor:string;color:string}> = {
  raaga: { name: 'Raagasudha', fullName: 'Raagasudha Music Academy', descriptor: 'Music Academy', color: '#BBA57A' },
  sruti: { name: 'Śruti Vedam', fullName: 'Śruti Vedam', descriptor: 'Vedic Learning', color: '#9875A5' },
};
export const classData: ClassRecord[] = [
  // { id: 'R-101', institution: 'raaga', name: 'Carnatic Beginners', day: 6, time: '10:00', duration: 60, teacher: 'Music Teacher A', mode: 'In Person', venue: 'Durham teaching venue', studentCount: 12, rate: 76, submission: 88, status: 'Scheduled', startDate: '2026-09-01', endDate: '' },
  // { id: 'R-102', institution: 'raaga', name: 'Carnatic Intermediate', day: 3, time: '18:00', duration: 60, teacher: 'Music Teacher B', mode: 'In Person', venue: 'Newcastle teaching venue', studentCount: 14, rate: 84, submission: 91, status: 'Scheduled', startDate: '2026-09-01', endDate: '' },
  // { id: 'R-103', institution: 'raaga', name: 'Online Singing', day: 1, time: '17:30', duration: 60, teacher: 'Music Teacher C', mode: 'Online', venue: 'Online class', studentCount: 10, rate: 69, submission: 77, status: 'Scheduled', startDate: '2026-09-01', endDate: '' },
  // { id: 'R-104', institution: 'raaga', name: 'Music Foundations', day: 5, time: '17:00', duration: 60, teacher: 'Music Teacher D', mode: 'In Person', venue: 'Middlesbrough teaching venue', studentCount: 11, rate: 58, submission: 70, status: 'Scheduled', startDate: '2026-09-01', endDate: '' },
  // { id: 'S-101', institution: 'sruti', name: 'Vedic Chanting', day: 2, time: '18:00', duration: 60, teacher: 'Vedam Teacher A', mode: 'Online', venue: 'Online class', studentCount: 16, rate: 81, submission: 87, status: 'Scheduled', startDate: '2026-09-01', endDate: '' },
  // { id: 'S-102', institution: 'sruti', name: 'Hanuman Chanting', day: 6, time: '11:00', duration: 60, teacher: 'Vedam Teacher B', mode: 'Online', venue: 'Online class', studentCount: 20, rate: 72, submission: 85, status: 'Scheduled', startDate: '2026-09-01', endDate: '' },
  // { id: 'S-103', institution: 'sruti', name: 'Vedic Studies', day: 4, time: '18:30', duration: 60, teacher: 'Vedam Teacher C', mode: 'Online', venue: 'Online class', studentCount: 13, rate: 64, submission: 75, status: 'Scheduled', startDate: '2026-09-01', endDate: '' },
];
export const studentData: StudentSummary[] = [
  // { id: 'STU-0001', institution: 'raaga', name: 'Ananya Rao', initials: 'AR', status: 'Active', classId: 'R-101', practice: 82, submission: 92, minutes: 240, contact: '•••• 0123', notes: [{ by: 'Music Teacher A', date: '12 Oct 2026', text: 'Growing in confidence with the new exercise.', status: 'Completed' }] },
  // { id: 'STU-0002', institution: 'raaga', name: 'Arjun Shah', missingDays: 2, initials: 'AS', status: 'Active', classId: 'R-101', practice: 43, submission: 60, minutes: 90, contact: '•••• 0471', notes: [{ by: 'Music Teacher A', date: '13 Oct 2026', text: 'Discussed short, regular practice sessions with family.', status: 'In Progress' }] },
  // { id: 'STU-0003', institution: 'raaga', name: 'Meera Patel', initials: 'MP', status: 'Active', classId: 'R-102', practice: 91, submission: 100, minutes: 315, contact: '•••• 0892', notes: [] },
  // { id: 'STU-0004', institution: 'raaga', name: 'Kiran Nair', initials: 'KN', status: 'Upcoming', classId: 'R-103', practice: null, submission: null, minutes: 0, contact: '•••• 0820', notes: [] },
  // { id: 'STU-0005', institution: 'raaga', name: 'Diya Menon', missingDays: 2, initials: 'DM', status: 'Active', classId: 'R-104', practice: 67, submission: 56, minutes: 140, contact: '•••• 0256', notes: [] },
  // { id: 'STU-0006', institution: 'raaga', name: 'Rohan Iyer', initials: 'RI', status: 'Archived', classId: 'R-101', practice: 75, submission: 80, minutes: 200, contact: '•••• 0355', notes: [] },
  // { id: 'STU-0001', institution: 'sruti', name: 'Ananya Rao', initials: 'AR', status: 'Active', classId: 'S-101', practice: 72, submission: 86, minutes: 210, contact: '•••• 0123', notes: [{ by: 'Vedam Teacher A', date: '10 Oct 2026', text: 'Good pronunciation progress.', status: 'Completed' }] },
  // { id: 'STU-0007', institution: 'sruti', name: 'Ishaan Kumar', missingDays: 2, initials: 'IK', status: 'Active', classId: 'S-102', practice: 46, submission: 62, minutes: 105, contact: '•••• 0649', notes: [] },
  // { id: 'STU-0008', institution: 'sruti', name: 'Sahana Krishnan', initials: 'SK', status: 'Active', classId: 'S-103', practice: 88, submission: 94, minutes: 290, contact: '•••• 0322', notes: [] },
  // { id: 'STU-0009', institution: 'sruti', name: 'Aditi Desai', initials: 'AD', status: 'Upcoming', classId: 'S-101', practice: null, submission: null, minutes: 0, contact: '•••• 0219', notes: [] },
];
export const trends = {
  // raaga: [{ w: 'Week 1', p: 61, s: 73 }, { w: 'Week 2', p: 69, s: 79 }, { w: 'Week 3', p: 66, s: 81 }, { w: 'Week 4', p: 74, s: 85 }],
  // sruti: [{ w: 'Week 1', p: 65, s: 72 }, { w: 'Week 2', p: 70, s: 80 }, { w: 'Week 3', p: 74, s: 83 }, { w: 'Week 4', p: 76, s: 86 }],
};
export const initialNotifications = [
  // { id: 1, institution: 'raaga', title: 'Parent contact updated', detail: 'A shared family contact was recently edited.', age: 'Today · 9:15 AM', read: false, category: 'Family' },
  // { id: 2, institution: 'sruti', title: 'Weekly practice summary', detail: 'Students needing attention: sample weekly summary.', age: 'Sunday · 10:00 AM', read: false, category: 'Practice' },
  // { id: 3, institution: 'raaga', title: 'WhatsApp message failed', detail: 'Demo of an unsent class announcement requiring review.', age: 'Yesterday · 4:20 PM', read: false, category: 'Communications' },
  // { id: 4, institution: 'sruti', title: 'Parent contact updated', detail: 'A family record change may affect registered contacts.', age: 'Monday · 2:10 PM', read: true, category: 'Family' },
];
export const venueData: VenueRecord[] = [
  // { id: 'V1', name: 'Durham teaching venue', location: 'Durham', address: 'Address to be entered', linked: 1 },
  // { id: 'V2', name: 'Newcastle teaching venue', location: 'Newcastle', address: 'Address to be entered', linked: 1 },
  // { id: 'V3', name: 'Middlesbrough teaching venue', location: 'Middlesbrough', address: 'Address to be entered', linked: 1 },
];
