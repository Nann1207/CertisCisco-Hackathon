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

def shift_exists(officer_id: str, shift_date_iso: str, shift_start_iso: str, shift_end_iso: str) -> bool:
    try:
        resp = (
            supabase.table("shifts")
            .select("shift_id")
            .eq("officer_id", officer_id)
            .eq("shift_date", shift_date_iso)
            .eq("shift_start", shift_start_iso)
            .eq("shift_end", shift_end_iso)
            .limit(1)
            .execute()
        )
        return bool(resp.data)
    except Exception:
        return False

def build_shift_payload(
    officer_id: str,
    supervisor_id: str,
    shift_date: datetime,
    start: datetime,
    end: datetime,
) -> dict:
    return {
        "shift_id": str(uuid.uuid4()),
        "officer_id": officer_id,
        "supervisor_id": supervisor_id,
        "shift_date": shift_date.date().isoformat(),
        "shift_start": to_utc_iso(start),
        "shift_end": to_utc_iso(end),
        "location": "NEX Mall",
        "address": "Serangoon Central, 23, Singapore 556083",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

def insert_shifts_for_officers(officer_ids: list[str], supervisor_id: str) -> None:
    today_sgt = datetime.now(SGT).date()
    shift_date = datetime.combine(today_sgt, datetime.min.time(), tzinfo=SGT)

    day_start = shift_date.replace(hour=20, minute=20, second=0)
    day_end   = shift_date.replace(hour=20, minute=40, second=0)
    night_start = shift_date.replace(hour=20, minute=0, second=0)
    night_end   = (shift_date + timedelta(days=1)).replace(hour=8, minute=0, second=0)

    day_start_iso   = to_utc_iso(day_start)
    day_end_iso     = to_utc_iso(day_end)
    night_start_iso = to_utc_iso(night_start)
    night_end_iso   = to_utc_iso(night_end)
    shift_date_iso  = shift_date.date().isoformat()

    pending = []
    for officer_id in officer_ids:
        if not shift_exists(officer_id, shift_date_iso, day_start_iso, day_end_iso):
            pending.append(build_shift_payload(officer_id, supervisor_id, shift_date, day_start, day_end))
        if not shift_exists(officer_id, shift_date_iso, night_start_iso, night_end_iso):
            pending.append(build_shift_payload(officer_id, supervisor_id, shift_date, night_start, night_end))

    if not pending:
        print("No new shifts to insert.")
        return

    response = supabase.table("shifts").insert(pending).execute()
    print(response)

def create_officer_shifts() -> None:
    officer_ids = [
        "ac414e11-74c6-4a0e-96ec-6e03ebee5216",
    ]
    supervisor_id = "e88d6727-ceb6-4f8d-ad88-1108bcfbdc6f"
    insert_shifts_for_officers(officer_ids, supervisor_id)

create_officer_shifts()