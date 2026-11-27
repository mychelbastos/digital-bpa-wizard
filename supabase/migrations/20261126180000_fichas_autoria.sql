-- Autoria visível nas fichas (26/11/2026): "Criada por X em … · Editada por Y em …".
-- Só VISUALIZAÇÃO no SPA: não entra em exportação (.MAR/.AAS), impressão nem PDF.
-- Criador = fichas.user_id + created_at (já existiam). Último editor = colunas novas,
-- preenchidas por trigger SÓ quando o conteúdo (dados) ou o nome (titulo) mudam — mudanças
-- de sistema (vincular à produção, exclusão etc.) não contam como edição.
-- Fichas antigas ficam com editado_por nulo (não havia registro de quem editou).

alter table public.fichas add column if not exists editado_por uuid;
alter table public.fichas add column if not exists editado_em timestamptz;

create or replace function public.fichas_marca_editor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (NEW.dados is distinct from OLD.dados or NEW.titulo is distinct from OLD.titulo)
     and auth.uid() is not null then
    NEW.editado_por := auth.uid();
    NEW.editado_em  := now();
  end if;
  return NEW;
end $$;

drop trigger if exists fichas_marca_editor on public.fichas;
create trigger fichas_marca_editor before update on public.fichas
  for each row execute function public.fichas_marca_editor();

-- Nome de quem criou/editou. Só responde se o usuário PODE VER a ficha (mesma regra da
-- policy fichas_select). Nome = metadata "nome" ou, na falta, o e-mail.
create or replace function public.ficha_autoria(_ficha_id uuid)
returns table (criado_por text, criado_em timestamptz, editado_por text, editado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select
    coalesce(nullif(btrim(uc.raw_user_meta_data->>'nome'), ''), uc.email),
    f.created_at,
    coalesce(nullif(btrim(ue.raw_user_meta_data->>'nome'), ''), ue.email),
    f.editado_em
  from public.fichas f
  left join auth.users uc on uc.id = f.user_id
  left join auth.users ue on ue.id = f.editado_por
  where f.id = _ficha_id
    and (
      public.tem_permissao(f.cnes, 'ver_fichas_da_unidade')
      or (f.user_id = (select auth.uid()) and f.cnes in (select c.cnes from public.cnes_visiveis() c(cnes)))
      or exists (select 1 from public.estabelecimentos e
                 where e.cnes = f.cnes and public.tem_permissao_no_org(e.organizacao_id, 'ver_fichas_do_municipio'))
    );
$$;

revoke all on function public.ficha_autoria(uuid) from public, anon;
grant execute on function public.ficha_autoria(uuid) to authenticated;
