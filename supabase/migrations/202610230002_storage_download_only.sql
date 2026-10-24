-- Apply after 001. Requires the official Storage operation helper; absent helpers
-- abort this migration. Never substitute an unrestricted student SELECT policy.
-- https://supabase.com/docs/guides/storage/schema/helper-functions
-- Verified over real HTTP (Storage 1.80.2): GET /object/authenticated/... reaches
-- Postgres as operation `object.get_authenticated_info`; sign/list/sign_many stay denied.
begin;
drop policy if exists portal_objects_read on storage.objects;
create policy portal_objects_read on storage.objects for select to authenticated
using (
  bucket_id='materiais-alunos' and (
    (select private.is_professor()) or (
      storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
      and private.can_read_object(name)
    )
  )
);
commit;
