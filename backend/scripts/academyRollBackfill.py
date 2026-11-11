#!/usr/bin/env python3
"""Sadhana academy-roll preview and explicitly confirmed canonical backfill.

Does NOT change person IDs, family IDs, memberships, guardian approvals, or Cognito.
Preview by default. Use --apply only after reviewing the proposed mapping.
"""
import argparse
import datetime as dt
from decimal import Decimal
import hashlib
import json
import re
from pathlib import Path

import boto3
from boto3.dynamodb.types import TypeSerializer

ACCOUNT = '627821644317'
REGION = 'us-east-1'
PREFIX = {'raaga': 'RS', 'sruti': 'SR'}
ser = TypeSerializer()

def whole_number(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, Decimal)) or value != int(value) or value < minimum:
        raise RuntimeError(f"Invalid {label}: expected whole number >= {minimum}")
    return int(value)

def av(data):
    return {key:ser.serialize(value) for key,value in data.items()}

def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def all_rows(table):
    rows=[]; cursor=None
    while True:
        kw={'ConsistentRead':True}
        if cursor:kw['ExclusiveStartKey']=cursor
        result=table.scan(**kw)
        rows.extend(result.get('Items',[]))
        cursor=result.get('LastEvaluatedKey')
        if not cursor:return rows

def build_plan(people,counters):
    changes=[]; summary={}
    for inst,prefix in PREFIX.items():
        students=[p for p in people if 'student' in p.get('personTypes',[]) and inst in p.get('institutionIds',[])]
        used=set(); missing=[]
        for person in students:
            roll=(person.get('studentProfile') or {}).get('rollNumbers',{}).get(inst,'')
            match=re.fullmatch(rf'{prefix}-([0-9]{{3,}})',roll) if isinstance(roll,str) else None
            if match and int(match.group(1))>0:
                number=int(match.group(1))
                if number in used:raise RuntimeError(f'Duplicate {prefix} roll {number}; resolve first')
                used.add(number)
            else:
                whole_number(person.get('version'), f'person version {person.get("personId")}', minimum=1)
                missing.append((person,roll))
        missing.sort(key=lambda entry:(entry[0].get('createdAt',''),entry[0]['personId']))
        n=max(1,counters[inst]['value']+1)
        for person,old in missing:
            while n in used:n+=1
            new=f'{prefix}-{n:03d}'
            used.add(n)
            changes.append({'institution':inst,'personId':person['personId'],
                            'oldRoll':old,'newRoll':new,'version':whole_number(person['version'], 'person version', minimum=1),
                            'name':person.get('displayName') or person.get('firstName','')})
        summary[inst]={'students':len(students),'toUpdate':len(missing),
                       'highWater':max(used,default=0),'counter':counters[inst]['value']}
    return {'account':ACCOUNT,'summary':summary,'changes':changes}

def snapshot(db):
    people=all_rows(db.Table('sadhana-dev-people'))
    counters={}
    for inst in PREFIX:
        item=db.Table('sadhana-dev-counters').get_item(Key={'counterId':f'{inst}#STUDENT_ROLL'},ConsistentRead=True).get('Item')
        value=item.get('lastAllocated',0) if item else 0
        value=whole_number(value, f'counter: {inst}')
        counters[inst]={'value':value,'exists':bool(item)}
    return people,counters

def set_counter(client,inst,old,next_value,exists):
    if next_value<=old:return old,exists
    client.update_item(TableName='sadhana-dev-counters',Key=av({'counterId':f'{inst}#STUDENT_ROLL'}),
        UpdateExpression='SET lastAllocated=:next, institutionId=:inst, sequenceType=:kind, updatedAt=:now',
        ConditionExpression='lastAllocated=:old' if exists else 'attribute_not_exists(counterId)',
        ExpressionAttributeValues=av({':next':next_value,':old':old,':inst':inst,':kind':'STUDENT_ROLL',':now':timestamp()}))
    return next_value,True

def apply_one(client,people_table,entry,counter):
    inst=entry['institution']; person_id=entry['personId']
    current=people_table.get_item(Key={'personId':person_id},ConsistentRead=True).get('Item')
    if not current or 'student' not in current.get('personTypes',[]) or inst not in current.get('institutionIds',[]):
        raise RuntimeError(f'Membership changed: {person_id}')
    old=(current.get('studentProfile') or {}).get('rollNumbers',{}).get(inst,'')
    if old!=entry['oldRoll'] or whole_number(current.get('version'), f'person version {person_id}', minimum=1)!=entry['version']:
        raise RuntimeError(f'Person roll/version changed; rerun preview: {person_id}')
    profile=dict(current.get('studentProfile') or {})
    profile['rollNumbers']={**(profile.get('rollNumbers') or {}),inst:entry['newRoll']}
    if old:
        profile['legacyRollNumbers']={**(profile.get('legacyRollNumbers') or {}),inst:old}
    now=timestamp(); actor='migration:academy-roll-backfill'
    audit_id='roll_'+hashlib.sha256(f'{inst}:{person_id}:{entry["newRoll"]}'.encode()).hexdigest()
    actions=[
      {'Update':{'TableName':'sadhana-dev-people','Key':av({'personId':person_id}),
        'UpdateExpression':'SET #profile=:profile, #version=:next, #updated=:now',
        'ConditionExpression':'#version=:old AND contains(#institutions,:inst)',
        'ExpressionAttributeNames':{'#profile':'studentProfile','#version':'version','#updated':'updatedAt','#institutions':'institutionIds'},
        'ExpressionAttributeValues':av({':profile':profile,':next':entry['version']+1,':old':entry['version'],':now':now,':inst':inst})}},
      {'Put':{'TableName':'sadhana-dev-counters','Item':av({'counterId':f'ROLL_UNIQUE#{inst}#{entry["newRoll"]}',
        'institutionId':inst,'sequenceType':'ROLL_UNIQUE','personId':person_id,'createdAt':now}),
        'ConditionExpression':'attribute_not_exists(counterId)'}},
      {'Put':{'TableName':'sadhana-dev-audit-records','Item':av({'auditId':audit_id,'institutionId':inst,
        'actorCognitoSub':actor,'action':'ACADEMY_STUDENT_ROLL_ASSIGNED','resourceType':'person',
        'resourceId':person_id,'result':'success','timestamp':now,'schemaVersion':1,
        'metadata':{'oldRoll':old,'newRoll':entry['newRoll']}}),
        'ConditionExpression':'attribute_not_exists(auditId)'}}]
    client.transact_write_items(TransactItems=actions)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--confirm',default='')
    parser.add_argument('--plan',type=Path,default=Path.home()/'Downloads/sadhana-academy-roll-plan.json')
    args=parser.parse_args()
    assert boto3.client('sts',region_name=REGION).get_caller_identity()['Account']==ACCOUNT,'Wrong AWS account'
    db=boto3.resource('dynamodb',region_name=REGION)
    people,counters=snapshot(db)
    plan=build_plan(people,counters)
    if not args.apply:
        args.plan.parent.mkdir(parents=True,exist_ok=True)
        args.plan.write_text(json.dumps(plan,indent=2))
        args.plan.chmod(0o600)
        print('READ-ONLY ACADEMY ROLL PREVIEW')
        for inst,row in plan['summary'].items():print(inst,row)
        for entry in plan['changes']:
            print(entry['institution'],entry['name'],repr(entry['oldRoll']),'->',entry['newRoll'])
        print('PLAN:',args.plan)
        print('NO AWS WRITES. Review all proposed assignments before applying.')
        return
    assert args.confirm=='APPLY-SADHANA-ACADEMY-ROLLS','Explicit confirmation required'
    saved=json.loads(args.plan.read_text())
    if saved!=plan:raise RuntimeError('Plan changed. Run preview again; nothing written.')
    client=boto3.client('dynamodb',region_name=REGION)
    # Counter must be at least the highest assigned label, including any pre-existing formatted rolls.
    for inst in PREFIX:
        old=counters[inst]['value']; top=plan['summary'][inst]['highWater']
        counters[inst]['value'],counters[inst]['exists']=set_counter(client,inst,old,top,counters[inst]['exists'])
    for entry in saved['changes']:
        apply_one(client,db.Table('sadhana-dev-people'),entry,counters[entry['institution']])
        print('UPDATED',entry['institution'],entry['newRoll'])
    print('PASS:',len(saved['changes']),'academy roll numbers updated. Shared IDs unchanged.')

if __name__=='__main__':
    raise SystemExit('OBSOLETE: this script assigns separate academy rolls. Use permanentRollBackfill.py instead; no AWS writes performed.')
