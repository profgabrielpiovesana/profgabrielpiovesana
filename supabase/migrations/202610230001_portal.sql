-- Portal privado. Apply to a dedicated Supabase project before any live tests.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.professores (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.alunos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 160),
  email text not null unique check (length(btrim(email)) between 3 and 320),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.materiais_privados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  tipo text not null check (tipo in ('aula','lista')),
  descricao text not null default '' check (length(descricao) <= 2000),
  data_referencia date not null,
  object_path text not null unique check (object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'),
  nome_original text not null check (length(btrim(nome_original)) between 1 and 255),
  publicado boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.acessos_materiais (
  material_id uuid not null references public.materiais_privados(id) on delete cascade,
  aluno_id uuid not null references public.alunos(user_id) on delete cascade,
  primary key (material_id, aluno_id)
);
create index if not exists acessos_materiais_aluno_idx on public.acessos_materiais(aluno_id);

alter table public.professores enable row level security;
alter table public.alunos enable row level security;
alter table public.materiais_privados enable row level security;
alter table public.acessos_materiais enable row level security;

-- Definer helpers only return booleans for the current JWT identity. No arbitrary user ID is accepted.
create or replace function private.is_professor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.professores p where p.user_id = auth.uid());
$$;
create or replace function private.can_read_material(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.materiais_privados m
    join public.acessos_materiais x on x.material_id = m.id
    join public.alunos a on a.user_id = x.aluno_id
    where m.id = p_id and m.publicado and a.user_id = auth.uid() and a.ativo
  );
$$;
create or replace function private.can_read_object(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.materiais_privados m
    join public.acessos_materiais x on x.material_id = m.id
    join public.alunos a on a.user_id = x.aluno_id
    where m.object_path = p_path and m.publicado and a.user_id = auth.uid() and a.ativo
  );
$$;
revoke all on function private.is_professor(), private.can_read_material(uuid), private.can_read_object(text) from public, anon, authenticated;
grant execute on function private.is_professor(), private.can_read_material(uuid), private.can_read_object(text) to authenticated;

revoke all on public.professores, public.alunos, public.materiais_privados, public.acessos_materiais from public, anon, authenticated;
grant select on public.professores to authenticated;
grant select, insert, update, delete on public.alunos, public.materiais_privados, public.acessos_materiais to authenticated;

drop policy if exists professores_read on public.professores;
create policy professores_read on public.professores for select to authenticated using ((select private.is_professor()));
drop policy if exists alunos_read on public.alunos;
create policy alunos_read on public.alunos for select to authenticated using ((select private.is_professor()) or user_id = (select auth.uid()));
drop policy if exists alunos_insert on public.alunos;
create policy alunos_insert on public.alunos for insert to authenticated with check ((select private.is_professor()));
drop policy if exists alunos_update on public.alunos;
create policy alunos_update on public.alunos for update to authenticated using ((select private.is_professor())) with check ((select private.is_professor()));
drop policy if exists alunos_delete on public.alunos;
create policy alunos_delete on public.alunos for delete to authenticated using ((select private.is_professor()));

drop policy if exists materiais_read on public.materiais_privados;
create policy materiais_read on public.materiais_privados for select to authenticated using ((select private.is_professor()) or private.can_read_material(id));
drop policy if exists materiais_insert on public.materiais_privados;
create policy materiais_insert on public.materiais_privados for insert to authenticated with check ((select private.is_professor()));
drop policy if exists materiais_update on public.materiais_privados;
create policy materiais_update on public.materiais_privados for update to authenticated using ((select private.is_professor())) with check ((select private.is_professor()));
drop policy if exists materiais_delete on public.materiais_privados;
create policy materiais_delete on public.materiais_privados for delete to authenticated using ((select private.is_professor()));

drop policy if exists acessos_read on public.acessos_materiais;
create policy acessos_read on public.acessos_materiais for select to authenticated using ((select private.is_professor()) or (aluno_id = (select auth.uid()) and private.can_read_material(material_id)));
drop policy if exists acessos_insert on public.acessos_materiais;
create policy acessos_insert on public.acessos_materiais for insert to authenticated with check ((select private.is_professor()));
drop policy if exists acessos_update on public.acessos_materiais;
create policy acessos_update on public.acessos_materiais for update to authenticated using ((select private.is_professor())) with check ((select private.is_professor()));
drop policy if exists acessos_delete on public.acessos_materiais;
create policy acessos_delete on public.acessos_materiais for delete to authenticated using ((select private.is_professor()));

create or replace function private.keep_file_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.object_path is distinct from old.object_path or new.nome_original is distinct from old.nome_original then
    raise exception 'The stored file identity cannot be changed';
  end if;
  return new;
end;
$$;
drop trigger if exists keep_material_file_identity on public.materiais_privados;
create trigger keep_material_file_identity before update on public.materiais_privados
for each row execute function private.keep_file_identity();
revoke all on function private.keep_file_identity() from public, anon, authenticated;

create or replace function public.save_material(p_id uuid, p_metadata jsonb, p_student_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_title text := btrim(p_metadata->>'titulo');
  v_type text := p_metadata->>'tipo';
  v_description text := coalesce(p_metadata->>'descricao', '');
  v_date date;
  v_path text := p_metadata->>'object_path';
  v_name text := p_metadata->>'nome_original';
  v_published boolean;
  v_count integer;
begin
  if not private.is_professor() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then raise exception 'Invalid metadata'; end if;
  if v_title is null or length(v_title) not between 1 and 200 or v_type not in ('aula','lista')
     or length(v_description) > 2000 or p_metadata->>'data_referencia' is null
     or p_metadata->>'publicado' not in ('true','false') then raise exception 'Invalid material fields'; end if;
  v_date := (p_metadata->>'data_referencia')::date;
  v_published := (p_metadata->>'publicado')::boolean;
  if p_student_ids is null or cardinality(p_student_ids) = 0
     or array_position(p_student_ids,null) is not null then raise exception 'Recipients required'; end if;
  select count(distinct id) into v_count from unnest(p_student_ids) as ids(id);
  if v_count <> cardinality(p_student_ids) then raise exception 'Duplicate recipient'; end if;
  select count(*) into v_count from public.alunos a where a.user_id = any(p_student_ids) and a.ativo;
  if v_count <> cardinality(p_student_ids) then raise exception 'Invalid or inactive recipient'; end if;
  if p_id is null then
    if v_path is null or v_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
       or v_name is null or length(btrim(v_name)) not between 1 and 255 then raise exception 'Invalid PDF identity'; end if;
    insert into public.materiais_privados(titulo,tipo,descricao,data_referencia,object_path,nome_original,publicado)
      values (v_title,v_type,v_description,v_date,v_path,v_name,v_published) returning id into v_id;
  else
    select id into v_id from public.materiais_privados where id=p_id for update;
    if v_id is null then raise exception 'Material not found'; end if;
    if (p_metadata ? 'object_path' and v_path is distinct from (select object_path from public.materiais_privados where id=v_id))
       or (p_metadata ? 'nome_original' and v_name is distinct from (select nome_original from public.materiais_privados where id=v_id)) then
       raise exception 'The stored file identity cannot be changed';
    end if;
    update public.materiais_privados set titulo=v_title,tipo=v_type,descricao=v_description,data_referencia=v_date,publicado=v_published where id=v_id;
    delete from public.acessos_materiais where material_id=v_id;
  end if;
  insert into public.acessos_materiais(material_id,aluno_id) select v_id, id from unnest(p_student_ids) as ids(id);
  return v_id;
end;
$$;
revoke all on function public.save_material(uuid,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.save_material(uuid,jsonb,uuid[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('materiais-alunos','materiais-alunos',false,20000000,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=20000000,allowed_mime_types=array['application/pdf'];

drop policy if exists portal_objects_read on storage.objects;
create policy portal_objects_read on storage.objects for select to authenticated
using (bucket_id='materiais-alunos' and ((select private.is_professor()) or private.can_read_object(name)));
drop policy if exists portal_objects_insert on storage.objects;
create policy portal_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='materiais-alunos' and (select private.is_professor()) and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$');
drop policy if exists portal_objects_delete on storage.objects;
create policy portal_objects_delete on storage.objects for delete to authenticated
using (bucket_id='materiais-alunos' and (select private.is_professor()));
