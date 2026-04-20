"""
Report how many shifts reference each `supervisor_id` and map to employee names when possible.

Run with:
  python backend/report_shifts_by_supervisor.py
"""

import os
import sys
from collections import Counter

from supabase import create_client


def extract_keys_from_file(path: str):
    try:
        text = open(path, "r", encoding="utf-8").read()
    except Exception:
        return None, None

    import re
    url_match = re.search(r"url\s*=\s*[\"'](https?://[\w\-\.:%/]+)[\"']", text)
    key_match = re.search(r"key\s*=\s*[\"']([A-Za-z0-9\-_=\.]+)[\"']", text)
    url = url_match.group(1) if url_match else None
    key = key_match.group(1) if key_match else None
    return url, key


def get_supabase_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        for p in ("backend/dataentry.py", "backend/dataentry_shifts.py"):
            u, k = extract_keys_from_file(p)
            if u and k:
                url = url or u
                key = key or k
    if not url or not key:
        print("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (env or backend/dataentry.py)")
        sys.exit(2)
    return create_client(url, key)


def main():
    sb = get_supabase_client()

    shifts_resp = sb.table("shifts").select("shift_id,supervisor_id,shift_date,location").limit(5000).execute()
    shifts = shifts_resp.data or []
    counts = Counter()
    for s in shifts:
        counts[str(s.get("supervisor_id") or "<NULL>")] += 1

    print(f"Total shifts: {len(shifts)}")
    top = counts.most_common()
    # load employees for mapping
    emp_resp = sb.table("employees").select("id,emp_id,first_name,last_name,email").limit(10000).execute()
    employees = emp_resp.data or []
    by_id = {str(e.get("id")): e for e in employees}

    for supervisor_id, cnt in top:
        name = "-"
        if supervisor_id in by_id:
            e = by_id[supervisor_id]
            name = f"{e.get('first_name') or ''} {e.get('last_name') or ''}".strip() or e.get('email') or e.get('emp_id')
        print(f"{cnt:4d}\t{supervisor_id}\t{name}")

    # quick check for known supervisor id from earlier conversation
    target = os.environ.get("SUPERVISOR_ID") or "e88d6727-ceb6-4f8d-ad88-1108bcfbdc6f"
    sample = [s for s in shifts if str(s.get("supervisor_id")) == str(target)]
    print("\nSample shifts for supervisor", target, ":", len(sample))
    for s in sample[:10]:
        print(" -", s.get("shift_id"), s.get("shift_date"), s.get("location"))


if __name__ == "__main__":
    main()
