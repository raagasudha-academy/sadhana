#!/usr/bin/env python3
"""Read-only verification of isolated M9 media deployment settings. No credentials printed."""
import json, subprocess, sys
ACCOUNT='627821644317'
FUNCTION='sadhana-m9-isolated-e2e'
REGION='us-east-1'
PROFILE='default'
def aws(*args):
    proc=subprocess.run(['aws',*args,'--profile',PROFILE,'--region',REGION,'--output','json'],capture_output=True,text=True)
    if proc.returncode: raise RuntimeError(f"AWS {args[0]} failed ({proc.returncode}): {proc.stderr.strip()[:250]}")
    return json.loads(proc.stdout or '{}')
def main():
    ident=aws('sts','get-caller-identity')
    if ident.get('Account')!=ACCOUNT: raise RuntimeError('Wrong AWS account')
    config=aws('lambda','get-function-configuration','--function-name',FUNCTION)
    env=config.get('Environment',{}).get('Variables',{})
    bucket=env.get('SADHANA_LEARNER_MEDIA_BUCKET','')
    guards={k:env.get(k,'(unset)') for k in ('M9_STRICT_DATA_FENCE','M9_HOMEWORK_WRITES','M9_HOMEWORK_MEDIA','M9_VERIFIED_IDENTITY_LINK_WRITES')}
    checks={
      'lambdaActive':config.get('State')=='Active' and config.get('LastUpdateStatus')=='Successful',
      'strictFence':guards['M9_STRICT_DATA_FENCE']=='enabled',
      'homeworkWrites':guards['M9_HOMEWORK_WRITES']=='enabled',
      'identityLinkWritesDisabled':guards['M9_VERIFIED_IDENTITY_LINK_WRITES']=='disabled',
      'bucketConfigured':bool(bucket),
      'mediaFeatureOptIn':guards['M9_HOMEWORK_MEDIA']=='enabled',
    }
    if bucket:
        try:
            public=aws('s3api','get-public-access-block','--bucket',bucket)['PublicAccessBlockConfiguration']
            checks['allPublicAccessBlocked']=all(public.get(k) is True for k in ('BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'))
        except Exception: checks['allPublicAccessBlocked']=False
        try:
            encryption=aws('s3api','get-bucket-encryption','--bucket',bucket)
            checks['bucketEncrypted']=bool(encryption.get('ServerSideEncryptionConfiguration',{}).get('Rules'))
        except Exception: checks['bucketEncrypted']=False
        try:
            cors=aws('s3api','get-bucket-cors','--bucket',bucket).get('CORSRules',[])
            checks['browserPutCors']=any('PUT' in r.get('AllowedMethods',[]) and 'Content-Type' in r.get('AllowedHeaders',[]) or 'PUT' in r.get('AllowedMethods',[]) and '*' in r.get('AllowedHeaders',[]) for r in cors)
        except Exception: checks['browserPutCors']=False
    print(json.dumps({'readOnly':True,'account':ident['Account'],'lambda':FUNCTION,'bucketConfigured':bool(bucket),'checks':checks,'safeForMediaE2E':all(checks.values()),'productionChanged':False},indent=2))
    if not all(checks.values()):sys.exit(2)
if __name__=='__main__':
    try:main()
    except Exception as e:print('MEDIA PREFLIGHT BLOCKED:',str(e),file=sys.stderr);sys.exit(1)
