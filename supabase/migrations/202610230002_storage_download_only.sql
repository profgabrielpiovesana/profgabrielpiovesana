-- Apply after 001. Requires the official Storage operation helper; absent helpers
-- abort this migration. Never substitute an unrestricted student SELECT policy.
-- https://supabase.com/docs/guides/storage/schema/helper-functions
begin;
drop policy if exists portal_objects_read on storage.objects;
create policy portal_objects_read on storage.objects for select to authenticated
using (
  bucket_id='materiais-alunos' and (
    (select private.is_professor()) or (
      storage.allow_only_operation('object.get_authenticated')
      and private.can_read_object(name)
    )
  )
);
commit;
