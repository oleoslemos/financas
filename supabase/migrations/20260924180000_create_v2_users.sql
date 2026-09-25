CREATE TABLE IF NOT EXISTS public.v2_users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.v2_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert to v2_users"
    ON public.v2_users
    FOR INSERT
    TO public
    WITH CHECK (true);

CREATE POLICY "Allow public select from v2_users"
    ON public.v2_users
    FOR SELECT
    TO public
    USING (true);
