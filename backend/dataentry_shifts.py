

from supabase import create_client
from datetime import datetime, timedelta
import uuid

url = "https://wfsrbpckgdzfuagkycjq.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmc3JicGNrZ2R6ZnVhZ2t5Y2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIzMzU5MiwiZXhwIjoyMDkxODA5NTkyfQ.driQQ7UUOM-u5M1tTK3StlGvlVsR6LaSpS2GsyvE99M"


supabase = create_client(url, key)

def create_test_shifts():
    base_date = datetime(2026, 4, 16)
    shifts = []

    # --- Day shifts for next 30 days ---
    for i in range(30):
        shift_date = base_date + timedelta(days=i)

        start = shift_date.replace(hour=9, minute=0, second=0)
        end = shift_date.replace(hour=19, minute=0, second=0)

        shifts.append({
            "shift_id": str(uuid.uuid4()),
            "officer_id": "d8ec428f-6d12-4daf-b632-e2908d9381d5",
            "supervisor_id": "88be6b57-41d9-4e7e-baaf-10599603d024",
            "shift_date": shift_date.date().isoformat(),
            "shift_start": start.isoformat() + "Z",
            "shift_end": end.isoformat() + "Z",
            "location": "NEX Mall",
            "address": "Serangoon Central, 23, Singapore 556083",
            "created_at": datetime.utcnow().isoformat()
        })

    # --- Night shifts for next 4 days ---
    for i in range(4):
        shift_date = base_date + timedelta(days=i)

        start = shift_date.replace(hour=20, minute=0, second=0)
        end = (shift_date + timedelta(days=1)).replace(hour=8, minute=0, second=0)

        shifts.append({
            "shift_id": str(uuid.uuid4()),
            "officer_id": "d8ec428f-6d12-4daf-b632-e2908d9381d5",
            "supervisor_id": "88be6b57-41d9-4e7e-baaf-10599603d024",
            "shift_date": shift_date.date().isoformat(),
            "shift_start": start.isoformat() + "Z",
            "shift_end": end.isoformat() + "Z",
            "location": "NEX Mall",
            "address": "Serangoon Central, 23, Singapore 556083",
            "created_at": datetime.utcnow().isoformat()
        })

    response = supabase.table("shifts").insert(shifts).execute()
    print(response)

create_test_shifts()

