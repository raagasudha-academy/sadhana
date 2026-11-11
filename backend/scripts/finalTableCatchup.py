#!/usr/bin/env python3
"""Controlled, forward-only synchronization from M9 to the 18 canonical tables.

DRY RUN BY DEFAULT. No deletes. An explicit, externally enforced write freeze is
required for --apply: both main API and the independent Sruti public intake must
have stopped accepting writes BEFORE this program starts. The program does NOT
freeze either writer. Unexpected target-only keys abort, as do schema/protection
mismatches. A changed destination item is replaced only if its entire observed
attribute set still matches (DynamoDB conditional compare-and-swap).

One-time tool for migration, not a background replicator or routine sync service.
"""
import argparse
import json
import subprocess
import sys
from collections import Counter

import finalTableParity as p

CONFIRM_TEXT = "ALL_SADHANA_AND_SRUTI_WRITES_FROZEN"


def primary_key(schema):
    keys = schema.get("KeySchema", [])
    if len(keys) != 1 or keys[0]["KeyType"] != "HASH":
        raise RuntimeError("STOP: entity schema has an unexpected primary key")
    return keys[0]["AttributeName"]


def index_records(rows, key):
    indexed = {}
    for row in rows:
        value = row.get(key, {}).get("S")
        if not value or value in indexed:
            raise RuntimeError("STOP: missing or duplicate primary key in DynamoDB scan")
        indexed[value] = row
    return indexed


def classify(expected, existing):
    missing, changed, extra = [], [], []
    for key, item in expected.items():
        if key not in existing:
            missing.append(key)
        elif p.normalized(item) != p.normalized(existing[key]):
            changed.append(key)
    for key in existing:
        if key not in expected:
            extra.append(key)
    return missing, changed, extra


def write_condition(primary, item_before, item_after):
    """CAS guards every old attribute, and absence of newly introduced fields.

    A removed field is automatically guarded through the old item expression.
    Refuse overly long conditions rather than silently falling back to a blind put.
    """
    attrs = sorted(set(item_before) | set(item_after))
    names, values, terms = {}, {}, []
    for i, field in enumerate(attrs):
        alias = f"#f{i}"
        names[alias] = field
        if field in item_before:
            token = f":o{i}"
            values[token] = item_before[field]
            terms.append(f"{alias} = {token}")
        else:
            terms.append(f"attribute_not_exists({alias})")
    expr = " AND ".join(terms)
    if not expr or len(expr.encode("utf8")) > 3800:
        raise RuntimeError("STOP: record too complex for safe conditional update")
    if primary not in item_before or primary not in item_after:
        raise RuntimeError("STOP: record key absent")
    if item_before[primary] != item_after[primary]:
        raise RuntimeError("STOP: record identity altered")
    return expr, names, values


def preflight(entity):
    src = f"sadhana-{p.STAGE}-m9-{entity}"
    dst = f"sadhana-{p.STAGE}-{'audit-records' if entity == 'audit' else entity}"
    source, source_pitr = p.properties(src)
    target, target_pitr = p.properties(dst)
    if source["TableStatus"] != "ACTIVE" or target["TableStatus"] != "ACTIVE":
        raise RuntimeError(f"STOP: {entity}: source/target not ACTIVE")
    if not source.get("DeletionProtectionEnabled") or source_pitr != "ENABLED":
        raise RuntimeError(f"STOP: {entity}: source protection missing")
    if not target.get("DeletionProtectionEnabled") or target_pitr != "ENABLED":
        raise RuntimeError(f"STOP: {entity}: target protection missing")
    if p.key_schema(source) != p.key_schema(target):
        raise RuntimeError(f"STOP: {entity}: source and target key/index schemas differ")
    if p.restore_origin_status(source, target) == "MISMATCH":
        raise RuntimeError(f"STOP: {entity}: reported restore origin does not match")
    key = primary_key(source)
    return src, dst, key


def snapshot(entity, src, dst, key):
    if entity == "audit":
        expected = p.expected_audit_records()  # 204 legacy + M9, including classification.
    else:
        expected = index_records(p.scan(src), key)
    existing = index_records(p.scan(dst), key)
    return expected, existing


def put_missing(dst, key, item):
    p.aws("dynamodb", "put-item", "--table-name", dst,
          "--item", json.dumps(item),
          "--condition-expression", "attribute_not_exists(#k)",
          "--expression-attribute-names", json.dumps({"#k": key}))


def put_changed(dst, key, before, after):
    condition, names, values = write_condition(key, before, after)
    p.aws("dynamodb", "put-item", "--table-name", dst,
          "--item", json.dumps(after),
          "--condition-expression", condition,
          "--expression-attribute-names", json.dumps(names),
          "--expression-attribute-values", json.dumps(values))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write catch-up changes; requires explicit write freeze")
    parser.add_argument("--audit-only", action="store_true", help="Insert missing audit records only; refuse any other-table drift or changed audit item")
    parser.add_argument("--confirm-write-freeze", default="", help="Exact confirmation of externally enforced API and public-intake write freeze")
    args = parser.parse_args(argv)
    if args.apply and args.confirm_write_freeze != CONFIRM_TEXT:
        raise RuntimeError("STOP: --apply requires --confirm-write-freeze " + CONFIRM_TEXT)
    account = p.aws("sts", "get-caller-identity")["Account"]
    if account != p.EXPECTED_ACCOUNT:
        raise RuntimeError("STOP: unexpected AWS account")
    print(f"Sadhana database catch-up | {'APPLY' if args.apply else 'READ-ONLY'} | account verified", flush=True)

    # Preflight ALL tables before attempting the first write.
    info = {e: preflight(e) for e in p.ENTITIES}
    plan = {}
    total = Counter()
    for entity in p.ENTITIES:
        src, dst, key = info[entity]
        expected, actual = snapshot(entity, src, dst, key)
        missing, changed, extra = classify(expected, actual)
        if extra:
            raise RuntimeError(f"STOP: {entity}: {len(extra)} target-only items; never delete automatically")
        # Pre-validate any CAS expressions before writing any other table.
        for identity in changed:
            write_condition(key, actual[identity], expected[identity])
        plan[entity] = missing, changed
        total["missing"] += len(missing)
        total["changed"] += len(changed)
        print(f"{entity}: source={len(expected)} target={len(actual)} missing={len(missing)} changed={len(changed)}", flush=True)

    print(f"TOTAL: missing={total['missing']} changed={total['changed']} across {len(info)} tables", flush=True)
    if args.audit_only:
        other_drift = [entity for entity in p.ENTITIES if entity != "audit" and any(plan[entity])]
        if other_drift:
            raise RuntimeError("STOP: --audit-only requires parity for the other 17 tables: " + ", ".join(other_drift))
        if plan["audit"][1]:
            raise RuntimeError("STOP: --audit-only cannot replace changed audit records")
        print(f"AUDIT-ONLY: eligible missing audit items={len(plan['audit'][0])}; other 17 tables clean", flush=True)
    if not args.apply:
        print("DRY RUN ONLY. No AWS records changed.")
        if sum(total.values()):
            print("A writer freeze and deliberate catch-up are needed before final routing.")
        return 0

    # Scan again immediately before each write; fails if a target-only record
    # appears after the first preflight. This isn't a replacement for a write freeze.
    for entity in ("audit",) if args.audit_only else p.ENTITIES:
        src, dst, key = info[entity]
        expected, actual = snapshot(entity, src, dst, key)
        missing, changed, extra = classify(expected, actual)
        if extra:
            raise RuntimeError(f"STOP: {entity}: target-only records detected during apply")
        if args.audit_only and changed:
            raise RuntimeError("STOP: audit-only reconciliation cannot replace changed records")
        for identity in missing:
            put_missing(dst, key, expected[identity])
        for identity in changed:
            put_changed(dst, key, actual[identity], expected[identity])
        print(f"{entity}: applied missing={len(missing)}, changed={len(changed)}", flush=True)

    # Final full parity check in the same process; callers must NOT infer that
    # writes stayed frozen merely because this check passed.
    failed = []
    for entity in p.ENTITIES:
        src, dst, key = info[entity]
        expected, actual = snapshot(entity, src, dst, key)
        m, c, x = classify(expected, actual)
        if m or c or x:
            failed.append(entity)
    if failed:
        raise RuntimeError("STOP: post-apply parity mismatch: " + ", ".join(failed))
    print("RESULT: DATA PASS 18/18; source tables untouched; no deletes performed.")
    print("WARNING: this does not verify the API cutover or prove the external write freeze.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.CalledProcessError, KeyError, ValueError) as exc:
        print(f"ERROR: {type(exc).__name__}: {str(exc) if isinstance(exc, RuntimeError) else 'Preflight or AWS command failure'}", file=sys.stderr)
        sys.exit(2)
