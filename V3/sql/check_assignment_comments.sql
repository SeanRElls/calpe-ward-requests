-- Check if assignment_comments table exists
SELECT to_regclass('public.assignment_comments') as table_exists;

-- If it exists, show its structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'assignment_comments'
ORDER BY ordinal_position;
