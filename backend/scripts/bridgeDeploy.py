#!/usr/bin/env python3
"""Explicitly update existing isolated M9 Lambda for legacy-registration bridge.

Dry-run default. Never updates the production Lambda/API or website records.
"""
import argparse, io, json, pathlib, subprocess, sys, zipfile

REGION='us-east-1'
LAMBDA='sadhana-m9-isolated-e2e'
ROLE='sadhana-m9-isolated-e2e-role'
POOL='us-east-1_nyQjIQasG'
ACCOUNT='627821644317'
WEBSITE='https://tc22v9iexa.execute-api.us-east-1.amazonaws.com'

def aws(profile,*args):
 cmd=['aws',*args,'--profile',profile,'--region',REGION,'--output','json']
 result=subprocess.run(cmd,text=True,capture_output=True)
 if result.returncode: raise RuntimeError(result.stderr.strip()[:600])
 return json.loads(result.stdout) if result.stdout.strip() else {}

def main():
 p=argparse.ArgumentParser();p.add_argument('--execute',action='store_true');p.add_argument('--profile',default='default');p.add_argument('--artifact',default='dist/lambda.mjs');a=p.parse_args()
 artifact=pathlib.Path(a.artifact)
 if not artifact.is_file():p.error('Run npm run build first; missing '+str(artifact))
 info=aws(a.profile,'lambda','get-function-configuration','--function-name',LAMBDA)
 if info.get('Role')!=f'arn:aws:iam::{ACCOUNT}:role/{ROLE}':p.error('Isolated Lambda role mismatch; refusing update')
 existing=info.get('Environment',{}).get('Variables',{})
 if existing.get('M9_STRICT_DATA_FENCE')!='enabled' or existing.get('M95_COMPAT_MODE')!='off':p.error('Strict fence not enabled; refusing update')
 if info.get('FunctionName')!=LAMBDA:p.error('Unexpected Lambda identity')
 if existing.get('SADHANA_PARENT_PROVISIONING_ENABLED')!='false':p.error('Provisioning must remain disabled')
 proposed=dict(existing)
 proposed.update({'M95_ONBOARDING_MODE':'enabled','M9_LEGACY_BRIDGE_WRITES':'enabled',
  'M95_WEBSITE_IMPORT_WRITES':'disabled','M95_WEBSITE_SYNC_WRITES':'disabled',
  'M9_VERIFIED_IDENTITY_LINK_WRITES':'disabled','RAAGASUDHA_REGISTRATIONS_API_URL':WEBSITE})
 policy={'Version':'2012-10-17','Statement':[
  {'Sid':'M9RegistrationBridgeOnly','Effect':'Allow','Action':['dynamodb:GetItem','dynamodb:Query','dynamodb:PutItem','dynamodb:UpdateItem','dynamodb:ConditionCheckItem'],
   'Resource':[f'arn:aws:dynamodb:{REGION}:{ACCOUNT}:table/sadhana-dev-m9-{t}' for t in ('people','families','family-links','counters','registrations','audit')]},
  {'Sid':'RaagasudhaRegistrationReadOnly','Effect':'Allow','Action':'execute-api:Invoke','Resource':f'arn:aws:execute-api:{REGION}:{ACCOUNT}:tc22v9iexa/*/GET/admin/registrations/*'},
 ]}
 result={'dryRun':not a.execute,'targetLambda':LAMBDA,'existingProductionApiUnchanged':True,
         'onboardingBridgeOnly':True,'cognitoProvisioningEnabled':False,'guardianAccessAutoApproved':False,
         'websiteMappingWritesEnabled':False,'legacyDynamoDbAccessGranted':False,
         'rolePolicy':'M9IsolatedWebsiteBridge','artifact':str(artifact)}
 if not a.execute: print(json.dumps(result,indent=2));return
 # Role policy first; never grant rights to legacy DynamoDB tables.
 aws(a.profile,'iam','put-role-policy','--role-name',ROLE,'--policy-name','M9IsolatedWebsiteBridge','--policy-document',json.dumps(policy))
 blob=io.BytesIO()
 with zipfile.ZipFile(blob,'w',zipfile.ZIP_DEFLATED) as z:z.write(artifact,'lambda.mjs')
 dest=artifact.parent/'m9-bridge-lambda.zip';dest.write_bytes(blob.getvalue())
 # Update code and wait before updating env (Lambda API requires sequential updates).
 aws(a.profile,'lambda','update-function-code','--function-name',LAMBDA,'--zip-file',f'fileb://{dest.resolve()}')
 subprocess.run(['aws','lambda','wait','function-updated','--function-name',LAMBDA,'--profile',a.profile,'--region',REGION],check=True)
 aws(a.profile,'lambda','update-function-configuration','--function-name',LAMBDA,'--environment',json.dumps({'Variables':proposed}))
 subprocess.run(['aws','lambda','wait','function-updated','--function-name',LAMBDA,'--profile',a.profile,'--region',REGION],check=True)
 print(json.dumps({**result,'dryRun':False,'status':'updated-isolated-bridge-only'},indent=2))

if __name__=='__main__':
 try:main()
 except Exception as exc:print('STOPPED:',exc,file=sys.stderr);sys.exit(1)
