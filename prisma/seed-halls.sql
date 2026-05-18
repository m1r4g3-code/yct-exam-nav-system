-- Exam Halls seed — run once in Supabase SQL editor
-- Coordinates sourced from Google Maps (Playwright) + OpenStreetMap + Plus Code decode
-- Confidence: ✓ = confirmed,  ~ = estimated (verify in Admin → Halls)

INSERT INTO exam_halls (id, name, code, capacity, latitude, longitude, description, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'New Building',                  'NEW-BLDG',  300, 6.5188150, 3.3723000, 'School of Technology — multi-storey new building',                    true, now(), now()),  -- ~ Plus Code decode
  (gen_random_uuid(), 'ETF Building',                  'ETF-BLDG',  250, 6.5188150, 3.3702026, 'School of Engineering — Education Trust Fund building',               true, now(), now()),  -- ~ Playwright
  (gen_random_uuid(), 'Science Complex',               'SCI-CPLX',  280, 6.5162065, 3.3717438, 'School of Science — science complex',                                  true, now(), now()),  -- ~ Playwright
  (gen_random_uuid(), 'Engineering Block',             'ENG-BLCK',  200, 6.5174000, 3.3743000, 'School of Engineering — main engineering block',                       true, now(), now()),  -- ~ estimated
  (gen_random_uuid(), 'Art & Design Building',         'ART-DSGN',  180, 6.5177135, 3.3730184, 'School of Art — art and design building block',                        true, now(), now()),  -- ~ Playwright run 1
  (gen_random_uuid(), 'College Hall',                  'COL-HALL',  350, 6.5165721, 3.3749170, 'School of Technology — main college hall',                             true, now(), now()),  -- ✓ OpenStreetMap confirmed
  (gen_random_uuid(), 'Old SMBS Building',             'SMBS-OLD',  220, 6.5177205, 3.3736483, 'School of Management & Business Studies — old SMBS block',             true, now(), now()),  -- ~ Playwright run 1
  (gen_random_uuid(), 'Environmental Studies Building','ENV-BLDG',  200, 6.5162065, 3.3694908, 'School of Environmental Studies — main building',                      true, now(), now()),  -- ~ Playwright
  (gen_random_uuid(), 'Polymer & Textile Building',    'POLY-TEX',  180, 6.5180916, 3.3714184, 'School of Engineering — polymer and textile technology block',         true, now(), now()),  -- ~ Playwright
  (gen_random_uuid(), 'Hospitality Building',          'HOSP-BLDG', 160, 6.5170000, 3.3748000, 'School of Hospitality Management — hospitality building',              true, now(), now()),  -- ~ estimated
  (gen_random_uuid(), 'Food Technology Building',      'FOOD-TECH', 200, 6.5172184, 3.3752757, 'School of Technology — food technology department',                    true, now(), now())   -- ✓ OpenStreetMap + Playwright confirmed
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  capacity    = EXCLUDED.capacity,
  latitude    = EXCLUDED.latitude,
  longitude   = EXCLUDED.longitude,
  description = EXCLUDED.description,
  updated_at  = now();
