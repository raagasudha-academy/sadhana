import {createHash} from 'node:crypto';

/** Legacy account anchor, retained while old one-person links are in service. */
export const cognitoSubjectGuardId = subject =>
  `COGNITO_SUB#${createHash('sha256').update(subject).digest('hex')}`;

/** A guardian account may resolve to one parent profile in each institution. */
export const guardianInstitutionGuardId = (subject, institution) =>
  `${cognitoSubjectGuardId(subject)}#${institution}`;
