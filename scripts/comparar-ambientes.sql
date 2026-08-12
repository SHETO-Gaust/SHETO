-- Compara a disponibilidade docente entre dois bancos (localhost x VM).
--
-- Reproduz exatamente a entrada do teste que o certificador usa para provar
-- inviabilidade: em cada horario, quais professores cada turma pode usar.
-- Se os dois ambientes derem numeros diferentes, o problema e' o CADASTRO,
-- nao o algoritmo.
--
--   psql -h localhost -U shetouser -d sheto -v escola=1120 -f scripts/comparar-ambientes.sql
--
-- Trocar o :escola conforme o caso. O turno usado e' o primeiro turno ativo.

\set QUIET on
\pset footer off

select 'ESCOLA ' || :escola || ' | ' || coalesce((select escolar from public.escolas where id = :escola), '?') as cabecalho;

-- ── 1. Impressao geral: quantidade de restricoes por tipo ───────────────────
with turno as (
    select id, nome, aulas_por_dia, dias_semana, horarios
      from public.turnos where escola_id = :escola and ativo
     order by nome limit 1
),
celulas as (
    select p.id, p.nome_horario,
           d.dia, g.idx,
           coalesce(p.restricoes -> (select id::text from turno) -> d.dia ->> g.idx::text, '') as status
      from public.professores p
      cross join turno t
      cross join lateral unnest(t.dias_semana) as d(dia)
      cross join lateral generate_series(0, t.aulas_por_dia - 1) as g(idx)
     where p.escola_id = :escola
)
select status as tipo_restricao, count(*) as celulas
  from celulas where status <> ''
 group by status order by count(*) desc;

-- ── 2. Total de folgas de livre docencia declaradas ─────────────────────────
select count(*) as periodos_de_livre_docencia
  from public.professores p,
       lateral jsonb_array_elements(coalesce(p.livre_docencia, '[]'::jsonb)) ld
 where p.escola_id = :escola
   and p.sem_preferencia_livre_docencia is false;

-- ── 3. O TESTE: professores disponiveis por turma em cada horario ───────────
--
-- `profs_distintos` e' o teto do emparelhamento. Se em algum horario ele for
-- MENOR que o numero de turmas sem folga, a grade e' comprovadamente impossivel.
with turno as (
    select id, nome, aulas_por_dia, dias_semana, horarios
      from public.turnos where escola_id = :escola and ativo
     order by nome limit 1
),
capacidade as (
    select (select aulas_por_dia from turno) * (select array_length(dias_semana,1) from turno) as cap
),
turmas_sem_folga as (
    select t.id, t.nome
      from public.turmas t
      join public.series_componentes sc on sc.serie_id = t.serie_id
     where t.escola_id = :escola
       and t.serie_id in (select id from public.series where turno_id = (select id from turno))
     group by t.id, t.nome
    having sum(sc.aulas_presenciais) >= (select cap from capacidade)
),
vinculos as (
    select tsf.nome as turma, p.id as prof_id, p.nome_horario as prof,
           p.restricoes, p.livre_docencia, p.sem_preferencia_livre_docencia
      from turmas_sem_folga tsf
      join public.turmas t on t.id = tsf.id
      join public.series_componentes sc on sc.serie_id = t.serie_id and sc.aulas_presenciais > 0
      join public.turmas_professores tp on tp.turma_id = t.id and tp.componente_id = sc.componente_id
      join public.professores p on p.id = tp.professor_id
),
slots as (
    select d.dia, g.idx,
           case
               when lower((select nome from turno)) like '%matutino%' then 'matutino'
               when lower((select nome from turno)) like '%vespertino%' then 'vespertino'
               when lower((select nome from turno)) like '%noturno%' then 'noturno'
               when substring((select horarios from turno) -> g.idx ->> 'inicio' from 1 for 2)::int < 13 then 'matutino'
               when substring((select horarios from turno) -> g.idx ->> 'inicio' from 1 for 2)::int < 18 then 'vespertino'
               else 'noturno'
           end as periodo
      from turno t
      cross join lateral unnest(t.dias_semana) as d(dia)
      cross join lateral generate_series(0, t.aulas_por_dia - 1) as g(idx)
),
disponibilidade as (
    select s.dia, s.idx, v.turma, v.prof_id, v.prof
      from slots s
      join vinculos v on true
     where coalesce(v.restricoes -> (select id::text from turno) -> s.dia ->> s.idx::text, '')
             not in ('indisponivel', 'reuniao_fluxo')
       and not (
            v.sem_preferencia_livre_docencia is false
            and (
                coalesce(v.restricoes -> (select id::text from turno) -> s.dia ->> s.idx::text, '') = 'livre_docencia'
                or exists (
                    select 1 from jsonb_array_elements(coalesce(v.livre_docencia, '[]'::jsonb)) ld
                     where ld ->> 'dia' = s.dia and ld ->> 'periodo' = s.periodo
                )
            )
       )
)
select d.dia,
       d.idx + 1 as aula,
       (select count(*) from turmas_sem_folga) as turmas_sem_folga,
       count(distinct d.prof_id) as profs_distintos,
       case when count(distinct d.prof_id) < (select count(*) from turmas_sem_folga)
            then 'IMPOSSIVEL' else '' end as veredito
  from disponibilidade d
 group by d.dia, d.idx
having count(distinct d.prof_id) < (select count(*) from turmas_sem_folga) + 3
 order by count(distinct d.prof_id), d.dia, d.idx;
