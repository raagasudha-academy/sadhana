#!/usr/bin/env python3
"""Read-only M9.1 closeout gate. Never modifies AWS resources or records."""
import argparse, json, os, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def aws(*args):
    p=subprocess.run(['aws',*args,'--profile','default','--region','us-east-1','--output','json'],capture_output=True,text=True)
    if p.returncode: raise RuntimeError(f'AWS {args[0]} check failed: {p.stderr.strip()[:240]}')
    return json.loads(p.stdout)

def source_checks(root=ROOT):
    importer=(root/'src/websiteImport.ts').read_text()
    gateway=(root/'src/websiteRegistrationGateway.ts').read_text()
    sync=(root/'src/websiteSyncCore.mjs').read_text()
    return {
        'srutiImportBlocked':"if(inst!=='raaga')" in importer,
        'srutiSyncBlocked':"if(inst!=='raaga'" in importer or "institution !== 'raaga'" in sync,
        'raagaOnlyGateway': 'RAAGASUDHA_REGISTRATIONS_API_URL' in gateway and 'SRUTI_REGISTRATIONS_API_URL' not in gateway,
        'strictFenceSourcePresent': (root/'src/finalLearner.ts').exists(),
    }

def evaluate(source,aws_checks=None):
    blockers=[]
    if source['srutiImportBlocked'] or source['srutiSyncBlocked'] or source['raagaOnlyGateway']:
        blockers.append('SRUTI_INTAKE_CONTRACT_AND_IMPORT')
    if aws_checks is not None:
        if not aws_checks['accountCorrect'] or not aws_checks['isolatedLambdaActive'] or not aws_checks['strictFence'] or not aws_checks['identityLinkWritesDisabled']:
            blockers.append('ISOLATED_AWS_SAFETY')
    blockers.extend(['AUDIO_VIDEO_POSITIVE_UPLOAD_E2E','COGNITO_INVITATION_RECOVERY_REVOCATION_E2E','CROSS_INSTITUTION_FULL_MATRIX','ROLLBACK_REHEARSAL','CUTOVER_PARITY_AND_APPROVAL'])
    return {'schema':1,'readOnly':True,'sourceChecks':source,'awsChecks':aws_checks,'blockers':blockers,'productionCutoverReady':False,'note':'User-reported earlier successes are not re-executed or treated as automated evidence by this script.'}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--aws',action='store_true',help='Read-only isolated Lambda configuration check')
    parser.add_argument('--report',help='Optional output path; refuses overwrite')
    args=parser.parse_args()
    source=source_checks()
    aws_checks=None
    if args.aws:
        identity=aws('sts','get-caller-identity')
        cfg=aws('lambda','get-function-configuration','--function-name','sadhana-m9-isolated-e2e')
        env=cfg.get('Environment',{}).get('Variables',{})
        aws_checks={'accountCorrect':identity.get('Account')=='627821644317',
                    'isolatedLambdaActive':cfg.get('State')=='Active' and cfg.get('LastUpdateStatus')=='Successful',
                    'strictFence':env.get('M9_STRICT_DATA_FENCE')=='enabled',
                    'identityLinkWritesDisabled':env.get('M9_VERIFIED_IDENTITY_LINK_WRITES')=='disabled',
                    'mediaEnabled':env.get('M9_HOMEWORK_MEDIA')=='enabled'}
    result=evaluate(source,aws_checks)
    content=json.dumps(result,indent=2)+'\n'
    if args.report:
        with open(args.report,'x',encoding='utf-8') as f: f.write(content)
    print(content,end='')
if __name__=='__main__':main()
