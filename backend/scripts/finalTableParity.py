#!/usr/bin/env python3
"""Read-only revalidation of the 18 staged Sadhana entity tables against live sources.
No AWS writes. Use just the AWS CLI. Sensitive record contents are never printed.
Does NOT certify an application cutover or IAM/legacy-path readiness.
"""
import hashlib
import json
import subprocess
import sys

REGION = "us-east-1"
EXPECTED_ACCOUNT = "627821644317"
STAGE = "dev"
ENTITIES = (
    "institutions", "people", "families", "family-links", "classes", "venues",
    "enrolments", "sessions", "attendance", "practice", "homework", "submissions",
    "events", "rsvps", "registrations", "notifications", "audit", "counters",
)


def aws(*args):
    call = ["aws", *args, "--region", REGION, "--output", "json", "--no-cli-pager"]
    return json.loads(subprocess.check_output(call, text=True))


def scan(name):
    items, cursor = [], None
    while True:
        args = ["dynamodb", "scan", "--table-name", name, "--consistent-read", "--no-paginate"]
        if cursor:
            args += ["--exclusive-start-key", json.dumps(cursor)]
        page = aws(*args)
        items.extend(page.get("Items", []))
        cursor = page.get("LastEvaluatedKey")
        if not cursor:
            return items


def normalized(value):
    if isinstance(value, dict):
        if len(value) == 1 and next(iter(value)) in {"SS", "NS", "BS"}:
            k = next(iter(value))
            return {k: sorted(value[k])}
        return {k: normalized(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalized(v) for v in value]
    return value


def key_schema(table):
    output = {k: table.get(k) for k in ("KeySchema", "AttributeDefinitions")}
    for k in ("GlobalSecondaryIndexes", "LocalSecondaryIndexes"):
        output[k] = sorted(
            [{field: item[field] for field in ("IndexName", "KeySchema", "Projection")}
             for item in table.get(k, [])], key=lambda x: x["IndexName"]
        )
    return normalized(output)


def properties(name):
    desc = aws("dynamodb", "describe-table", "--table-name", name)["Table"]
    backup = aws("dynamodb", "describe-continuous-backups", "--table-name", name)
    pitr = backup["ContinuousBackupsDescription"].get("PointInTimeRecoveryDescription", {}).get("PointInTimeRecoveryStatus")
    return desc, pitr


def restore_origin_status(source_desc, target_desc):
    """RestoreSummary.SourceTableArn is optional. Never confuse absent metadata with a conflict."""
    source_arn = source_desc["TableArn"]
    origin = target_desc.get("RestoreSummary", {}).get("SourceTableArn")
    if not origin:
        return "UNAVAILABLE"
    if origin == source_arn:
        return "MATCH"
    return "MISMATCH"


def compare_flat(src, dst):
    left = sorted(json.dumps(normalized(r), sort_keys=True) for r in scan(src))
    right = sorted(json.dumps(normalized(r), sort_keys=True) for r in scan(dst))
    return len(left), len(right), left == right


def legacy_key(row):
    return (row.get("PK", {}).get("S", ""), row.get("SK", {}).get("S", ""))


def expected_audit_records():
    main = {legacy_key(r): r for r in scan(f"sadhana-{STAGE}-main") if legacy_key(r)[0].startswith("AUDIT")}
    legacy = {legacy_key(r): r for r in scan(f"sadhana-{STAGE}-audit") if legacy_key(r)[0].startswith("AUDIT")}
    if any(normalized(main[k]) != normalized(legacy[k]) for k in main.keys() & legacy.keys()):
        raise RuntimeError("Legacy audit sources disagree; manual review required")
    merged = dict(main)
    merged.update(legacy)
    expected = {r["auditId"]["S"]: r for r in scan(f"sadhana-{STAGE}-m9-audit")}
    if any(not item.get("institutionId", {}).get("S") for item in expected.values()):
        raise RuntimeError("M9 audit record missing institution classification")
    for (pk, sk), row in merged.items():
        digest = hashlib.sha256(json.dumps([pk, sk], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        audit_id = "legacy-" + digest
        if audit_id in expected:
            raise RuntimeError("Audit ID collision")
        origins = sorted(
            name for name, records in ((f"sadhana-{STAGE}-main", main), (f"sadhana-{STAGE}-audit", legacy))
            if (pk, sk) in records
        )
        namespace = pk.split("#", 1)
        if len(namespace) != 2 or namespace[0] != "AUDIT" or namespace[1] not in {"raaga", "sruti", "shared"}:
            raise RuntimeError("Unrecognized legacy audit institution; manual review required")
        expected[audit_id] = {
            "auditId": {"S": audit_id},
            "timestamp": row["at"],
            "action": {"S": row.get("action", {}).get("S") or "LEGACY_EVENT"},
            "recordSource": {"S": "legacy"},
            "legacySourceTables": {"SS": origins},
            "legacyPayload": {"M": row},
            "institutionId": {"S": namespace[1]},
        }
    return expected


def verify_audit(target):
    expected = expected_audit_records()
    actual = {r["auditId"]["S"]: r for r in scan(target)}
    equal = expected.keys() == actual.keys() and all(normalized(v) == normalized(actual[k]) for k, v in expected.items())
    return len(expected), len(actual), equal


def verify_audit_institution_index(target):
    """Verify the new audit institution GSI includes all migrated classified rows.

    This is a second check beyond table content parity. GSIs are eventually
    consistent; a transient failure needs rechecking, not a forced repair.
    """
    expected = {}
    for item in scan(target):
        inst = item.get("institutionId", {}).get("S")
        audit_id = item.get("auditId", {}).get("S")
        if inst not in {"raaga", "sruti", "shared"} or not audit_id:
            return False
        expected.setdefault(inst, set()).add(audit_id)
    for inst in ("raaga", "sruti", "shared"):
        found = []
        cursor = None
        while True:
            args = [
                "dynamodb", "query", "--table-name", target,
                "--index-name", "InstitutionAuditIndex",
                "--key-condition-expression", "#institution = :institution",
                "--expression-attribute-names", json.dumps({"#institution": "institutionId"}),
                "--expression-attribute-values", json.dumps({":institution": {"S": inst}}),
                "--projection-expression", "auditId",
                "--no-paginate",
            ]
            if cursor:
                args += ["--exclusive-start-key", json.dumps(cursor)]
            page = aws(*args)
            found.extend(r.get("auditId", {}).get("S") for r in page.get("Items", []))
            cursor = page.get("LastEvaluatedKey")
            if not cursor:
                break
        if len(found) != len(set(found)) or set(found) != expected.get(inst, set()):
            return False
    return True


def main():
    account = aws("sts", "get-caller-identity")["Account"]
    if account != EXPECTED_ACCOUNT:
        raise RuntimeError("Unexpected AWS account; refusing to scan")
    print("READ-ONLY Sadhana final-table parity; account confirmed")
    print("TABLE | SOURCE | TARGET | SCHEMA | CONTENT | PROTECTED")
    failed = []
    missing_provenance = []
    audit_index_ok = None
    for entity in ENTITIES:
        src = f"sadhana-{STAGE}-m9-{entity}"
        dst = f"sadhana-{STAGE}-{'audit-records' if entity == 'audit' else entity}"
        source_desc, _ = properties(src)
        target_desc, pitr = properties(dst)
        origin_status = restore_origin_status(source_desc, target_desc)
        schema_ok = key_schema(source_desc) == key_schema(target_desc)
        if entity == "audit":
            count_s, count_t, data_ok = verify_audit(dst)
        else:
            count_s, count_t, data_ok = compare_flat(src, dst)
        protected = target_desc.get("DeletionProtectionEnabled") is True and pitr == "ENABLED" and target_desc["TableStatus"] == "ACTIVE"
        if entity == "audit" and data_ok:
            audit_index_ok = verify_audit_institution_index(dst)
        good = all((schema_ok, data_ok, protected)) and origin_status != "MISMATCH" and (entity != "audit" or audit_index_ok is True)
        print(f"{entity} | {count_s} | {count_t} | {'OK' if schema_ok else 'FAIL'} | {'OK' if data_ok else 'DIFF'} | {'OK' if protected else 'FAIL'} | ORIGIN {origin_status}")
        if origin_status == "UNAVAILABLE":
            missing_provenance.append(entity)
        if not good:
            failed.append(entity)
            if origin_status == "MISMATCH":
                print("  BLOCKER: reported restore origin differs from expected source")
    print(f"AUDIT INSTITUTION INDEX: {'PASS' if audit_index_ok is True else 'REVIEW REQUIRED' if audit_index_ok is False else 'NOT TESTED'} (GSI is eventually consistent)")
    print(f"RESULT: {'PASS' if not failed else 'REVIEW REQUIRED'}; {len(ENTITIES)-len(failed)}/{len(ENTITIES)} tables passed schema/content/protection, audit GSI and available-origin checks")
    print(f"Restore-origin metadata unavailable: {len(missing_provenance)}/{len(ENTITIES)} (not a content mismatch; provenance not independently proven)")
    print("No writes or deployment changes. Legacy app routing is NOT certified by this scan.")
    return 2 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.CalledProcessError, KeyError, ValueError) as exc:
        print(f"STOP: Verification incomplete ({type(exc).__name__}). No writes made.", file=sys.stderr)
        sys.exit(2)
