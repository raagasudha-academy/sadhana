import type { InstitutionId } from './types';

/** Academy metadata only. No fictional registrations or seeded records. */
export const institutions: Record<InstitutionId, {name:string;fullName:string;descriptor:string;color:string}> = {
  raaga: { name: 'Raagasudha', fullName: 'Raagasudha Music Academy', descriptor: 'Music Academy', color: '#BBA57A' },
  sruti: { name: 'Śruti Vedam', fullName: 'Śruti Vedam', descriptor: 'Vedic Learning', color: '#9875A5' },
};
