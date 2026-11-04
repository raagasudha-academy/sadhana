#!/usr/bin/env python3
"""Read-only class/enrolment discovery for the two already imported Raaga students.

Never creates records. Does not reimport families or touch production.
"""
import json,subprocess,sys
ACCOUNT='627821644317'
STUDENTS={'001-001':'per_620c5ec74e45e6442daab84c83f4243d4713470694d98271130a34bc3bcabd5b',
          '001-002':'per_8de169dee983b52dda5fc4a674b5136016e26b7ce7a006806d07060cd2fc8280'}

def aws(*args):
    p=subprocess.run(['aws',*args,'--profile','default','--region','us-east-1','--output','json'],text=True,capture_output=True,timeout=35)
    if p.returncode: raise RuntimeError(p.stderr[:240])
    return json.loads(p.stdout)

def all_query(table,index,expression,names,values):
    rows=[];cursor=None
    while True:
        params=['dynamodb','query','--table-name',table,'--index-name',index,'--key-condition-expression',expression,
                '--expression-attribute-names',json.dumps(names),'--expression-attribute-values',json.dumps(values)]
        if cursor: params+=['--exclusive-start-key',json.dumps(cursor)]
        page=aws(*params);rows.extend(page.get('Items',[]))
        if len(rows)>500: raise RuntimeError('Query exceeds 500 rows; stop for manual review')
        cursor=page.get('LastEvaluatedKey')
        if not cursor:return rows

def field(item,name):return item.get(name,{}).get('S')
def main():
    if aws('sts','get-caller-identity')['Account']!=ACCOUNT: raise RuntimeError('Wrong AWS account')
    classes=all_query('sadhana-dev-m9-classes','InstitutionClassesIndex','#i=:i',{'#i':'institutionId'},{':i':{'S':'raaga'}})
    available=[{'classId':field(x,'classId'),'name':field(x,'name'),'status':field(x,'status')} for x in classes if field(x,'classId')]
    enrolments={}
    for roll,student in STUDENTS.items():
        rows=all_query('sadhana-dev-m9-enrolments','StudentEnrolmentsIndex','#s=:s',{'#s':'studentId'},{':s':{'S':student}})
        enrolments[roll]=[{'enrolmentId':field(x,'enrolmentId'),'classId':field(x,'classId'),'institutionId':field(x,'institutionId'),'status':field(x,'status')} for x in rows]
    print(json.dumps({'readOnly':True,'institution':'raaga','existingClasses':available,'studentEnrolments':enrolments,
                      'nextStep':'Select appropriate existing classes and verify teacher assignment before any controlled test enrolment'},indent=2))
if __name__=='__main__':
    try:main()
    except Exception as e:print('PREVIEW STOPPED: '+str(e),file=sys.stderr);sys.exit(2)
