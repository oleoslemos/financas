ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS estimated_time_hhmm text;

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_estimated_time_hhmm_check;

ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_estimated_time_hhmm_check
  CHECK (
    estimated_time_hhmm IS NULL
    OR estimated_time_hhmm ~ '^[0-9]{2}:[0-5][0-9]$'
  );
