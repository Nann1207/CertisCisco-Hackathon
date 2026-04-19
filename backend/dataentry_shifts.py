

from supabase import create_client
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import uuid

url = "https://wfsrbpckgdzfuagkycjq.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmc3JicGNrZ2R6ZnVhZ2t5Y2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIzMzU5MiwiZXhwIjoyMDkxODA5NTkyfQ.driQQ7UUOM-u5M1tTK3StlGvlVsR6LaSpS2GsyvE99M"


supabase = create_client(url, key)

SGT = ZoneInfo("Asia/Singapore")


def to_utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

def create_test_shifts():
    base_date = datetime(2026, 4, 16, tzinfo=SGT)
    shifts = []
    # Find the intended officer id from the employees table instead of hard-coding a UUID.
    # Prefer lookup by email (developer's account), then by emp_id, then fall back to first Security Officer.
    target_email = "vaniakwee@gmail.com"
    target_emp_id = "EMP006"

    officer_id = None
    try:
        resp = supabase.table("employees").select("id,emp_id,email,role").eq("email", target_email).limit(1).execute()
        rows = resp.data or []
        if rows:
            officer_id = rows[0].get("id")
    except Exception:
        officer_id = None

    if not officer_id:
        try:
            resp = supabase.table("employees").select("id,emp_id,email,role").eq("emp_id", target_emp_id).limit(1).execute()
            rows = resp.data or []
            if rows:
                officer_id = rows[0].get("id")
        except Exception:
            officer_id = None

    if not officer_id:
        try:
            resp = supabase.table("employees").select("id,emp_id,email,role").eq("role", "Security Officer").limit(1).execute()
            rows = resp.data or []
            if rows:
                officer_id = rows[0].get("id")
        except Exception:
            officer_id = None

    if not officer_id:
        print("No suitable employee found to assign test shifts. Please run backend/dataentry.py first or adjust dataentry_shifts.py.")
        return

    # --- Day shifts for next 30 days ---
    for i in range(30):
        shift_date = base_date + timedelta(days=i)

        start = shift_date.replace(hour=9, minute=0, second=0)
        end = shift_date.replace(hour=19, minute=0, second=0)

        shifts.append({
            "shift_id": str(uuid.uuid4()),
            "officer_id": officer_id,
            "supervisor_id": "88be6b57-41d9-4e7e-baaf-10599603d024",
            "shift_date": shift_date.date().isoformat(),
            "shift_start": to_utc_iso(start),
            "shift_end": to_utc_iso(end),
            "location": "NEX Mall",
            "address": "Serangoon Central, 23, Singapore 556083",
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    # --- Night shifts for next 4 days ---
    for i in range(4):
        shift_date = base_date + timedelta(days=i)

        start = shift_date.replace(hour=20, minute=0, second=0)
        end = (shift_date + timedelta(days=1)).replace(hour=8, minute=0, second=0)

        shifts.append({
            "shift_id": str(uuid.uuid4()),
            "officer_id": officer_id,
            "supervisor_id": "88be6b57-41d9-4e7e-baaf-10599603d024",
            "shift_date": shift_date.date().isoformat(),
            "shift_start": to_utc_iso(start),
            "shift_end": to_utc_iso(end),
            "location": "NEX Mall",
            "address": "Serangoon Central, 23, Singapore 556083",
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    response = supabase.table("shifts").insert(shifts).execute()
    print(response)

create_test_shifts()

