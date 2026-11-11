export type InstitutionId = 'raaga' | 'sruti';

export const INSTITUTION_EMAIL_SENDERS = {
  raaga: {
    institutionId: 'raaga',
    name: 'Sadhana – Raagasudha',
    email: 'noreply@raagasudhamusic.co.uk',
  },
  sruti: {
    institutionId: 'sruti',
    name: 'Sruti Academy',
    email: 'noreply@sruti.co.uk',
  },
} as const;

export function resolveInstitutionSender(value: unknown) {
  if (value !== 'raaga' && value !== 'sruti') {
    throw new Error('Unknown or unverified institution for email routing');
  }

  const sender = INSTITUTION_EMAIL_SENDERS[value];

  return {
    institutionId: sender.institutionId,
    name: sender.name,
    email: sender.email,
    from: `${sender.name} <${sender.email}>`,
  };
}
