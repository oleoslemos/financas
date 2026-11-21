ALTER TABLE public.project_clients
  ADD COLUMN IF NOT EXISTS panels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS project_description text;
