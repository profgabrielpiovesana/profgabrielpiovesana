-- Run on an isolated Supabase test project with psql -v ON_ERROR_STOP=1 -f ...
-- This script creates synthetic users and rolls back all SQL fixtures.
begin;

create temp table portal_fixture (kind text primary key, id uuid not null);
insert into portal_fixture values
 ('professor','11111111-1111-4111-8111-111111111111'),
 ('a','22222222-2222-4222-8222-222222222222'),
 ('b','33333333-3333-4333-8333-333333333333'),
 ('outsider','44444444-4444-4444-8444-444444444444');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', kind || '@portal.test.invalid', '', now(), '{}', '{}', now(), now() from portal_fixture;
insert into public.professores(user_id) select id from portal_fixture where kind='professor';
insert into public.alunos(user_id,nome,email) select id, kind, kind || '@portal.test.invalid' from portal_fixture where kind in ('a','b');
insert into public.materiais_privados(titulo,tipo,data_referencia,object_path,nome_original,publicado)
values ('PDF A','aula','2026-10-23','55555555-5555-4555-8555-555555555555.pdf','a.pdf',true);
insert into public.acessos_materiais(material_id,aluno_id)
select m.id, f.id from public.materiais_privados m cross join portal_fixture f where m.titulo='PDF A' and f.kind='a';

create function pg_temp.assert_true(value boolean, description text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %', description; end if; end $$;
create function pg_temp.assert_denied(stmt text, description text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
  begin execute stmt;
  exception when insufficient_privilege or check_violation or raise_exception or foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: %', description; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.assert_true((select count(*)=2 from public.alunos where ativo), 'professor reads students');
select pg_temp.assert_true((select count(*)=1 from public.materiais_privados), 'professor reads materials');
select pg_temp.assert_denied('insert into public.professores(user_id) values (''44444444-4444-4444-8444-444444444444'')', 'browser cannot create professor');
select pg_temp.assert_denied('update public.materiais_privados set object_path=''66666666-6666-4666-8666-666666666666.pdf'' where titulo=''PDF A''', 'file path is immutable');
select public.save_material((select id from public.materiais_privados where titulo='PDF A'),
 '{"titulo":"PDF A","tipo":"aula","descricao":"edited","data_referencia":"2026-10-23","publicado":true}'::jsonb,
 array['22222222-2222-4222-8222-222222222222'::uuid]);
select pg_temp.assert_true((select descricao='edited' and object_path='55555555-5555-4555-8555-555555555555.pdf' from public.materiais_privados where titulo='PDF A'), 'professor edits metadata without moving PDF');

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert_true((select count(*)=1 from public.alunos), 'A reads own enrollment');
select pg_temp.assert_true((select count(*)=1 from public.materiais_privados), 'A reads assigned published material');
select pg_temp.assert_true((select count(*)=1 from public.acessos_materiais), 'A reads own assignment');
select pg_temp.assert_true((select count(*)=0 from public.professores), 'A cannot read professors');
update public.alunos set ativo=false where user_id='22222222-2222-4222-8222-222222222222';
select pg_temp.assert_true((select ativo from public.alunos where user_id='22222222-2222-4222-8222-222222222222'), 'student cannot change active state');
select pg_temp.assert_denied('insert into public.professores(user_id) values (''22222222-2222-4222-8222-222222222222'')', 'student cannot promote');
select pg_temp.assert_denied('select public.save_material(null, ''{}''::jsonb, array[]::uuid[])', 'student cannot save material');

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select pg_temp.assert_true((select count(*)=0 from public.materiais_privados), 'B cannot see A material');
select pg_temp.assert_true((select count(*)=0 from public.acessos_materiais), 'B cannot see A assignment');

select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select pg_temp.assert_true((select count(*)=0 from public.materiais_privados), 'unregistered user sees no material');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_denied('select count(*) from public.materiais_privados', 'visitor cannot query materials');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
reset role;
update public.alunos set ativo=false where user_id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.alunos where not ativo), 'inactive A reads own state');
select pg_temp.assert_true((select count(*)=0 from public.materiais_privados), 'inactive A sees no material');
reset role;

-- Invalid recipient must leave metadata and assignments unchanged.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.assert_denied(format('select public.save_material(%L, %L::jsonb, array[%L::uuid])',
 (select id from public.materiais_privados where titulo='PDF A'), '{"titulo":"Changed","tipo":"lista","data_referencia":"2026-10-23","publicado":true}', '99999999-9999-4999-8999-999999999999'), 'invalid recipient is rejected');
select pg_temp.assert_true((select titulo='PDF A' from public.materiais_privados where object_path='55555555-5555-4555-8555-555555555555.pdf'), 'invalid recipient rolled back metadata');
select pg_temp.assert_true((select count(*)=1 from public.acessos_materiais), 'invalid recipient kept assignments');
select pg_temp.assert_denied(format('select public.save_material(%L, %L::jsonb, array[%L::uuid,%L::uuid])',
 (select id from public.materiais_privados where titulo='PDF A'), '{"titulo":"Changed","tipo":"lista","data_referencia":"2026-10-23","publicado":true}',
 '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222'), 'duplicate recipient rejected');
rollback;
