"""
Check whether a specific auth user id exists in `employees` and whether any `shifts`
are assigned to that `officer_id`.

Usage:
  python backend/check_shift_for_user.py <user_uuid>

If no user_uuid is provided, the script exits.
"""

import os
import re
import sys

from supabase import create_client


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
    if len(sys.argv) < 2:
        print("Usage: python backend/check_shift_for_user.py <user_uuid>")
        sys.exit(1)

    user_uuid = sys.argv[1].strip()
    sb = get_supabase_client()

    emp = sb.table("employees").select("id,emp_id,email,first_name,last_name").eq("id", user_uuid).maybe_single().execute()
    if emp.data:
        print("Employee found:", emp.data)
    else:
        print("No employee row with id=", user_uuid)

    shifts_resp = sb.table("shifts").select("shift_id,officer_id,shift_date,shift_start,location").eq("officer_id", user_uuid).limit(1000).execute()
    shifts = shifts_resp.data or []
    print(f"Shifts assigned to {user_uuid}: {len(shifts)}")
    for s in shifts[:20]:
        print(s)


if __name__ == "__main__":
    main()
