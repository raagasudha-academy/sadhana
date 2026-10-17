#!/usr/bin/env python3
"""Read-only Git/repository audit. Never prints secret file contents."""
from pathlib import Path
import subprocess, re
root=Path.cwd()
def git(*args):
 p=subprocess.run(['git',*args],cwd=root,text=True,capture_output=True)
 return p.stdout.splitlines() if p.returncode==0 else []
tracked=git('ls-files')
ignored=git('status','--short','--ignored')
backup=re.compile(r'(^|/)(\.local-patch-backups|\.sadhana-v[^/]*-backup[^/]*)(/|$)|\.(bak|backup|orig|rej|old)$|\.before-|\.pre-tidy\.bak|\.pre-v\d+\.bak',re.I)
sensitive=re.compile(r'(^|/)(\.env(\.|$)|\.aws/|id_rsa|credentials($|/))|\.(pem|p12|pfx|key)$',re.I)
data=re.compile(r'(registration-reset|sadhana-inventory|migration|cutover|import-data|calendar-before|calendar-after|audit)',re.I)
logs=re.compile(r'\.log$|(^|/)file_structure\.txt$',re.I)
print('Repository:',root)
print('Branch:', ' '.join(git('branch','--show-current')))
print('Tracked files:',len(tracked))
for title,pred in [('Tracked secrets/credential filenames (BLOCK PUSH)',lambda f:sensitive.search(f)),('Tracked backup files (review/removal)',lambda f:backup.search(f)),('Tracked migration/export/audit data (manual privacy review)',lambda f:data.search(f)),('Tracked log/inventory files (review)',lambda f:logs.search(f))]:
 matches=[f for f in tracked if pred(f)]
 print('\n'+title+':',len(matches))
 for f in matches[:100]:print('  ',f)
print('\nUntracked backup candidates:')
for p in sorted(root.rglob('*')):
 if not p.is_file():continue
 try: rel=p.relative_to(root)
 except ValueError:continue
 if set(rel.parts)&{'.git','node_modules','dist','.aws-sam','coverage','test-results','playwright-report'}:continue
 name=rel.as_posix()
 if backup.search(name) and name not in tracked:print('  ',name)
print('\nDiagnostic logging references in tests (inspect and remove only temporary instrumentation):')
tests=root/'tests'
if tests.exists():
 for p in tests.rglob('*'):
  if p.suffix not in ('.ts','.tsx','.js','.jsx'):continue
  for i,line in enumerate(p.read_text(errors='replace').splitlines(),1):
   if re.search(r'ARCHIVE RELOAD DIAGNOSTICS|console\.(log|debug)|page\.pause\(',line):print(f'  {p.relative_to(root)}:{i}: {line.strip()[:110]}')
print('\nRead-only audit complete. No files modified. Review Git history for historical secrets separately.')
