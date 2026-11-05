#!/usr/bin/env python3
"""Safely quarantine migration files absent from the verified live ledger.

This never executes SQL and never changes Supabase. It moves files byte-for-byte
out of supabase/migrations so the official CLI cannot replay unverified history.
"""
import hashlib
import json
import pathlib
import shutil

root = pathlib.Path(".")
ledger = json.loads((root / "docs/cc-01-live-migration-ledger.json").read_text())
records = ledger.get("records", [])
canonical = {f"{r['version']}_{r['name']}.sql" for r in records}
staged = "20261105100000_cc01_property_access_and_founder_authority.sql"
active = root / "supabase/migrations"
candidates = root / "supabase/migration-history-candidates"
candidates.mkdir(parents=True, exist_ok=True)

moved = []
for source in sorted(active.glob("*.sql")):
    if source.name in canonical or source.name == staged:
        continue
    target = candidates / source.name
    if target.exists():
        if target.read_bytes() != source.read_bytes():
            raise SystemExit(f"Candidate collision with different SQL: {source.name}")
        source.unlink()
    else:
        shutil.move(str(source), str(target))
    moved.append(source.name)

entries = []
for path in sorted(candidates.glob("*.sql")):
    data = path.read_bytes()
    entries.append({
        "path": str(path),
        "git_blob_sha": hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest(),
        "size_bytes": len(data),
        "classification": "historical_candidate_not_in_verified_live_migration_path",
        "execution_policy": "preserve_only_do_not_replay_or_mark_applied_without_independent_verification"
    })

manifest = {
    "schema_version": "1.0",
    "audit_date": "2026-11-05",
    "production_project_ref": "hpsryyywolitgeaacpoy",
    "verified_live_ledger_entries": len(records),
    "staged_release_migration": staged,
    "moved_from_active_this_run": moved,
    "candidate_file_count": len(entries),
    "files": entries
}
(root / "docs/cc-01-local-migration-classification.json").write_text(
    json.dumps(manifest, indent=2) + "\n"
)
print(f"Preserved {len(moved)} non-ledger migrations; {len(entries)} total candidate files retained.")
