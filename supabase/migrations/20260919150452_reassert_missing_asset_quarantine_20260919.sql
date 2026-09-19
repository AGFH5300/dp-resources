with affected(question_id) as (values
  ('8485d2e9-75e7-4df8-94bb-98306ce53921'::uuid),
  ('cf785a63-4236-4210-8000-0cefee85fc52'::uuid),
  ('f91ffd29-94c8-4535-9d68-c607a5883838'::uuid),
  ('13133532-2e47-43ea-a8cc-c4fd4623d054'::uuid),
  ('45a69ab4-be34-4317-acf3-a457bfc5dac6'::uuid),
  ('7468f66a-df99-4665-b537-18976db6e641'::uuid),
  ('e02a11b0-5320-4f92-b686-957759f66c6c'::uuid),
  ('e3389d74-6dc2-43c7-a8dd-fde98aa595ed'::uuid),
  ('f3db96f3-e2b3-4507-ab04-666ddb045e10'::uuid),
  ('d3e242f5-5209-4097-89a3-2c05ca64d58b'::uuid),
  ('0fdfc417-fc63-433e-812b-64991dff3c99'::uuid),
  ('34101edf-0041-4f06-b532-e490a2228bdd'::uuid),
  ('6cd3cffa-b7d3-47ab-ac58-020f099e8e5a'::uuid),
  ('aea55ddc-e309-4495-812a-c82529f575a0'::uuid),
  ('d4f6b704-e5e5-4175-9165-05f1cca26233'::uuid),
  ('dbf371fa-64d4-4a04-9b8d-e90a8b9fac19'::uuid),
  ('1abbb122-866d-4fcc-be64-a1367807d79c'::uuid),
  ('28c9afac-79dd-4c58-8fdf-4c58dbc45e74'::uuid),
  ('32ac633b-6297-4c8f-840f-335d84fb7da0'::uuid),
  ('61da01a5-6bbe-4e18-b08e-ec333c805fcd'::uuid),
  ('845c3c41-0cdf-43b2-ad47-66b68608e733'::uuid),
  ('299bad2f-2423-4588-af3d-d8a86e337031'::uuid),
  ('566ccc46-5322-4921-bd5a-2df0efdc82ae'::uuid),
  ('57525de2-14c9-4a38-86da-a486a1f90dfb'::uuid),
  ('76ea5e86-8609-4e73-80dd-aa064504f39c'::uuid),
  ('789e778e-0a6c-4468-9f05-535c404bc02c'::uuid),
  ('9db66601-5e37-4afb-a2ed-a3826fe66fc1'::uuid),
  ('b5bccf03-add3-4859-8a8a-3a8b54be1a0a'::uuid),
  ('c84a5f1a-80be-43e8-b95d-6472e50ee0ab'::uuid),
  ('d340f3ab-8dc1-4387-ae28-cf102e8691e3'::uuid),
  ('dabd4acd-19d9-4607-857f-89e20291d649'::uuid),
  ('e66a1033-e489-4a7f-ac42-aeeadfd93eb5'::uuid),
  ('17311bdd-f1b2-44a7-9c8e-04ac81ee6fd8'::uuid)
)
update public.dp_qb_question_variants v
set render_status='quarantined',
    render_issue_codes = (
      select array_agg(distinct code order by code)
      from unnest(
        coalesce(v.render_issue_codes,'{}'::text[])
        || case when q.content like '%Supporting image unavailable in the authorized archive.%'
                then array['missing_question_image']::text[] else '{}'::text[] end
        || case when q.mark_scheme like '%Supporting image unavailable in the authorized archive.%'
                then array['missing_markscheme_image']::text[] else '{}'::text[] end
      ) code
    )
from affected a
join public.dp_qb_questions q on q.id=a.question_id
where v.question_id=a.question_id
  and (
    q.content like '%Supporting image unavailable in the authorized archive.%'
    or q.mark_scheme like '%Supporting image unavailable in the authorized archive.%'
  );
