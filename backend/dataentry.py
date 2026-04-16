

from supabase import create_client

url = "https://wfsrbpckgdzfuagkycjq.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmc3JicGNrZ2R6ZnVhZ2t5Y2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIzMzU5MiwiZXhwIjoyMDkxODA5NTkyfQ.driQQ7UUOM-u5M1tTK3StlGvlVsR6LaSpS2GsyvE99M"


supabase = create_client(url, key)

def create_employee():
    # 1. Create auth user
    user = supabase.auth.admin.create_user({
        "email": "nirubakichor@email.com",
        "password": "Temp1234!",
        "email_confirm": True
    })

    print(user)  # debug

    user_id = user.user.id  # adjust if needed

    # 2. Insert into employees table
    response = supabase.table("employees").insert({
        "id": user_id,
        "emp_id": "EMP001",
        "first_name": "Benedict",
        "last_name": "Bridgerton",
        "role": "Security Officer",
        "email": "nirubakichor@email.com",
        "phone": "91685064",
        "gender": "Male",
        "dob": "1995-07-12"
    }).execute()

    print(response)

create_employee()