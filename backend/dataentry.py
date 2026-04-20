

from supabase import create_client

url = "https://wfsrbpckgdzfuagkycjq.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmc3JicGNrZ2R6ZnVhZ2t5Y2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIzMzU5MiwiZXhwIjoyMDkxODA5NTkyfQ.driQQ7UUOM-u5M1tTK3StlGvlVsR6LaSpS2GsyvE99M"


supabase = create_client(url, key)

employees_to_create = [
    {
        "emp_id": "EMP003",
        "first_name": "Anthony",
        "last_name": "Bridgerton",
        "role": "Security Officer",
        "email": "niruba@gmail.com",
        "phone": "84279316",
        "gender": "Male",
        "dob": "1992-01-10",
        "language_preferences": "English",
    },
    {
        "emp_id": "EMP004",
        "first_name": "Kate",
        "last_name": "Sharma",
        "role": "Security Officer",
        "email": "kshar@example.com",
        "phone": "91856024",
        "gender": "Female",
        "dob": "1993-04-05",
        "language_preferences": "English",
    },
    {
        "emp_id": "EMP005",
        "first_name": "Daphne",
        "last_name": "Basset",
        "role": "Security Officer",
        "email": "dbass@example.com",
        "phone": "87643195",
        "gender": "Female",
        "dob": "1994-06-12",
        "language_preferences": "English",
    },
    {
        "emp_id": "EMP006",
        "first_name": "Joffrey",
        "last_name": "Baratheon",
        "role": "Security Officer",
        "email": "vaniakwee@gmail.com",
        "phone": "90571863",
        "gender": "Male",
        "dob": "1995-09-20",
        "language_preferences": "English",
    },
    {
        "emp_id": "EMP007",
        "first_name": "Regina",
        "last_name": "George",
        "role": "Security Officer",
        "email": "rgeo@example.com",
        "phone": "86724950",
        "gender": "Female",
        "dob": "1996-01-08",
        "language_preferences": "English",
    },
    {
        "emp_id": "EMP008",
        "first_name": "Dolores",
        "last_name": "Umbridge",
        "role": "Security Officer",
        "email": "dumb@example.com",
        "phone": "93418276",
        "gender": "Female",
        "dob": "1988-11-14",
        "language_preferences": "English",
    },
    {
        "emp_id": "EMP009",
        "first_name": "Baron",
        "last_name": "Harkonnen",
        "role": "Security Officer",
        "email": "bhark@example.com",
        "phone": "88967421",
        "gender": "Male",
        "dob": "1985-03-22",
        "language_preferences": "English",
    },
]


def create_employees():
    for employee in employees_to_create:
        existing = (
            supabase.table("employees")
            .select("id, emp_id, email")
            .eq("emp_id", employee["emp_id"])
            .execute()
        )

        if existing.data:
            print(f"Skipping {employee['emp_id']} ({employee['email']}): already exists")
            continue

        # 1. Create auth user
        try:
            user = supabase.auth.admin.create_user(
                {
                    "email": employee["email"],
                    "password": "Temp1234!",
                    "email_confirm": True,
                }
            )
            user_id = user.user.id
            print(user)  # debug
        except Exception as err:
            print(
                f"Could not create auth user for {employee['email']}: {err}. "
                "Skipping this employee."
            )
            continue


        # 2. Insert into employees table
        response = supabase.table("employees").insert(
            {
                "id": user_id,
                "emp_id": employee["emp_id"],
                "first_name": employee["first_name"],
                "last_name": employee["last_name"],
                "role": employee["role"],
                "email": employee["email"],
                "phone": employee["phone"],
                "gender": employee["gender"],
                "dob": employee["dob"],
                "language_preferences": employee["language_preferences"],
            }
        ).execute()

        print(response)


create_employees()