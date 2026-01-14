-- Check if RLS is enabled on rota_assignments
SELECT 
    relname as table_name,
    relrowsecurity as rls_enabled,
    relforcerowsecurity as rls_forced
FROM pg_class 
WHERE relname = 'rota_assignments';

-- Also check for any policies (should be empty based on previous query)
SELECT * FROM pg_policies WHERE tablename = 'rota_assignments';
