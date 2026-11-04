#!/usr/bin/env python3
"""Explicit opt-in, fail-closed isolated M9 HTTP API deployment.
Creates a *new* IAM role, Lambda and HTTP API. Never modifies existing API/Lambda.
Requires already built backend/dist/lambda.mjs and AWS CLI credentials.
"""
import argparse, hashlib, io, json, os, pathlib, subprocess, sys, time, zipfile
from m91IsolatedPolicy import build_policy

REGION = 'us-east-1'
LIVE_API = '6n9clqr224'
LIVE_FUNCTION = 'sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh'
NAME = 'sadhana-m9-isolated-e2e'
ROLE_NAME = 'sadhana-m9-isolated-e2e-role'
BUCKET = 'sadhana-dev-homework-media-627821644317-us-east-1'
M9_PREFIX = 'sadhana-dev-m9-'
TABLES = ['institutions','people','families','family-links','classes','venues','enrolments','sessions','attendance','practice','homework','submissions','events','rsvps','registrations','notifications','audit','counters']

def aws(profile, *args, payload=None):
    cmd = ['aws', *args, '--region', REGION, '--profile', profile, '--output', 'json']
    result = subprocess.run(cmd, input=(json.dumps(payload) if payload is not None else None), text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"AWS command failed ({' '.join(args[:2])}): {result.stderr.strip()[:500]}")
    return json.loads(result.stdout) if result.stdout.strip() else {}

def preflight(profile, artifact, report):
    p = json.loads(report.read_text())
    if not p.get('decision', {}).get('infrastructurePreflightPassed'):
        raise RuntimeError('M9 infrastructure preflight has not passed. Use the v3 successful report.')
    if not artifact.exists() or not artifact.is_file():
        raise RuntimeError('Missing dist/lambda.mjs; run npm run check && npm run build first.')
    identity = aws(profile, 'sts', 'get-caller-identity')
    if identity['Account'] != '627821644317':
        raise RuntimeError('Wrong AWS account; refusing deployment')
    live = aws(profile, 'lambda','get-function-configuration','--function-name', LIVE_FUNCTION)
    auths = aws(profile, 'apigatewayv2', 'get-authorizers', '--api-id', LIVE_API).get('Items', [])
    jwt = [a for a in auths if a.get('AuthorizerType') == 'JWT' and a.get('JwtConfiguration',{}).get('Audience') and a.get('JwtConfiguration',{}).get('Issuer')]
    if len(jwt) != 1:
        raise RuntimeError('Need exactly one existing JWT authorizer on current API; refuse to create unauthenticated test API')
    for t in TABLES:
        status = aws(profile,'dynamodb','describe-table','--table-name',M9_PREFIX+t)['Table']
        if status.get('TableStatus') != 'ACTIVE' or not status.get('DeletionProtectionEnabled'):
            raise RuntimeError(f'M9 table {t} is not ACTIVE / deletion protected')
    for kind,idval in [('lambda', NAME), ('iam', ROLE_NAME)]:
        cmd = ['aws',*( ['lambda','get-function','--function-name',idval] if kind == 'lambda' else ['iam','get-role','--role-name',idval] ), '--profile',profile,'--region',REGION,'--output','json']
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0:
            raise RuntimeError(f'{kind} {idval} already exists: no overwrite or partial redeployment permitted')
        if 'not found' not in result.stderr.lower() and 'resourcenotfound' not in result.stderr.lower() and 'nosuchentity' not in result.stderr.lower():
            raise RuntimeError(f'Unable to verify absence of {kind} {idval}: {result.stderr.strip()[:200]}')
    params = live.get('Environment',{}).get('Variables',{})
    if not params.get('SADHANA_TABLE_NAME'):
        raise RuntimeError('Live SADHANA_TABLE_NAME missing; required to construct handler even under strict fence')
    return {
        'account':identity['Account'],
        'lambda':live,
        'jwt':jwt[0],
        'sha256':hashlib.sha256(artifact.read_bytes()).hexdigest(),
        'env':params,
    }

def deploy(profile, artifact, discovered):
    account=discovered['account']; envsource=discovered['env']
    assume={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'lambda.amazonaws.com'},'Action':'sts:AssumeRole'}]}
    role=aws(profile,'iam','create-role','--role-name',ROLE_NAME,'--assume-role-policy-document',json.dumps(assume),'--description','Isolated Sadhana M9 end-to-end Lambda; no legacy DynamoDB table access')
    rolearn=role['Role']['Arn']
    aws(profile,'iam','attach-role-policy','--role-name',ROLE_NAME,'--policy-arn','arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
    policy=build_policy(account,REGION,envsource.get('SADHANA_COGNITO_USER_POOL_ID') or 'us-east-1_nyQjIQasG',BUCKET)
    aws(profile,'iam','put-role-policy','--role-name',ROLE_NAME,'--policy-name','M9IsolatedDataOnly','--policy-document',json.dumps(policy))
    env={
     'AWS_NODEJS_CONNECTION_REUSE_ENABLED':'1',
     'SADHANA_TABLE_NAME':envsource['SADHANA_TABLE_NAME'],  # constructor only; role cannot access it
     'SADHANA_COGNITO_USER_POOL_ID':envsource.get('SADHANA_COGNITO_USER_POOL_ID',''),
     'SADHANA_LEARNER_MEDIA_BUCKET':BUCKET,
     'M9_STRICT_DATA_FENCE':'enabled',
     'M9_API_ENABLED':'read-only',
     'M9_TARGET_REPOSITORY_ENABLED':'read-only',
     'M9_FINAL_LEARNER_READS':'enabled',
     'M9_LEARNER_WRITES':'enabled',
     'M9_HOMEWORK_WRITES':'enabled',
     'M95_COMPAT_MODE':'off',
     'M95_ONBOARDING_MODE':'disabled',
     'M9_API_WRITES_ENABLED':'disabled',
     'M9_TARGET_REPOSITORY_WRITES':'disabled',
     'M9_VERIFIED_IDENTITY_LINK_WRITES':'disabled',
     'SADHANA_PARENT_PROVISIONING_ENABLED':'false',
     'SADHANA_ENABLE_REVOKE_EXECUTION':'false'
    }
    image=io.BytesIO()
    with zipfile.ZipFile(image,'w',zipfile.ZIP_DEFLATED) as z:
        z.write(artifact,'lambda.mjs')
    zip_path=artifact.parent/'m9-isolated-lambda.zip'
    zip_path.write_bytes(image.getvalue())
    function=None
    for n in range(8):
        proc=subprocess.run(['aws','lambda','create-function','--function-name',NAME,'--runtime','nodejs22.x','--handler','lambda.handler','--role',rolearn,'--zip-file',f'fileb://{zip_path.resolve()}','--timeout','30','--memory-size','512','--environment',json.dumps({'Variables':env}),'--region',REGION,'--profile',profile,'--output','json'],capture_output=True,text=True)
        if proc.returncode==0:
            function=json.loads(proc.stdout); break
        if 'cannot be assumed by lambda' not in proc.stderr.lower() and 'role' not in proc.stderr.lower():
            raise RuntimeError('Lambda create-function failed: '+proc.stderr.strip()[:500])
        time.sleep(3)
    if function is None: raise RuntimeError('New IAM role not available to Lambda; check resources before retrying')
    # New API. Never changes live API integration, authorizer, stages or Lambda.
    live_api=aws(profile,'apigatewayv2','get-api','--api-id',LIVE_API)
    args=['apigatewayv2','create-api','--name',NAME,'--protocol-type','HTTP']
    if live_api.get('CorsConfiguration'):
        args+=['--cors-configuration',json.dumps(live_api['CorsConfiguration'])]
    api=aws(profile,*args); apiid=api['ApiId']
    integration=aws(profile,'apigatewayv2','create-integration','--api-id',apiid,'--integration-type','AWS_PROXY','--integration-uri',function['FunctionArn'],'--payload-format-version','2.0')
    j=discovered['jwt']['JwtConfiguration']
    authorizer=aws(profile,'apigatewayv2','create-authorizer','--cli-input-json',json.dumps({
        'ApiId':apiid,'AuthorizerType':'JWT','Name':'M9IsolatedCognitoJWT',
        'IdentitySource':['$request.header.Authorization'],
        'JwtConfiguration':{'Audience':j['Audience'],'Issuer':j['Issuer']}
    }))
    aws(profile,'apigatewayv2','create-route','--api-id',apiid,'--route-key','ANY /api/{proxy+}','--target','integrations/'+integration['IntegrationId'],'--authorization-type','JWT','--authorizer-id',authorizer['AuthorizerId'])
    aws(profile,'apigatewayv2','create-route','--api-id',apiid,'--route-key','OPTIONS /api/{proxy+}','--target','integrations/'+integration['IntegrationId'],'--authorization-type','NONE')
    aws(profile,'apigatewayv2','create-stage','--api-id',apiid,'--stage-name','m9-test','--auto-deploy')
    aws(profile,'lambda','add-permission','--function-name',NAME,'--statement-id','AllowIsolatedM9HttpApi','--action','lambda:InvokeFunction','--principal','apigateway.amazonaws.com','--source-arn',f'arn:aws:execute-api:{REGION}:{account}:{apiid}/*/*/api/*')
    return {'schema':1,'status':'created-not-e2e-verified','apiId':apiid,'apiBaseUrl':api['ApiEndpoint']+'/m9-test/api','lambdaName':NAME,'roleArn':rolearn,'sourceSha256':discovered['sha256'],'productionApiUntouched':True,'strictFenceEnabled':True,'legacyDynamoDbAccessGranted':False,'onboardingAndCognitoProvisioningDisabled':True}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--execute',action='store_true',help='Explicitly authorise isolated AWS resource creation')
    parser.add_argument('--profile',default=os.environ.get('AWS_PROFILE','default'))
    parser.add_argument('--artifact',default='dist/lambda.mjs')
    parser.add_argument('--preflight',default='./m9-cutover-preflight-v3.json')
    parser.add_argument('--report',default='./m9-isolated-deployment.json')
    args=parser.parse_args()
    artifact=pathlib.Path(args.artifact); report=pathlib.Path(args.preflight)
    if not report.exists(): parser.error('Missing successful preflight report '+str(report))
    if pathlib.Path(args.report).exists(): parser.error('Refusing to overwrite existing deployment report')
    discovered=preflight(args.profile, artifact,report)
    if not args.execute:
        print(json.dumps({'dryRun':True,'account':discovered['account'],'artifactSha256':discovered['sha256'],'jwtIssuer':discovered['jwt']['JwtConfiguration']['Issuer'],'newLambda':NAME,'newRole':ROLE_NAME,'newApi':NAME,'existingApiUnchanged':True,'warning':'No AWS writes. Re-run with --execute to create isolated resources.'},indent=2))
        return
    result=deploy(args.profile,artifact,discovered)
    pathlib.Path(args.report).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('DEPLOYMENT STOPPED: '+str(exc),file=sys.stderr)
        print('Some isolated resources may have been created if --execute was used. Inspect AWS before retrying; existing API was not intentionally modified.',file=sys.stderr)
        sys.exit(1)
