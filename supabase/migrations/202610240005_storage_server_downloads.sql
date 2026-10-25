-- Students receive PDFs only through baixar-material after authorization per POST.
-- Old cached Storage URLs require separate rollout/invalidation verification.
begin;
drop policy if exists portal_objects_read on storage.objects;
create policy portal_objects_read on storage.objects for select to authenticated
using (bucket_id='materiais-alunos' and (select private.is_professor()));
commit;
