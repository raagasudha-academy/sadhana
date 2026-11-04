#!/usr/bin/env python3
"""Read-only source-level release blockers; never reads credentials or AWS secrets."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
imp=(ROOT/'src/m95WebsiteImport.ts').read_text()
media=(ROOT/'src/m9MediaPolicy.mjs').read_text()
runbook=(ROOT/'docs/database/M9_FINAL_RELEASE_RUNBOOK.md').read_text()
checks={
 'srutiImportExplicitlyBlocked':"if(inst!=='raaga')throw fail(409,'Sruti website import requires a separately verified intake integration.')" in imp,
 'srutiWebsiteSyncRestricted':"if(inst!=='raaga'||!/^RS-" in imp,
 'mediaPolicyImageLimit5MB':"max:5_000_000" in media,
 'mediaPolicyAudioLimit20MB':"max:20_000_000" in media,
 'mediaPolicyVideoLimit100MB':"max:100_000_000" in media,
 'rollbackRehearsalRequired':'rollbackRehearsal' in runbook,
 'cognitoInvitationsRequired':'cognitoInvitationsOnM9' in runbook,
}
# Missing tests are not falsely marked as successful by this source audit.
report={'readOnly':True,'sourceChecks':checks,'knownBlockers':[
 {'id':'srutiWebsiteE2E','reason':'Sruti intake adapter is explicitly disabled in M9 importer; needs verified Sruti website API contract and dedicated mappings.'} if checks['srutiImportExplicitlyBlocked'] else None,
 {'id':'mediaBoundaryE2E','reason':'MP3/M4A/MP4 and attachment-combination live acceptance remains outstanding.'},
 {'id':'cognitoInvitationsOnM9','reason':'Invitation, resend, recovery, revocation scenarios need isolated deployed evidence.'},
 {'id':'crossAcademyNegativeAuth','reason':'Extended cross-academy matrix has not yet passed.'},
 {'id':'rollbackRehearsal','reason':'Isolated rollback and M9-write reconciliation have not yet been rehearsed.'}
 ],'productionCutoverReady':False}
report['knownBlockers']=[b for b in report['knownBlockers'] if b]
print(json.dumps(report,indent=2))
