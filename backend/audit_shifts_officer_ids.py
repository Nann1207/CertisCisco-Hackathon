"""
Audit script: finds shift rows where `officer_id` does not match any `employees.id`.

This is read-only by default and will only print candidate mappings. It will prefer
environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when present.
If those are not set, it will attempt to extract the URL and key from
`backend/dataentry.py` or `backend/dataentry_shifts.py` (which are present in this
repo for convenience in local testing).

Run locally with your environment configured, for example:

  python backend/audit_shifts_officer_ids.py

The script will not modify the database.
"""

import json
import os
import re
import sys
from typing import Dict, List

try:
    from supabase import create_client
except Exception as e:
    print("Missing Python dependency 'supabase'. Install with: pip install supabase", file=sys.stderr)
    raise


def extract_keys_from_file(path: str):
    try:
        text = open(path, "r", encoding="utf-8").read()
    except Exception:
        return None, None

    url_match = re.search(r"url\s*=\s*[\"'](https?://[\w\-\.:%/]+)[\"']", text)
    key_match = re.search(r"key\s*=\s*[\"']([A-Za-z0-9\-_=\.]+)[\"']", text)
    url = url_match.group(1) if url_match else None
    key = key_match.group(1) if key_match else None
    return url, key


def get_supabase_client():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("REACT_APP_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        # try repo files (read-only pattern parsing)
        for p in ("backend/dataentry.py", "backend/dataentry_shifts.py"):
            u, k = extract_keys_from_file(p)
            if u and k:
                url = url or u
                key = key or k
    if not url or not key:
        print("Could not determine SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.", file=sys.stderr)
        print("Set environment variables or ensure backend/dataentry.py contains URL and key.")
        sys.exit(2)

    print("Connecting to Supabase:", url)
    return create_client(url, key)


def main():
    sb = get_supabase_client()

    print("Fetching employees...")
    emp_resp = sb.table("employees").select("id,emp_id,email,first_name,last_name").limit(10000).execute()
    employees = emp_resp.data or []

    by_id: Dict[str, Dict] = {str(e.get("id")): e for e in employees if e.get("id")}
    by_empid: Dict[str, Dict] = {str(e.get("emp_id")): e for e in employees if e.get("emp_id")}
    by_email: Dict[str, Dict] = {str((e.get("email") or "").lower()): e for e in employees if e.get("email")}

    print(f"Loaded {len(employees)} employees (ids: {len(by_id)})")

    print("Fetching shifts (first 2000)...")
    shift_resp = sb.table("shifts").select(
        "shift_id,officer_id,shift_date,shift_start,shift_end,location,address,created_at"
    ).limit(2000).execute()
    shifts = shift_resp.data or []

    print(f"Loaded {len(shifts)} shifts")

    mismatches = []
    for s in shifts:
        officer = s.get("officer_id")
        if officer is None:
            mismatches.append((s, "NULL officer_id"))
            continue
        officer_str = str(officer).strip()
        if officer_str in by_id:
            continue

        # not matched directly: try by emp_id
        candidate = by_empid.get(officer_str) or by_email.get(officer_str.lower())
        if candidate:
            mismatches.append((s, "candidate_by_empid_or_email", candidate))
        else:
            mismatches.append((s, "no_match"))

    if not mismatches:
        print("All shifts have officer_id values matching employees.id. No action required.")
        return

    print("\nMismatched shifts (examples):")
    for item in mismatches[:50]:
        if len(item) == 2:
            s, reason = item
            print(json.dumps({"shift": s, "reason": reason}, default=str))
        else:
            s, reason, candidate = item
            print(json.dumps({"shift": s, "reason": reason, "candidate": candidate}, default=str))

    print(f"\nTotal mismatched shifts: {len(mismatches)}")
    print("\nIf you want to propose updates, I can generate SQL UPDATE statements or a script to map emp_id->id where it's a clear 1:1 match.")


if __name__ == "__main__":
    main()
