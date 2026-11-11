#!/usr/bin/env python3
"""READ ONLY: verify an imported Raagasudha registration's canonical Cognito link.

No names, email addresses, Cognito subjects, person IDs, or DynamoDB rows
are printed. This verifies account linking; it NEVER approves guardian access.
"""
import argparse
import hashlib
import json
import re
import sys

ACCOUNT = '627821644317'
REGION = 'us-east-1'


def valid_student_person(person, student_id, family_id, institution='raaga'):
    """Mirror the canonical learner route's base-table student requirements.

    This check does not grant access. The learner API still checks the Cognito
    identity and approved guardian link at request time.
    """
    return (
        isinstance(person, dict)
        and person.get('personId') == student_id
        and person.get('familyId') == family_id
        and person.get('status') == 'active'
        and isinstance(person.get('institutionIds'), list)
        and institution in person['institutionIds']
        and isinstance(person.get('personTypes'), list)
        and 'student' in person['personTypes']
    )

def hash_parts(*parts):
    raw = json.dumps(list(parts), ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def account_access_readiness(reg, guard_match, student_people, link_counts,
                             guardian_linked_count, students, cognito_check,
                             check_cognito):
    """Evidence for a role smoke test, *never* a final-mode or access approval."""
    return bool(
        reg.get('importStatus') == 'imported'
        and reg.get('provisioningStatus') == 'EXISTING_ACCOUNT_LINKED'
        and guard_match
        and student_people['active_matching'] == len(students)
        and student_people['missing_or_inconsistent'] == 0
        and link_counts['approved_and_verified'] == guardian_linked_count
        and all(link_counts[k] == 0 for k in ('pending', 'rejected_or_revoked', 'missing_or_other'))
        and (not check_cognito or cognito_check == 'CONFIRMED_ENABLED')
    )

def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registration', required=True, help='Raagasudha reference, e.g. RS-2026-726C9A')
    parser.add_argument('--check-cognito', action='store_true', help='Also verify confirmed enabled user via Cognito ListUsers')
    args = parser.parse_args()
    if not re.fullmatch(r'RS-[A-Za-z0-9_-]{1,110}', args.registration):
        parser.error('Unexpected Raagasudha reference')
    try:
        import boto3
        from botocore.exceptions import ClientError
    except ImportError:
        sys.exit('boto3 required in the existing isolated Python environment')
    session = boto3.session.Session(region_name=REGION)
    if session.client('sts').get_caller_identity()['Account'] != ACCOUNT:
        sys.exit('Incorrect AWS account; no DynamoDB reads executed')
    db = session.resource('dynamodb')
    def read(table, field, value):
        return db.Table('sadhana-dev-' + table).get_item(
            Key={field: value}, ConsistentRead=True).get('Item')
    registration_id = 'web_' + hash_parts('raaga', args.registration)
    reg = read('registrations', 'registrationId', registration_id)
    if not reg or reg.get('registrationId') != registration_id or reg.get('institutionId') != 'raaga' or reg.get('externalRegistrationId') != args.registration or reg.get('source') != 'website':
        print(json.dumps({'mode': 'READ_ONLY', 'registration': args.registration, 'registration_identity': 'MISSING_OR_MISMATCH', 'final_mode_approved': False}, indent=2))
        return 2
    family_id, students = reg.get('familyId'), reg.get('studentIds', [])
    student_ids_well_formed = (
        isinstance(students, list) and 0 < len(students) <= 20
        and all(isinstance(s, str) and re.fullmatch(r'[A-Za-z0-9_-]{4,150}', s) for s in students)
        and len(set(students)) == len(students)
    )
    if not student_ids_well_formed:
        print(json.dumps({'mode': 'READ_ONLY', 'registration': args.registration,
                          'student_ids': 'INVALID_OR_MISSING', 'final_mode_approved': False}, indent=2))
        return 2
    family = read('families', 'familyId', family_id) if isinstance(family_id, str) and family_id else None
    person_id = family.get('primaryContactPersonId') if family else None
    person = read('people', 'personId', person_id) if isinstance(person_id, str) and person_id else None
    subject = person.get('cognitoSub') if person else None
    primary_match = bool(family and person and family_id == person.get('familyId') and
       family.get('status') == 'active' and person.get('status') == 'active' and
       'raaga' in (person.get('institutionIds') or []) and
       'guardian' in (person.get('personTypes') or []))
    guard = read('counters', 'counterId', 'COGNITO_SUB#' + hashlib.sha256(subject.encode()).hexdigest()) if isinstance(subject, str) and subject else None
    guard_match = bool(primary_match and isinstance(subject, str) and subject and guard and guard.get('personId') == person_id)
    link_counts = {'approved_and_verified': 0, 'pending': 0, 'rejected_or_revoked': 0, 'missing_or_other': 0}
    student_people = {'active_matching': 0, 'missing_or_inconsistent': 0, 'adult_self_access': 0}
    guardian_linked_count = 0
    for student_id in students:
        # Read the canonical student row itself. An approved link to a missing,
        # archived or cross-family student cannot power GET /family-access/mine.
        student = read('people', 'personId', student_id)
        if valid_student_person(student, student_id, family_id):
            student_people['active_matching'] += 1
        else:
            student_people['missing_or_inconsistent'] += 1
        if student_id == person_id:  # Adult self access uses Cognito, not a guardian link.
            student_people['adult_self_access'] += 1
            continue
        guardian_linked_count += 1
        link_id = 'link_' + hash_parts('raaga', person_id, student_id) if person_id else None
        link = read('family-links', 'linkId', link_id) if link_id else None
        if not link or link.get('guardianPersonId') != person_id or link.get('studentId') != student_id or link.get('familyId') != family_id or link.get('institutionId') != 'raaga':
            link_counts['missing_or_other'] += 1
        elif link.get('accessStatus') == 'approved' and link.get('relationshipVerified') is True:
            link_counts['approved_and_verified'] += 1
        elif link.get('accessStatus') == 'pending':
            link_counts['pending'] += 1
        elif link.get('accessStatus') in ('rejected', 'revoked'):
            link_counts['rejected_or_revoked'] += 1
        else:
            link_counts['missing_or_other'] += 1
    cognito_check = 'NOT_REQUESTED'
    if args.check_cognito:
        if not subject or not isinstance(subject, str):
            cognito_check = 'NO_LINKED_SUBJECT'
        else:
            try:
                function = session.client('lambda').get_function_configuration(FunctionName='sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh')
                pool = function.get('Environment', {}).get('Variables', {}).get('SADHANA_COGNITO_USER_POOL_ID')
                if not pool:
                    cognito_check = 'COGNITO_POOL_NOT_CONFIGURED'
                else:
                    users = session.client('cognito-idp').list_users(UserPoolId=pool, Filter=f'sub = "{subject}"', Limit=2).get('Users', [])
                    matches = [u for u in users if any(a.get('Name') == 'sub' and a.get('Value') == subject for a in u.get('Attributes', []))]
                    cognito_check = 'CONFIRMED_ENABLED' if len(matches)==1 and matches[0].get('Enabled') is True and matches[0].get('UserStatus')=='CONFIRMED' else 'MISSING_DISABLED_OR_UNCONFIRMED'
            except ClientError as exc:
                cognito_check = 'NOT_VERIFIED_' + exc.response.get('Error', {}).get('Code', 'AWS_ERROR')
    # A linked account is ready for role smoke testing only if *all* of its
    # expected student/person records and independent guardian links are valid.
    # Registration identityResolutionStatus may remain pending as historical
    # workflow metadata; it is never used to create an access grant.
    account_access_ready = account_access_readiness(
        reg, guard_match, student_people, link_counts, guardian_linked_count,
        students, cognito_check, args.check_cognito
    )
    summary = {
        'mode': 'READ_ONLY', 'account': ACCOUNT, 'region': REGION,
        'registration': args.registration,
        'import_marker': 'IMPORTED' if reg.get('importStatus') == 'imported' else 'NOT_IMPORTED',
        'provisioning_status': reg.get('provisioningStatus', 'UNKNOWN'),
        'identity_resolution': reg.get('identityResolutionStatus', 'UNKNOWN'),
        'website_sync': reg.get('websiteSyncStatus', 'UNKNOWN'),
        'family_and_guardian_person': 'MATCH' if primary_match else 'MISMATCH',
        'canonical_cognito_uniqueness_guard': 'MATCH' if guard_match else 'MISSING_OR_MISMATCH',
        'cognito_user_check': cognito_check,
        'guardian_link_counts': link_counts,
        'canonical_student_people': student_people,
        'account_access_ready_for_role_smoke_test': account_access_ready,
        'final_mode_approved': False,
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if account_access_ready else 2

if __name__ == '__main__':
    sys.exit(run())
