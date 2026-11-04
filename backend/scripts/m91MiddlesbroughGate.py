#!/usr/bin/env python3
"""Read-only evidence gate for M9.1 Middlesbrough enrolment tests.

No enrolments, teacher assignments, DynamoDB items or AWS settings are changed.
"""
import json
import subprocess
import sys

ACCOUNT = '627821644317'
CLASS_ID = 'CLASS-RAAGA-MIDDLESBROUGH'
STUDENTS = {
    '001-001': 'per_620c5ec74e45e6442daab84c83f4243d4713470694d98271130a34bc3bcabd5b',
    '001-002': 'per_8de169dee983b52dda5fc4a674b5136016e26b7ce7a006806d07060cd2fc8280',
}


def aws(*args):
    p = subprocess.run(['aws', *args, '--profile', 'default', '--region', 'us-east-1', '--output', 'json'],
                       text=True, capture_output=True, timeout=45, check=False)
    if p.returncode:
        raise RuntimeError(f'AWS read failed for {args[:2]}: {p.stderr[:250]}')
    # AWS CLI v2 may emit no JSON at all for a successful GetItem miss.
    # Do not interpret empty output from other operations as success.
    if not p.stdout.strip():
        if args[:2] == ('dynamodb', 'get-item'):
            return {}
        raise RuntimeError(f'AWS returned empty JSON for {args[:2]}; no changes made')
    try:
        return json.loads(p.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'AWS returned malformed JSON for {args[:2]}; no changes made') from exc


def decode(item):
    """Minimal AttributeValue decoder for the exact fields this gate reads."""
    def value(v):
        if 'S' in v: return v['S']
        if 'N' in v: return int(v['N']) if v['N'].isdigit() else float(v['N'])
        if 'BOOL' in v: return v['BOOL']
        if 'NULL' in v: return None
        if 'L' in v: return [value(x) for x in v['L']]
        if 'M' in v: return {k: value(x) for k, x in v['M'].items()}
        raise ValueError('Unsupported DynamoDB attribute type')
    return {k: value(v) for k, v in item.items()}


def get(table, key, value):
    result = aws('dynamodb', 'get-item', '--table-name', f'sadhana-dev-m9-{table}',
                 '--key', json.dumps({key: {'S': value}}), '--consistent-read')
    return decode(result['Item']) if result.get('Item') else None


def query_all(table, index, key, value):
    out = []
    cursor = None
    while True:
        args = ['dynamodb', 'query', '--table-name', f'sadhana-dev-m9-{table}',
                '--index-name', index, '--key-condition-expression', '#k=:v',
                '--expression-attribute-names', json.dumps({'#k': key}),
                '--expression-attribute-values', json.dumps({':v': {'S': value}})]
        if cursor: args.extend(['--exclusive-start-key', json.dumps(cursor)])
        page = aws(*args)
        out.extend(decode(x) for x in page.get('Items', []))
        if len(out) > 500: raise RuntimeError('Safety limit: more than 500 query results')
        cursor = page.get('LastEvaluatedKey')
        if not cursor: return out


def assess(cls, teachers, students, enrolments):
    blockers = []
    if not cls:
        blockers.append('CLASS_NOT_FOUND')
    else:
        if cls.get('institutionId') != 'raaga': blockers.append('CLASS_WRONG_INSTITUTION')
        if cls.get('status') != 'active': blockers.append('CLASS_NOT_ACTIVE')
        if not cls.get('teacherPersonIds'): blockers.append('CLASS_HAS_NO_ASSIGNED_TEACHERS')
    for t in teachers:
        if not t['found']: blockers.append('ASSIGNED_TEACHER_NOT_FOUND')
        elif not t['valid']: blockers.append('ASSIGNED_TEACHER_NOT_ACTIVE_RAAGA_TEACHER')
    for roll, person in students.items():
        if not person: blockers.append(f'STUDENT_{roll}_NOT_FOUND')
        elif person.get('status') != 'active' or 'raaga' not in person.get('institutionIds', []):
            blockers.append(f'STUDENT_{roll}_NOT_ACTIVE_RAAGA')
        active = [e for e in enrolments[roll] if e.get('status') == 'active' and e.get('classId') == CLASS_ID]
        if active: blockers.append(f'STUDENT_{roll}_ALREADY_ENROLLED')
    return sorted(set(blockers))


def run():
    account = aws('sts', 'get-caller-identity').get('Account')
    if account != ACCOUNT: raise RuntimeError('Wrong AWS account; refusing to continue')
    cls = get('classes', 'classId', CLASS_ID)
    teachers = []
    if cls:
        for teacher_id in cls.get('teacherPersonIds', []):
            p = get('people', 'personId', teacher_id)
            teachers.append({'personId': teacher_id, 'found': bool(p),
                             'valid': bool(p and p.get('status') == 'active' and
                                           'teacher' in p.get('personTypes', []) and
                                           'raaga' in p.get('institutionIds', []))})
    students = {roll: get('people', 'personId', person_id) for roll, person_id in STUDENTS.items()}
    enrolments = {roll: query_all('enrolments', 'StudentEnrolmentsIndex', 'studentId', person_id)
                  for roll, person_id in STUDENTS.items()}
    blockers = assess(cls, teachers, students, enrolments)
    result = {
        'readOnly': True, 'writesPerformed': False, 'account': account, 'institution': 'raaga',
        'selectedClass': {'classId': CLASS_ID, 'name': cls.get('name') if cls else None,
                          'status': cls.get('status') if cls else None,
                          'teacherPersonIds': cls.get('teacherPersonIds', []) if cls else []},
        'teacherAssignments': teachers,
        'students': {roll: {'found': bool(students[roll]),
                            'institutionVerified': bool(students[roll] and 'raaga' in students[roll].get('institutionIds', [])),
                            'existingEnrolments': [{'classId': e.get('classId'), 'status': e.get('status'), 'enrolmentId': e.get('enrolmentId')}
                                                   for e in enrolments[roll]]}
                     for roll in STUDENTS},
        'teacherVerificationPassed': bool(teachers) and all(t['valid'] for t in teachers),
        'readyForExplicitEnrolmentReview': not blockers,
        'blockers': blockers,
        'enrolmentsCreated': 0,
        'note': 'Verification does not authorise a write. Reconfirm class, teachers and student assignments before a controlled enrolment.',
    }
    print(json.dumps(result, indent=2))
    return 0 if not blockers else 3


if __name__ == '__main__':
    try: sys.exit(run())
    except Exception as exc:
        print('M9.1 READ-ONLY GATE STOPPED: ' + str(exc), file=sys.stderr)
        sys.exit(2)
