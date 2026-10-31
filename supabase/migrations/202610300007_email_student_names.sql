-- Make the enrollment name available to Auth email templates for existing students.
-- Keep every other metadata field and every account credential/access rule unchanged.
-- New invitations and completed enrollments set nome through Auth Admin.
update auth.users as account
set raw_user_meta_data = coalesce(account.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('nome', student.nome)
from public.alunos as student
where account.id = student.user_id
  and account.raw_user_meta_data->>'nome' is distinct from student.nome;
