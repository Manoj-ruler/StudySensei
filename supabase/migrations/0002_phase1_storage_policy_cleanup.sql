  -- Phase 1 follow-up: remove stale storage policies.
  --
  -- After 0001 the "documents" bucket is private, but a pre-existing policy on
  -- storage.objects still lets signed-out clients list and download its files
  -- (storage policies are permissive: any one that passes grants access).
  --
  -- This drops every policy on storage.objects that
  --   * mentions the documents bucket, or
  --   * names no bucket at all (a blanket rule that applies to every bucket),
  -- except the three owner-only policies created by 0001.
  -- Policies scoped to other buckets are left untouched.
  -- Each dropped policy is reported as a NOTICE in the SQL editor output.
  
  begin;
  
  do $$
  declare
    p record;
    def text;
  begin
    for p in
      select policyname, qual, with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname not in (
          'documents bucket: owner read',
          'documents bucket: owner insert',
          'documents bucket: owner delete')
    loop
      def := coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '');
      if def ilike '%documents%' or def not ilike '%bucket_id%' then
        execute format('drop policy %I on storage.objects', p.policyname);
        raise notice 'dropped storage policy: %', p.policyname;
      else
        raise notice 'kept storage policy (other bucket): %', p.policyname;
      end if;
    end loop;
  end $$;
  
  commit;
  
  -- Remaining policies, for review:
  select policyname, roles, cmd, qual, with_check
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects';
