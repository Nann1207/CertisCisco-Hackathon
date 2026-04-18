

from supabase import create_client
from datetime import datetime, timedelta, timezone
import uuid

url = "https://wfsrbpckgdzfuagkycjq.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmc3JicGNrZ2R6ZnVhZ2t5Y2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIzMzU5MiwiZXhwIjoyMDkxODA5NTkyfQ.driQQ7UUOM-u5M1tTK3StlGvlVsR6LaSpS2GsyvE99M"


supabase = create_client(url, key)

UTC_PLUS_8 = timezone(timedelta(hours=8))


def to_utc_plus_8_iso(dt: datetime) -> str:
    return dt.astimezone(UTC_PLUS_8).isoformat()

def create_test_shifts():
    base_date = datetime(2026, 4, 16, tzinfo=UTC_PLUS_8)
    shifts = []
    officer_supervisor_pairs = [
        {
            "officer_id": "7fb7c754-a134-400d-bf34-3449e9f5e186",
            "supervisor_id": "a063c58f-c83c-4db9-854d-08833b9ec30b",
        },
        {
            "officer_id": "c2f799bb-b818-4a8a-ad5c-c6c0ea890407",
            "supervisor_id": "a09281c9-0ea9-4f21-827c-615470f20e68",
        },
        {
            "officer_id": "a842fbf5-0df4-47ed-b75a-f67edd46fc45",
            "supervisor_id": "e88d6727-ceb6-4f8d-ad88-1108bcfbdc6f",
        },
    ]

    for pair in officer_supervisor_pairs:
        officer_id = pair["officer_id"]
        supervisor_id = pair["supervisor_id"]

        # --- Day shifts for next 30 days ---
        for i in range(30):
            shift_date = base_date + timedelta(days=i)

            start = shift_date.replace(hour=9, minute=0, second=0)
            end = shift_date.replace(hour=19, minute=0, second=0)

            shifts.append({
                "shift_id": str(uuid.uuid4()),
                "officer_id": officer_id,
                "supervisor_id": supervisor_id,
                "shift_date": shift_date.date().isoformat(),
                "shift_start": to_utc_plus_8_iso(start),
                "shift_end": to_utc_plus_8_iso(end),
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
                "supervisor_id": supervisor_id,
                "shift_date": shift_date.date().isoformat(),
                "shift_start": to_utc_plus_8_iso(start),
                "shift_end": to_utc_plus_8_iso(end),
                "location": "NEX Mall",
                "address": "Serangoon Central, 23, Singapore 556083",
                "created_at": datetime.now(timezone.utc).isoformat()
            })

    response = supabase.table("shifts").insert(shifts).execute()
    print(response)

create_test_shifts()

