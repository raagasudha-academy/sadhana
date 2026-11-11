#!/usr/bin/env python3
"""Preview and guarded migration to one global student roll number.

Default is read-only. No family/person IDs or enrolments are changed.
Never infer origin from name, DOB or the order of institutionIds.
"""
import argparse
from collections import defaultdict
from decimal import Decimal
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re

import boto3
from boto3.dynamodb.types import TypeSerializer

ACCOUNT = '627821644317'
REGION = 'us-east-1'
PREFIX = {'raaga': 'RS', 'sruti': 'SR'}
ROLL = re.compile(r'^(RS|SR)-(\d{3,})$')
SER = TypeSerializer()


def integer(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, Decimal)) or value != int(value) or value < 0:
        raise RuntimeError(f'Invalid {name}: expected non-negative integer')
    return int(value)


def scan(table):
    rows, cursor = [], None
    while True:
        kwargs = {'ConsistentRead': True}
        if cursor: kwargs['ExclusiveStartKey'] = cursor
        out = table.scan(**kwargs)
        rows.extend(out.get('Items', []))
        cursor = out.get('LastEvaluatedKey')
        if not cursor: return rows


def origin_of(person):
    profile = person.get('studentProfile') or {}
    explicit = profile.get('rollOriginInstitution')
    if explicit in PREFIX: return explicit
    legacy = person.get('legacyPayload') or {}
    initial = legacy.get('createdIn')
    if initial in PREFIX: return initial
    source = person.get('sourceWebsiteRegistrationId', '')
    if isinstance(source, str):
        if source.startswith('RS-'): return 'raaga'
        if source.startswith('SR-'): return 'sruti'
    ids = person.get('institutionIds') or []
    if len(ids) == 1 and ids[0] in PREFIX: return ids[0]
    return None


def choose_plan(people, counters):
    students = sorted((p for p in people if 'student' in (p.get('personTypes') or [])),
                      key=lambda p: (str(p.get('createdAt', '')), p.get('personId', '')))
    seen_ids, existing_rolls, highest = set(), {}, {'RS': 0, 'SR': 0}
    problems = []
    for person in students:
        pid = person.get('personId')
        if not isinstance(pid, str) or not pid or pid in seen_ids: problems.append(f'Invalid/duplicate personId: {pid}'); continue
        seen_ids.add(pid)
        profile = person.get('studentProfile') or {}
        all_values = [profile.get('rollNumber')] + list((profile.get('rollNumbers') or {}).values())
        for value in all_values:
            match = ROLL.fullmatch(value) if isinstance(value, str) else None
            if match: highest[match[1]] = max(highest[match[1]], int(match[2]))
        current = profile.get('rollNumber')
        if isinstance(current, str) and ROLL.fullmatch(current):
            existing_rolls[pid] = current
        else:
            formatted = sorted(set(v for v in (profile.get('rollNumbers') or {}).values() if isinstance(v, str) and ROLL.fullmatch(v)))
            if len(formatted) == 1: existing_rolls[pid] = formatted[0]
            elif len(formatted) > 1:
                origin = origin_of(person)
                matching = [v for v in formatted if v.startswith(PREFIX.get(origin, '') + '-')]
                if len(matching) == 1: existing_rolls[pid] = matching[0]
                else: problems.append(f'Ambiguous formatted rolls: {pid}')
    owners = {}
    for pid, roll in existing_rolls.items():
        if roll in owners and owners[roll] != pid: problems.append(f'DUPLICATE global roll {roll}: {owners[roll]} and {pid}')
        owners[roll] = pid
    for inst, prefix in PREFIX.items():
        highest[prefix] = max(highest[prefix], integer(counters[inst], f'counter {inst}'))
    changes = []
    for p in students:
        pid = p['personId']
        profile = p.get('studentProfile') or {}
        current = existing_rolls.get(pid)
        origin = origin_of(p)
        if not current:
            if not origin: problems.append(f'Unknown originating institution: {pid}'); continue
            prefix = PREFIX[origin]
            highest[prefix] += 1
            current = f'{prefix}-{highest[prefix]:03d}'
        if not origin: origin = 'raaga' if current.startswith('RS-') else 'sruti'
        if (current.startswith('RS-') and origin != 'raaga') or (current.startswith('SR-') and origin != 'sruti'):
            problems.append(f'Roll origin conflict: {pid} {origin} {current}'); continue
        old = {k: v for k, v in (profile.get('rollNumbers') or {}).items() if k in PREFIX}
        membership = sorted(set(i for i in (p.get('institutionIds') or []) if i in PREFIX))
        if not membership: problems.append(f'No academy membership: {pid}'); continue
        desired = dict(old)
        desired.update({inst: current for inst in membership})
        if profile.get('rollNumber') == current and old == desired and profile.get('rollOriginInstitution') == origin: continue
        try: ver = integer(p.get('version'), f'version of {pid}')
        except RuntimeError as exc: problems.append(str(exc)); continue
        if ver < 1: problems.append(f'Invalid version: {pid}'); continue
        changes.append({'personId': pid, 'name': p.get('displayName') or '', 'version': ver,
                        'origin': origin, 'roll': current, 'oldRollNumber': profile.get('rollNumber'),
                        'oldRollNumbers': old, 'previousLegacyRollNumbers': dict(profile.get('legacyRollNumbers') or {}), 'membership': membership, 'newRollNumbers': desired})
    # A roll allocated in this plan cannot collide with another existing or proposed roll.
    allocated = {}
    for e in changes:
        owner = allocated.get(e['roll'])
        if owner and owner != e['personId']: problems.append(f'DUPLICATE planned roll: {e["roll"]}')
        allocated[e['roll']] = e['personId']
    return {'account': ACCOUNT, 'region': REGION, 'planVersion': 1, 'students': len(students),
            'countersBefore': counters, 'counterFloor': {k: highest[v] for k,v in PREFIX.items()},
            'problems': problems, 'changes': changes}


def encode(obj):
    return {k: SER.serialize(v) for k,v in obj.items()}


def verify_writers_frozen(lambda_client):
    names = ['sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh',
             'sadhana-m91-sruti-public-intake-IntakeFunction-884pdnifrObm',
             'sadhana-m9-isolated-e2e']
    for name in names:
        response = lambda_client.get_function_concurrency(FunctionName=name)
        if response.get('ReservedConcurrentExecutions') != 0:
            raise RuntimeError(f'Apply requires the existing three-function maintenance freeze: {name}')


def transaction(client, people_table, entry, existing_guards):
    pid, roll = entry['personId'], entry['roll']
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    current = people_table.get_item(Key={'personId':pid}, ConsistentRead=True).get('Item')
    if not current or integer(current.get('version',0), 'person version') != entry['version']:
        raise RuntimeError(f'Stale person version {pid}; re-run preview')
    if not set(entry['membership']).issubset(set(current.get('institutionIds') or [])):
        raise RuntimeError(f'Academy memberships changed: {pid}')
    profile = dict(current.get('studentProfile') or {})
    if profile.get('rollNumber') != entry['oldRollNumber'] or {k:v for k,v in (profile.get('rollNumbers') or {}).items() if k in PREFIX} != entry['oldRollNumbers']:
        raise RuntimeError(f'Stale roll mapping {pid}; re-run preview')
    profile.update({'rollNumber':roll,'rollOriginInstitution':entry['origin'],
        'rollNumbers':{**(profile.get('rollNumbers') or {}), **entry['newRollNumbers']},
        'legacyRollNumbers':{**(profile.get('legacyRollNumbers') or {}), **entry['oldRollNumbers']}})
    key = f'ROLL_GLOBAL#{roll}'
    actions = [{ 'Update': {
        'TableName': 'sadhana-dev-people', 'Key': encode({'personId': pid}),
        'UpdateExpression': 'SET #profile=:profile, #v=:next, #updated=:now',
        'ConditionExpression': '#v=:old AND attribute_exists(personId)',
        'ExpressionAttributeNames': {'#profile':'studentProfile','#v':'version','#updated':'updatedAt'},
        'ExpressionAttributeValues': encode({':profile':profile,':next':entry['version']+1,':old':entry['version'],':now':now})}},
        {'Put': {'TableName':'sadhana-dev-audit-records',
         'Item':encode({'auditId': 'roll_'+hashlib.sha256(f'{pid}:{roll}'.encode()).hexdigest(),
          'institutionId':entry['origin'],'actorCognitoSub':'migration:permanent-roll',
          'action':'PERMANENT_STUDENT_ROLL_ASSIGNED','resourceType':'person','resourceId':pid,
          'result':'success','timestamp':now,'schemaVersion':1,
          'metadata':{'newRoll':roll,'oldRollNumber':str(entry['oldRollNumber'] or ''),
                      'oldRollNumbers':entry['oldRollNumbers']}}),
         'ConditionExpression':'attribute_not_exists(auditId)'}}]
    if key not in existing_guards:
        actions.append({'Put':{'TableName':'sadhana-dev-counters',
                       'Item':encode({'counterId':key,'personId':pid,'institutionId':entry['origin'],
                         'sequenceType':'ROLL_GLOBAL','createdAt':now}),
                       'ConditionExpression':'attribute_not_exists(counterId)'}})
    elif existing_guards[key] != pid:
        raise RuntimeError(f'Global roll guard belongs to a different person: {roll}')
    client.transact_write_items(TransactItems=actions)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--confirm', default='')
    parser.add_argument('--plan', type=Path, default=Path.home()/'Downloads/sadhana-permanent-roll-plan.json')
    args = parser.parse_args()
    if boto3.client('sts', region_name=REGION).get_caller_identity()['Account'] != ACCOUNT:
        raise RuntimeError('Wrong AWS account')
    db = boto3.resource('dynamodb', region_name=REGION)
    people = scan(db.Table('sadhana-dev-people'))
    counters = {}
    for inst in PREFIX:
        item = db.Table('sadhana-dev-counters').get_item(Key={'counterId':f'{inst}#STUDENT_ROLL'},ConsistentRead=True).get('Item')
        counters[inst] = integer((item or {}).get('lastAllocated', 0), f'counter {inst}')
    plan = choose_plan(people, counters)
    if not args.apply:
        args.plan.parent.mkdir(parents=True, exist_ok=True)
        args.plan.write_text(json.dumps(plan, indent=2, default=str))
        os.chmod(args.plan, 0o600)
        print(f'READ-ONLY PERMANENT ROLL PREVIEW: {plan["students"]} students, {len(plan["changes"])} changes')
        print('Counter floors:', plan['counterFloor'])
        for e in plan['changes']:
            print(e['name'], e['personId'], e['oldRollNumbers'], '=>', e['roll'], 'in', e['membership'])
        for issue in plan['problems']: print('BLOCKER:', issue)
        print('PLAN:', args.plan, '\nNO AWS WRITES.')
        return
    if args.confirm != 'APPLY-SADHANA-PERMANENT-ROLLS': raise RuntimeError('Explicit confirmation required')
    if plan['problems']: raise RuntimeError('Resolve all preview blockers before any writes')
    if not args.plan.is_file() or json.loads(args.plan.read_text()) != plan:
        raise RuntimeError('Preview changed. Re-run without --apply.')
    client = boto3.client('dynamodb', region_name=REGION)
    verify_writers_frozen(boto3.client('lambda', region_name=REGION))
    all_counters = scan(db.Table('sadhana-dev-counters'))
    guards = {x['counterId']:x.get('personId') for x in all_counters if x.get('counterId','').startswith('ROLL_GLOBAL#')}
    # Do not jump counters or overwrite historical guard records without an approved plan.
    # Advance high-water counters BEFORE allocating labels, under the writer freeze.
    # Prevents a future writer from ever selecting an old or planned label.
    for inst, prefix in PREFIX.items():
        current = counters[inst]
        target = plan['counterFloor'][inst]
        if target > current:
            client.update_item(TableName='sadhana-dev-counters',Key=encode({'counterId':f'{inst}#STUDENT_ROLL'}),
                UpdateExpression='SET lastAllocated=:new, institutionId=:inst, sequenceType=:kind, updatedAt=:now',
                ConditionExpression='lastAllocated=:old' if db.Table('sadhana-dev-counters').get_item(Key={'counterId':f'{inst}#STUDENT_ROLL'},ConsistentRead=True).get('Item') else 'attribute_not_exists(counterId)',
                ExpressionAttributeValues=encode({':new':target,':old':current,':inst':inst,
                ':kind':'STUDENT_ROLL',':now':dt.datetime.now(dt.timezone.utc).isoformat()}))
    for entry in plan['changes']:
        transaction(client,db.Table('sadhana-dev-people'),entry,guards)
        print('UPDATED:', entry['personId'], entry['roll'])
    print('MIGRATION PASS:',len(plan['changes']),'students updated. Person and family IDs unchanged.')

if __name__ == '__main__': main()
