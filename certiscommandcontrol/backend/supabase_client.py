from supabase import create_client, Client, ClientOptions

def get_supabase_client(supabase_url: str, supabase_anon_key: str, user_jwt: str) -> Client:
    # Uses user JWT so RLS can apply (recommended).
    # For supabase-py v2, pass custom headers via ClientOptions.
    return create_client(
        supabase_url,
        supabase_anon_key,
        options=ClientOptions(
            headers={"Authorization": f"Bearer {user_jwt}"}
        ),
    )
