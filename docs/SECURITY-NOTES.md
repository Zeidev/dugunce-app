# Güvenlik Notları — Bağımlılık Açıkları

**Son kontrol:** 2026-11-02
**Komut:** `npm audit --omit=dev`

---

## Açık: `zod` < 4.6.6 — bellek tükenmesi (HIGH)

**Danışma:** [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
**Sorun:** Zod, aşırı büyük "constrained collection" doğrularken bellek tüketebiliyor.

### Bizi etkiliyor mu? — **Hayır, şu an sömürülemez**

| Koşul | Durumumuz |
|---|---|
| `z.array()`, `z.record()`, `z.tuple()`, `z.set()`, `z.map()` kullanımı | **Yok** — tüm şemalar düz nesne |
| Request body limiti | 1 MB (`express.json({ limit: '1mb' })`) |
| Saldırı yüzeyi | Kimlik doğrulamasız uçlarda rate limit var |

Açık, Zod'un koleksiyon doğrulayıcılarında. Kullanmadığımız için tetiklenemez.

### Neden hemen yükseltmiyoruz?

`zod` 3.x → 4.x **breaking change**. Risk/fayda:

- **Fayda:** kullanmadığımız bir kod yolu
- **Risk:** 40+ şemanın davranışı değişebilir, 624 test yeniden doğrulanmalı

### Ne zaman yükseltmeli?

Şu üçünden **biri** olursa:

1. Herhangi bir şemaya `z.array()` / `z.record()` eklenirse
2. `zod` 4.x stabil olgunluğa erişince (planlı refactor)
3. Aşama 8 (yayın öncesi güvenlik denetimi)

### İzleme

Her aşama kapanışında `npm audit --omit=dev` çalıştırılır. Yeni bir açık
çıkarsa bu dosyaya eklenir.

---

## Kapatılan / etkisiz açıklar

`npm audit` toplam 10 açık gösteriyor; 9'u **dev bağımlılıklarında**
(vitest, esbuild, tinypool, @vitest/mocker). Bunlar üretim imajında
kurulmuyor (`npm ci --omit=dev`), dolayısıyla saldırı yüzeyi değil.

Doğrulama:

```bash
npm audit --omit=dev     # sadece üretim
```

---

## Kural: üretim bağımlılığı sınıflandırması

`drizzle-orm` yanlışlıkla `devDependencies`'teydi ve üretimde
`Cannot find module` ile çökecekti. Bu sınıf hata tekrar etmesin diye
`tests/config/deps.test.ts` her derlenmiş dosyanın import ettiği paketin
`dependencies`'te olduğunu doğrular.
