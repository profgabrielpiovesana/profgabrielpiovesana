-- Explicit server/acceptance-fixture privileges: new projects need not supply
-- default service_role grants. RLS and browser-role privileges stay unchanged.
grant select, insert, delete on public.professores to service_role;
grant select, insert, update, delete on public.alunos to service_role;
grant select, update, delete on public.materiais_privados to service_role;
grant select, insert, delete on public.acessos_materiais to service_role;
