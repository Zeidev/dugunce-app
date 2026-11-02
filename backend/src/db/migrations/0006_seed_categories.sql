-- Sistem kategorileri — brief §5.3, design §7 `expense_category`.
--
-- `wedding_id IS NULL` + `is_system = true` → her düğün görür,
-- hiçbir kullanıcı silemez/değiştiremez.
--
-- `ON CONFLICT` yerine `WHERE NOT EXISTS`: sistem kategorilerinde
-- UNIQUE (name) kısıtı yok (farklı düğünler aynı adı kullanabilmeli),
-- bu yüzden idempotency elle sağlanıyor.

INSERT INTO "expense_categories" ("wedding_id", "name", "sort_order", "is_system")
SELECT NULL, name, ord, true
FROM (VALUES
  ('Mekân', 0),
  ('Yemek / Catering', 1),
  ('Fotoğraf / Video', 2),
  ('Gelinlik / Damatlık', 3),
  ('Kuaför / Makyaj', 4),
  ('Çiçek / Dekorasyon', 5),
  ('Müzik / Eğlence', 6),
  ('Davetiye', 7),
  ('Ulaşım', 8),
  ('Konaklama', 9),
  ('Hediyelik', 10),
  ('Diğer', 11)
) AS t(name, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM "expense_categories" c
  WHERE c."wedding_id" IS NULL AND c."name" = t.name
);
