#!/usr/bin/env python3
"""Static, read-only inventory of frontend API request contracts and final route flags."""
import argparse, json, re, pathlib, sys
p=argparse.ArgumentParser();p.add_argument('--root', default='.');p.add_argument('--out',default=''); a=p.parse_args()
root=pathlib.Path(a.root).resolve(); client=root/'src/api/sadhanaClient.ts'; final=root/'backend/src'
if not client.is_file(): sys.exit('Missing src/api/sadhanaClient.ts')
text=client.read_text()
# Client calls are single-line method declarations; extract a verb and first path argument.
records=[]
for num,line in enumerate(text.splitlines(),1):
    m=re.search(r"\brequest(?:<.*>)?\(['\"](GET|POST|PATCH|PUT|DELETE)['\"],\s*([`'\"])",line)
    if not m: continue
    verb,quote=m.group(1),m.group(2);start=m.end(); end=line.find(quote,start)
    if end<0: continue
    path=line[start:end]
    # render dynamic path placeholders for reports; never execute arbitrary template code
    path=re.sub(r'\$\{[^}]+\}',':id',path)
    records.append({'line':num,'method':verb,'path':path,'dynamic': ':id' in path or 'resource' in line[start:end+1]})
files=[f for f in final.glob('final*') if f.suffix in ('.mjs','.ts')]
flags={}
for f in files:
    content=f.read_text(errors='replace')
    for flag in re.findall(r'SADHANA_FINAL_[A-Z0-9_]+',content): flags.setdefault(flag,[]).append(f.name)
flags={k:sorted(set(v)) for k,v in flags.items()}
# Deliberately do not claim static path matching proves runtime correctness.
report={'schema':1,'kind':'READ_ONLY_STATIC_CENSUS','frontend_client':str(client.relative_to(root)),'operations_count':len(records),'operations':records,'final_feature_flags':flags,'status':'UNVERIFIED','notes':['Static extraction does not prove a route works or is enabled.','Routes built in other components or with direct fetch may require separate review.','Do not use this output alone as a deletion authorisation.']}
output=json.dumps(report,indent=2)
if a.out:pathlib.Path(a.out).write_text(output+'\n')
print('Frontend API client operations:',len(records));print('Final feature gates:',len(flags))
for r in records: print(f"{r['method']:6} {r['path']:58} client:{r['line']}")
print('RESULT: STATIC CENSUS ONLY — NO DELETION APPROVED')
