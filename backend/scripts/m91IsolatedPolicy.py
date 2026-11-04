"""Version-controlled least-privilege M9 isolated execution policy.

Not for the production Lambda. No AWS calls are made by this module.
"""

DOMAINS = ('institutions','people','families','family-links','classes','venues',
           'enrolments','sessions','attendance','practice','homework','submissions',
           'events','rsvps','registrations','notifications','audit','counters')
WRITE_DOMAINS = ('practice','homework','submissions','rsvps','audit',
                 'people','counters','registrations','family-links')


def build_policy(account, region='us-east-1', pool='us-east-1_nyQjIQasG',
                 bucket='sadhana-dev-homework-media-627821644317-us-east-1'):
    if account != '627821644317' or region != 'us-east-1' or pool != 'us-east-1_nyQjIQasG':
        raise ValueError('Isolated M9 policy is pinned to the approved AWS account, region and Cognito pool')
    prefix = f'arn:aws:dynamodb:{region}:{account}:table/sadhana-dev-m9-'
    return {'Version':'2012-10-17','Statement':[
      {'Sid':'M9ReadOnlyTables','Effect':'Allow',
       'Action':['dynamodb:DescribeTable','dynamodb:GetItem','dynamodb:BatchGetItem','dynamodb:Query','dynamodb:Scan','dynamodb:ConditionCheckItem'],
       'Resource':[prefix+'*']},
      {'Sid':'M9IndexReads','Effect':'Allow','Action':['dynamodb:Query'],
       'Resource':[prefix+'people/index/CognitoIdentityIndex',prefix+'registrations/index/InstitutionRegistrationsIndex']},
      {'Sid':'M9VerifiedIdentityLookup','Effect':'Allow','Action':['cognito-idp:ListUsers'],
       'Resource':f'arn:aws:cognito-idp:{region}:{account}:userpool/{pool}'},
      {'Sid':'M9DisposableWorkflowWrites','Effect':'Allow','Action':['dynamodb:PutItem','dynamodb:UpdateItem'],
       'Resource':[prefix+x for x in ('practice','homework','submissions','rsvps','audit')]},
      {'Sid':'M9GuardianIdentityWorkflowWrites','Effect':'Allow','Action':['dynamodb:PutItem','dynamodb:UpdateItem'],
       'Resource':[prefix+x for x in ('people','counters','registrations','family-links')]},
      {'Sid':'M9PrivateHomeworkMedia','Effect':'Allow','Action':['s3:GetObject','s3:PutObject'],
       'Resource':f'arn:aws:s3:::{bucket}/*'},
      {'Sid':'M9HomeworkMediaBucket','Effect':'Allow','Action':['s3:ListBucket'],
       'Resource':f'arn:aws:s3:::{bucket}'}]}


def policy_diff(actual, expected):
    """Strict drift assessment, including unexpected grants (not just missing SIDs)."""
    def flattened(p):
        statements=p.get('Statement',[])
        if isinstance(statements,dict): statements=[statements]
        return {(s.get('Sid'),s.get('Effect'),tuple(sorted(s.get('Action',[]) if isinstance(s.get('Action'),list) else [s.get('Action')])),
                 tuple(sorted(s.get('Resource',[]) if isinstance(s.get('Resource'),list) else [s.get('Resource')]))) for s in statements}
    wanted,found=flattened(expected),flattened(actual)
    return {'matches':wanted==found,'missingStatementCount':len(wanted-found),
            'unexpectedStatementCount':len(found-wanted),
            'expectedSids':sorted(s['Sid'] for s in expected['Statement']),
            'actualSids':sorted(s.get('Sid','') for s in actual.get('Statement',[]))}
