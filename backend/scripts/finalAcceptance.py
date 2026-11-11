#!/usr/bin/env python3
"""M9.1 non-destructive isolated-API acceptance checks.

Default: AWS configuration/status checks only. --negative-media checks rejection
of invalid media start requests against an EXISTING test homework; no successful
media-start requests, new objects, submissions, invitations, or approvals.
"""
import argparse
import base64
import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.request

ACCOUNT='627821644317'
REGION='us-east-1'
FUNCTION='sadhana-m9-isolated-e2e'
API='https://y3eobn1ppi.execute-api.us-east-1.amazonaws.com/m9-test/api'
ISS='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_nyQjIQasG'
CLIENT='5l61r0hmdb2ga2dregunoeqsqe'
PARENT='844844e8-9061-70e4-6b95-f84584536a30'
STUDENT='per_620c5ec74e45e6442daab84c83f4243d4713470694d98271130a34bc3bcabd5b'
HOMEWORK='HOMEWORK-ff753767-e0e7-43d5-995e-e4c1ee2ad560'
CLASS='CLASS-RAAGA-MIDDLESBROUGH'
EXPECTED_HASH='Mb+RKczzq9ly4mUaLJ4CwbsZykdQ0s7A7wCux6YRnRk='

class Stopped(Exception):pass

def aws(*args):
    p=subprocess.run(['aws',*args,'--profile','default','--region',REGION,'--output','json'],capture_output=True,text=True)
    if p.returncode:raise Stopped('AWS read-only operation failed: '+p.stderr[:200])
    try:return json.loads(p.stdout)
    except json.JSONDecodeError:raise Stopped('AWS command returned invalid JSON')

def configuration():
    account=aws('sts','get-caller-identity').get('Account')
    if account!=ACCOUNT:raise Stopped('Incorrect AWS account')
    cfg=aws('lambda','get-function-configuration','--function-name',FUNCTION)
    flags=cfg.get('Environment',{}).get('Variables',{})
    checks={
        'lambdaReady':cfg.get('State')=='Active' and cfg.get('LastUpdateStatus')=='Successful',
        'mediaBuildUnchanged':cfg.get('CodeSha256')==EXPECTED_HASH,
        'strictLegacyFence':flags.get('M9_STRICT_DATA_FENCE')=='enabled',
        'identityLinkWritesOff':flags.get('M9_VERIFIED_IDENTITY_LINK_WRITES')=='disabled',
        'parentProvisioningOff':flags.get('SADHANA_PARENT_PROVISIONING_ENABLED')=='false',
        'mediaEnabled':flags.get('M9_HOMEWORK_MEDIA')=='enabled',
        'homeworkEnabled':flags.get('M9_HOMEWORK_WRITES')=='enabled',
    }
    return {'account':account,'isolatedLambda':FUNCTION,'readOnly':True,'checks':checks,'ready':all(checks.values())}

def decode_token(raw):
    token=raw.strip().removeprefix('Bearer ').removeprefix('bearer ').strip()
    try:
        parts=token.split('.')
        if len(parts)!=3:raise ValueError('three JWT parts required')
        payload=parts[1]+'='*(-len(parts[1])%4)
        claims=json.loads(base64.urlsafe_b64decode(payload))
    except (ValueError,IndexError,TypeError) as exc:raise Stopped('Invalid clipboard JWT') from exc
    now=datetime.datetime.now(datetime.timezone.utc).timestamp()
    if not (claims.get('iss')==ISS and claims.get('client_id')==CLIENT and claims.get('token_use')=='access' and claims.get('exp',0)>now and claims.get('sub')==PARENT):
        raise Stopped('Clipboard token is not the fresh, expected guardian access token')
    return token

def clipboard_parent():
    input('Copy PARENT ACCESS token to clipboard, then press Return: ')
    t=subprocess.check_output(['pbpaste'],text=True)
    subprocess.run(['pbcopy'],input='',check=True,text=True)
    return decode_token(t)

def req(method,path,token,body=None):
    data=json.dumps(body).encode() if body is not None else None
    request=urllib.request.Request(API+path,method=method,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=40) as response:return response.status
    except urllib.error.HTTPError as err:
        err.read(4096)
        return err.code

def negative_cases():
    # Important: these requests are all expected to be rejected BEFORE a pending
    # receipt can be written. No valid media-start requests are sent.
    base=f'/learner/{STUDENT}/submission/{HOMEWORK}/evidence/start'
    return [
        ('image-over-5MB',base+'?institution=raaga',{'mime':'image/png','size':5000001},400),
        ('audio-mp3-over-20MB',base+'?institution=raaga',{'mime':'audio/mpeg','size':20000001},400),
        ('audio-m4a-over-20MB',base+'?institution=raaga',{'mime':'audio/mp4','size':20000001},400),
        ('video-mp4-over-100MB',base+'?institution=raaga',{'mime':'video/mp4','size':100000001},400),
        ('unsupported-mime',base+'?institution=raaga',{'mime':'application/pdf','size':100},400),
        ('empty-file',base+'?institution=raaga',{'mime':'image/png','size':0},400),
        ('noninteger-size',base+'?institution=raaga',{'mime':'image/png','size':2.5},400),
        ('cross-institution',base+'?institution=sruti',{'mime':'image/png','size':70},403),
        ('nonexistent-student',f'/learner/per_nonexistent_m91_acceptance/submission/{HOMEWORK}/evidence/start?institution=raaga',{'mime':'image/png','size':70},403),
    ]

def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--negative-media',action='store_true',help='Perform only rejected media-start API requests; requires guardian token')
    args=cli.parse_args()
    status=configuration()
    print(json.dumps({'preflight':status,'negativeMediaRequested':args.negative_media},indent=2))
    if not status['ready']:raise Stopped('Isolated preflight failed; no HTTP requests performed')
    if not args.negative_media:return
    parent=clipboard_parent()
    # A read-only dashboard check ensures the parent still has the intended access.
    dashboard=req('GET',f'/learner/{STUDENT}/dashboard?institution=raaga',parent)
    if dashboard!=200:raise Stopped('Guardian dashboard access changed, HTTP '+str(dashboard))
    print(json.dumps({'check':'guardian-dashboard','actual':dashboard,'passed':True}))
    confirmation=input('Type RUN REJECTION TESTS to send invalid requests only: ').strip()
    if confirmation!='RUN REJECTION TESTS':raise Stopped('Cancelled; no media-start calls performed')
    failures=[]
    for name,path,body,expected in negative_cases():
        got=req('POST',path,parent,body)
        passed=(got==expected)
        print(json.dumps({'test':name,'expected':expected,'actual':got,'passed':passed}))
        if not passed:failures.append(name)
    print(json.dumps({'negativeMediaPassed':not failures,'caseCount':len(negative_cases()),'failed':failures,'newAssignmentsCreated':0,'newS3Uploads':0,'productionCutoverReady':False},indent=2))
    if failures:raise Stopped('Some negative media checks failed; investigate before continuing')

if __name__=='__main__':
    try:main()
    except (Stopped,KeyboardInterrupt,EOFError,urllib.error.URLError,subprocess.CalledProcessError) as exc:
        print('STOPPED: '+str(exc),file=sys.stderr)
        sys.exit(1)
