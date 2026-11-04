#!/usr/bin/env python3
"""Read-only IAM drift check against source policy. Does not print credentials."""
import argparse, json, os, subprocess, sys
from m91IsolatedPolicy import build_policy, policy_diff

def aws(*args):
    result=subprocess.run(['aws',*args,'--profile','default','--region','us-east-1','--output','json'],capture_output=True,text=True,timeout=35)
    if result.returncode: raise RuntimeError('AWS read failed: '+result.stderr[:250])
    return json.loads(result.stdout)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--report',help='Optional NEW report path; never overwrites')
    args=ap.parse_args()
    account=aws('sts','get-caller-identity')['Account']
    expected=build_policy(account)
    fn=aws('lambda','get-function-configuration','--function-name','sadhana-m9-isolated-e2e')
    if fn.get('Role')!=f'arn:aws:iam::{account}:role/sadhana-m9-isolated-e2e-role': raise RuntimeError('Unexpected isolated execution role')
    flags=fn.get('Environment',{}).get('Variables',{})
    guards={k:flags.get(k) for k in ('M9_STRICT_DATA_FENCE','M9_VERIFIED_IDENTITY_LINK_WRITES','M95_ONBOARDING_MODE','SADHANA_PARENT_PROVISIONING_ENABLED')}
    actual=aws('iam','get-role-policy','--role-name','sadhana-m9-isolated-e2e-role','--policy-name','M9IsolatedDataOnly')['PolicyDocument']
    diff=policy_diff(actual,expected)
    safe=guards['M9_STRICT_DATA_FENCE']=='enabled' and guards['M9_VERIFIED_IDENTITY_LINK_WRITES']=='disabled' and guards['SADHANA_PARENT_PROVISIONING_ENABLED']=='false'
    report={'schema':1,'readOnly':True,'account':account,'lambda':'sadhana-m9-isolated-e2e','iam':diff,'guards':guards,'safeToProceedWithReadOnlyChecks':safe and diff['matches'],'productionCutoverReady':False}
    if args.report:
        with open(args.report,'x',encoding='utf8') as f: json.dump(report,f,indent=2)
    print(json.dumps(report,indent=2))
    return 0 if safe and diff['matches'] else 2

if __name__=='__main__':
    try: sys.exit(main())
    except Exception as e: print('AUDIT STOPPED: '+str(e),file=sys.stderr);sys.exit(2)
