-- seed.sql — one institution row and its labs. Run once per deployment,
-- before seed-users. Replace the values with the real ones.

insert into institution (code, name, product_name, logo_url, brand_primary, brand_accent, email_from, timezone)
values ('FUGO', 'Federal University ___', 'FugoTag', '/brand/fugo-tag-lockup.png',
        '#0b4a28', '#e8b93f', 'alerts@fugo.edu.ng', 'Africa/Lagos')
on conflict (code) do nothing;

insert into labs (name, code, building, room, public_token) values
  ('Chemistry Lab 1',    'CHEM1', 'Science Block A', 'G12', encode(gen_random_bytes(9), 'hex')),
  ('Chemistry Lab 2',    'CHEM2', 'Science Block A', 'G14', encode(gen_random_bytes(9), 'hex')),
  ('Physics Lab 1',      'PHY1',  'Science Block B', '101', encode(gen_random_bytes(9), 'hex')),
  ('Biology Lab 1',      'BIO1',  'Science Block B', '205', encode(gen_random_bytes(9), 'hex')),
  ('Microbiology Lab',   'MICRO', 'Science Block C', 'G03', encode(gen_random_bytes(9), 'hex')),
  ('Engineering Workshop','ENG',  'Engineering',     'W1',  encode(gen_random_bytes(9), 'hex'))
on conflict (code) do nothing;
