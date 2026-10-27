-- Existing PDFs retain a NULL subject until the teacher classifies them.
alter table public.materiais_privados add column disciplina text
  check (disciplina in ('matematica', 'fisica'));

-- New saves require an explicit subject; publication remains unchanged on edit.
create or replace function public.save_material(p_id uuid, p_metadata jsonb, p_student_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_title text := btrim(p_metadata->>'titulo');
  v_type text := p_metadata->>'tipo';
  v_subject text := p_metadata->>'disciplina';
  v_description text := coalesce(p_metadata->>'descricao', '');
  v_date date;
  v_path text := p_metadata->>'object_path';
  v_name text := p_metadata->>'nome_original';
  v_published boolean;
  v_count integer;
begin
  if not private.is_professor() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then raise exception 'Invalid metadata'; end if;
  if v_subject is null or v_subject not in ('matematica','fisica') then raise exception 'Invalid subject'; end if;
  if v_title is null or length(v_title) not between 1 and 200 or v_type not in ('aula','lista')
     or length(v_description) > 2000 or p_metadata->>'data_referencia' is null then raise exception 'Invalid material fields'; end if;
  v_date := (p_metadata->>'data_referencia')::date;
  if p_student_ids is null or cardinality(p_student_ids) = 0
     or array_position(p_student_ids,null) is not null then raise exception 'Recipients required'; end if;
  select count(distinct id) into v_count from unnest(p_student_ids) as ids(id);
  if v_count <> cardinality(p_student_ids) then raise exception 'Duplicate recipient'; end if;
  select count(*) into v_count from public.alunos a where a.user_id = any(p_student_ids) and a.ativo;
  if v_count <> cardinality(p_student_ids) then raise exception 'Invalid or inactive recipient'; end if;
  if p_id is null then
    if p_metadata->>'publicado' is null or p_metadata->>'publicado' not in ('true','false') then
      raise exception 'Invalid publication state';
    end if;
    v_published := (p_metadata->>'publicado')::boolean;
    if v_path is null or v_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
       or v_name is null or length(btrim(v_name)) not between 1 and 255 then raise exception 'Invalid PDF identity'; end if;
    insert into public.materiais_privados(titulo,tipo,disciplina,descricao,data_referencia,object_path,nome_original,publicado)
      values (v_title,v_type,v_subject,v_description,v_date,v_path,v_name,v_published) returning id into v_id;
  else
    select id into v_id from public.materiais_privados where id=p_id for update;
    if v_id is null then raise exception 'Material not found'; end if;
    if (p_metadata ? 'object_path' and v_path is distinct from (select object_path from public.materiais_privados where id=v_id))
       or (p_metadata ? 'nome_original' and v_name is distinct from (select nome_original from public.materiais_privados where id=v_id)) then
       raise exception 'The stored file identity cannot be changed';
    end if;
    update public.materiais_privados set titulo=v_title,tipo=v_type,disciplina=v_subject,descricao=v_description,data_referencia=v_date where id=v_id;
    delete from public.acessos_materiais where material_id=v_id;
  end if;
  insert into public.acessos_materiais(material_id,aluno_id) select v_id, id from unnest(p_student_ids) as ids(id);
  return v_id;
end;
$$;
revoke all on function public.save_material(uuid,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.save_material(uuid,jsonb,uuid[]) to authenticated;
