#!/usr/bin/env python3
"""Guarded M9 isolated-data enrolment test fixture. No production API changes.

Default is read-only. --apply requires explicit acknowledgement; uses conditional
DynamoDB transaction, audit records, and deterministic enrolment IDs.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from m91MiddlesbroughGate import ACCOUNT, CLASS_ID, STUDENTS, aws, get, query_all, assess

INSTITUTION = 'raaga'
PREFIX = 'sadhana-dev-m9-'
TEACHER_ID = 'TEACHER-540b1a18-5df6-45de-a343-93a3f88e432d'

def enrolment_id(student):
    return 'enr_' + hashlib.sha256(f'm91-test|{INSTITUTION}|{student}|{CLASS_ID}'.encode()).hexdigest()

def av(value):
    if isinstance(value, str): return {'S': value}
    if isinstance(value, bool): return {'BOOL': value}
    if isinstance(value, int): return {'N': str(value)}
    raise TypeError('Unsupported item value')

def item(attrs):
    return {k: av(v) for k,v in attrs.items()}

def condition(table, key, expr, values):
    return {'ConditionCheck': {'TableName': PREFIX + table, 'Key': key,
            'ConditionExpression': expr, 'ExpressionAttributeValues': item(values)}}

def plan_transactions(stamp):
    date = stamp[:10]
    actions = [
        condition('classes', item({'classId': CLASS_ID}),
                  'institutionId=:inst AND #s=:active AND contains(teacherPersonIds,:teacher)',
                  {':inst':INSTITUTION, ':active':'active', ':teacher':TEACHER_ID}),
        condition('people', item({'personId':TEACHER_ID}),
                  '#s=:active AND contains(institutionIds,:inst) AND contains(personTypes,:teacherType)',
                  {':active':'active',':inst':INSTITUTION,':teacherType':'teacher'})
    ]
    # Reserved word `status` needs ExpressionAttributeNames for the two checks.
    for a in actions:
        a['ConditionCheck']['ExpressionAttributeNames']={'#s':'status'}
    for roll, student in STUDENTS.items():
        actions.append(condition('people', item({'personId':student}),
                    '#s=:active AND contains(institutionIds,:inst)',
                    {':active':'active',':inst':INSTITUTION}))
        actions[-1]['ConditionCheck']['ExpressionAttributeNames']={'#s':'status'}
        eid = enrolment_id(student)
        actions.append({'Put': {'TableName':PREFIX+'enrolments',
                    'Item': item({'enrolmentId':eid,'institutionId':INSTITUTION,
                         'studentId':student,'classId':CLASS_ID,'status':'active',
                         'startDate':date,'createdAt':stamp,'updatedAt':stamp,
                         'recordSource':'m91-isolated-integration-test'}),
                    'ConditionExpression':'attribute_not_exists(enrolmentId)'}})
        aid = 'aud_' + hashlib.sha256(f'm91-enrol|{eid}'.encode()).hexdigest()
        actions.append({'Put': {'TableName':PREFIX+'audit',
                    'Item': item({'auditId':aid,'institutionId':INSTITUTION,
                         'timestamp':stamp,'action':'m91.test_enrolment_created',
                         'resourceKey':f'enrolments#{eid}', 'studentId':student,
                         'classId':CLASS_ID,'rollNumber':roll,
                         'recordSource':'m91-isolated-integration-test'}),
                    'ConditionExpression':'attribute_not_exists(auditId)'}})
    return actions

def validate_live():
    if aws('sts','get-caller-identity').get('Account') != ACCOUNT:
        raise RuntimeError('Wrong AWS account')
    cls = get('classes','classId', CLASS_ID)
    if not cls or cls.get('teacherPersonIds') != [TEACHER_ID]:
        raise RuntimeError('Class teacher assignment changed; refusing enrolment')
    teachers = [{'found': bool(t:=get('people','personId',TEACHER_ID)),
                 'valid':bool(t and t.get('status')=='active' and
                              'teacher' in t.get('personTypes',[]) and
                              INSTITUTION in t.get('institutionIds',[]))}]
    people = {roll:get('people','personId',sid) for roll,sid in STUDENTS.items()}
    existing = {roll:query_all('enrolments','StudentEnrolmentsIndex','studentId',sid)
                for roll,sid in STUDENTS.items()}
    blockers = assess(cls, teachers, people, existing)
    # Strongly read deterministic enrolment IDs, not just eventually consistent GSI.
    for roll,sid in STUDENTS.items():
        if get('enrolments','enrolmentId',enrolment_id(sid)):
            blockers.append('DETERMINISTIC_ENROLMENT_EXISTS_'+roll)
        if any(e.get('classId')==CLASS_ID for e in existing[roll]):
            blockers.append('CLASS_ENROLMENT_HISTORY_EXISTS_'+roll)
    return sorted(set(blockers))

def execute_transaction(actions):
    # AWS CLI consumes a private temporary file instead of stdin JSON.
    fd, filename = tempfile.mkstemp(prefix='m91-enrol-',suffix='.json')
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd,'w') as f:
            json.dump({'TransactItems':actions},f)
        p = subprocess.run(['aws','dynamodb','transact-write-items',
                 '--cli-input-json','file://'+filename,'--profile','default',
                 '--region','us-east-1','--output','json'],text=True,
                 capture_output=True, timeout=60)
        if p.returncode:
            raise RuntimeError('Transaction rejected; no partial writes expected. '+p.stderr[:450])
    finally:
        Path(filename).unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true', help='Perform conditional write after explicit confirmation')
    opts=parser.parse_args()
    blockers=validate_live()
    print(json.dumps({'account':ACCOUNT,'institution':INSTITUTION,'classId':CLASS_ID,
       'teacherPersonId':TEACHER_ID,'students':list(STUDENTS),
       'dryRun':not opts.apply,'blockers':blockers,'willCreate':2 if not blockers else 0},indent=2))
    if blockers: raise RuntimeError('Live verification blocked enrolment')
    if not opts.apply: return
    answer=input('Type ENROL BOTH M91 to create TWO test enrolments in M9 DynamoDB: ')
    if answer != 'ENROL BOTH M91': raise RuntimeError('Confirmation not given; no writes')
    # Re-run checks immediately before the conditional transaction.
    if validate_live(): raise RuntimeError('Pre-write gate changed; no writes')
    stamp=datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    execute_transaction(plan_transactions(stamp))
    print(json.dumps({'transactionCommitted':True,'students':list(STUDENTS),
                      'enrolmentIds':{roll:enrolment_id(sid) for roll,sid in STUDENTS.items()},
                      'note':'Check guardian dashboards with actual parent token next.'},indent=2))

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('M9.1 ENROLMENT STOPPED: '+str(exc),file=sys.stderr)
        sys.exit(2)
