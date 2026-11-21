ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_status_check;

ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_status_check
  CHECK (status IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'));
