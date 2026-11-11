export const parentUsernameFor = registrationId => {
  if (
    typeof registrationId !== 'string' ||
    !registrationId.startsWith('web_') ||
    registrationId.length < 12
  ) {
    throw new Error('Invalid parent registration ID');
  }

  return `parent-${registrationId.slice(4, 36)}`;
};

export const parentEmailRouteKey = username =>
  `EMAIL_ROUTE#${username}`;

export function parentEmailRouteRecord(reg, guardian, timestamp) {
  if (!['raaga', 'sruti'].includes(reg.institutionId)) {
    throw new Error('Invalid institution for parent email routing');
  }

  const email = guardian.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid parent email');
  }

  return {
    counterId: parentEmailRouteKey(parentUsernameFor(reg.registrationId)),
    sequenceType: 'PARENT_EMAIL_ROUTE',
    institutionId: reg.institutionId,
    registrationId: reg.registrationId,
    familyId: reg.familyId,
    recipientEmail: email,
    status: 'pending',
    createdAt: timestamp
  };
}
