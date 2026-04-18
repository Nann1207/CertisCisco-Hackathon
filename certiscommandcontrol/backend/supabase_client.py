from supabase import create_client, Client

def get_supabase_client(supabase_url: str, supabase_anon_key: str, user_jwt: str) -> Client:
    # Uses user JWT so RLS can apply (recommended).
    # The python client supports passing Authorization headers.
    return create_client(
        supabase_url,
        supabase_anon_key,
        headers={"Authorization": f"Bearer {user_jwt}"}
    )