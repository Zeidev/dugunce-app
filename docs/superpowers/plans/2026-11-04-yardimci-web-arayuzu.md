# Yardımcı Web Arayüzü — Mobil Uygulama Deneyimi: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frontend/public/h/index.html` sayfasını, mevcut tüm işlevleri koruyarak telefonda gerçek bir uygulama gibi çalışan ve landing sayfasıyla aynı görsel dili konuşan bir arayüze dönüştürmek.

**Architecture:** Tek dosya (`index.html`) içinde `<style>` + `<script type="module">`. Framework/CDN/build yok, vanilla JS. Mevcut `state`, `apiFetch`, `openSession`, `restoreCsrf`, polling ve oturum mantığı **aynen korunur**; yalnız görsel katman ve etkileşim katmanı (görev sayfası, sohbet ekranı) yeniden yazılır. Liste kaydırma konumu korunur; durum değişiminde liste yeniden çizilmez.

**Tech Stack:** HTML, CSS (custom properties, flexbox, `@font-face`), vanilla JS (ES module), `Intl.DateTimeFormat`, mevcut REST API.

**Spec:** `docs/superpowers/specs/2026-11-04-yardimci-web-arayuzu-design.md`

## Global Constraints

- Tek dosya: `frontend/public/h/index.html`. Harici CSS/JS dosyası YOK.
- Bağımlılık yok: framework, CDN, build aracı, npm paketi YOK.
- API sabit: `const API = 'https://api.dugunce.com.tr/api/v1'` (değişmez).
- Token `#fragment`'te kalır; `history.replaceState` ile temizlenir. Token hiçbir zaman query string'e veya sunucuya gitmez.
- **Sayfa yüklenirken YALNIZ `GET` atılır.** Hiçbir yazma isteği (POST/PATCH/DELETE) otomatik tetiklenmez — WhatsApp önizleme botu yan etki yaratmamalı.
- Kullanıcı verisi `innerHTML` ile basılmaz; yalnız `textContent` / `createElement`.
- `credentials: 'include'`, CSRF `X-CSRF-Token` başlığında, `sessionStorage` anahtarı `helper_csrf` (mevcut adlar korunur).
- Fontlar `/assets/fonts/*.woff2` yolundan; `latin` + `latin-ext` birlikte tanımlanır (Türkçe karakter zorunlu).
- Renk değişkenleri spec §5.1'deki değerlerle birebir aynı.
- Dokunma hedefi ≥ 44px; gövde kontrastı ≥ 4.5:1; `prefers-reduced-motion` desteklenir.
- Polling aralığı `15000` ms (değişmez); sekme gizlenince durur.
- Mevcut DOM kimlikleri korunur: `#loading`, `#error`, `#errorText`, `#head`, `#greeting`, `#coupleLine`, `#list`, `#empty`, `#toast`.

## Review Focus

1. **Oturum çerezi varken ama token yokken sayfa yenileme** — kullanıcı URL'de token olmadan sayfayı yeniler; sayfa "geçersiz bağlantı" göstermemeli, oturum çereziyle listeyi açmalı.
2. **Sohbet açıkken polling yeni mesaj getirmesi** — kullanıcı sohbet ekranındayken çift mesaj atar; mesaj sayfa yenilemeden görünmeli ve kaydırma en alta inmeli.
3. **Durum değiştirirken ağ hatası** — istek başarısız olursa kart eski durumuna dönmeli ve kullanıcı bilgilendirilmeli (sessiz kalmamalı).
4. **Çok uzun görev başlığı / açıklaması** — 200+ karakterlik başlık taşmamalı, kart yüksekliği bozulmamalı, görev sayfası kaydırılabilir olmalı.
5. **Çok sayıda görev (50+)** — liste akıcı kaydırılmalı; durum değişiminde kaydırma konumu sıçramamalı.

---

## Dosya Yapısı

Tek dosya olduğu için yapı dosya içi bölümlerle ayrılır:

| Bölüm | Sorumluluk |
|---|---|
| `<style>` — tokens | Renk değişkenleri, `@font-face`, tipografi ölçeği |
| `<style>` — shell | Başlık, filtre sekmeleri, liste, kart |
| `<style>` — sheet | Alttan açılan görev sayfası + scrim |
| `<style>` — chat | Tam ekran sohbet |
| `<style>` — states | Yükleniyor, hata, boş, toast |
| `<body>` | Kabuk + 3 katman (liste, sheet, chat) |
| `script` — state | `state` nesnesi (mevcut + `filter`) |
| `script` — api | `getToken`, `openSession`, `restoreCsrf`, `apiFetch` (mevcut, değişmez) |
| `script` — render | `renderTabs`, `renderList`, `renderTask` |
| `script` — sheet | `openSheet`, `closeSheet` |
| `script` — chat | `openChat`, `closeChat`, `renderMessages` |
| `script` — actions | `changeStatus`, `sendMessage` |
| `script` — polling | `startPolling`, `stopPolling`, `load` (mevcut mantık) |

---

### Task 1: Görsel temel — renkler, fontlar, tipografi

**Files:**
- Modify: `frontend/public/h/index.html:15-110` (`<style>` bloğunun tamamı)

**Interfaces:**
- Consumes: yok (ilk görev)
- Produces: CSS değişkenleri — `--cream`, `--surface`, `--surface-alt`, `--ink`, `--muted`, `--line`, `--sage`, `--sage-deep`, `--sage-soft`, `--sage-border`, `--gold`, `--gold-soft`, `--doing`, `--danger`, `--radius`, `--sheet-radius`. Font aileleri: `'Playfair Display'` (başlık), `'Josefin Sans'` (gövde). Sınıflar: `.wrap`, `.head`, `.brand`, `.greet`, `.couple`.

- [ ] **Step 1: Sayfayı mevcut haliyle kaydet (geri dönüş noktası)**

```bash
cp frontend/public/h/index.html /tmp/helper-index-before.html
```

- [ ] **Step 2: `<style>` bloğunu değişkenler + fontlar + tipografi ile değiştir**

`:root` içine spec §5.1'deki renk değişkenlerini **birebir** yaz. Ardından `@font-face` tanımları:

```css
@font-face{font-family:'Playfair Display';font-weight:600;font-display:swap;
  src:url('/assets/fonts/playfair-display-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-024F,U+1E00-1EFF}
@font-face{font-family:'Playfair Display';font-weight:600;font-display:swap;
  src:url('/assets/fonts/playfair-display-latin.woff2') format('woff2')}
@font-face{font-family:'Josefin Sans';font-weight:400;font-display:swap;
  src:url('/assets/fonts/josefin-sans-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-024F,U+1E00-1EFF}
@font-face{font-family:'Josefin Sans';font-weight:400;font-display:swap;
  src:url('/assets/fonts/josefin-sans-latin.woff2') format('woff2')}
@font-face{font-family:'Josefin Sans';font-weight:600;font-display:swap;
  src:url('/assets/fonts/josefin-sans-600-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-024F,U+1E00-1EFF}
@font-face{font-family:'Josefin Sans';font-weight:600;font-display:swap;
  src:url('/assets/fonts/josefin-sans-600-latin.woff2') format('woff2')}
```

`body` fontu: `'Josefin Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. `h1`/`.greet`: `'Playfair Display', Georgia, serif`.

- [ ] **Step 3: Sayfayı tarayıcıda aç ve fontların yüklendiğini doğrula**

```bash
cd frontend/public && python3 -m http.server 5173
```

Tarayıcıda `http://localhost:5173/h/index.html` aç, konsolda:

```js
JSON.stringify({
  josefin: document.fonts.check('14px "Josefin Sans"'),
  playfair: document.fonts.check('16px "Playfair Display"'),
  bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 30)
})
```

Expected: `josefin: true`, `playfair: true`, `bodyFont` "Josefin Sans" ile başlar.

- [ ] **Step 4: Türkçe karakterlerin bozulmadığını doğrula**

`latin-ext` yüklenmezse `ğüşıöç` fallback fonta düşer ve gözle görülür fark olur. Konsolda:

```js
document.body.insertAdjacentHTML('beforeend',
  '<p id="tr" style="font-family:\'Josefin Sans\'">ğüşıöçĞÜŞİÖÇ</p>')
```

Ekran görüntüsü al; harflerin düzgün (kutu/`?` değil) göründüğünü doğrula. Doğrulama sonrası `#tr` öğesini kaldır.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/h/index.html
git commit -m "style(helper): landing ile ayni renk ve tipografi dili"
```

---

### Task 2: Kabuk — başlık, filtre sekmeleri, liste kartları

**Files:**
- Modify: `frontend/public/h/index.html` (`<body>` kabuğu + `.head`/`.tabs`/`.list`/`.task` CSS)

**Interfaces:**
- Consumes: Task 1'in CSS değişkenleri ve fontları.
- Produces: DOM — `#head` (başlık), `#tabs` (filtre çubuğu), `#list` (kart kabı), `#empty` (boş durum). JS fonksiyonu `renderTabs(tasks)` ve `renderList()` — `renderList` `state.filter` değerini okur (`'ALL' | 'TODO' | 'DOING' | 'DONE'`).

- [ ] **Step 1: Filtre durumunu `state`'e ekle**

`state` nesnesine tek alan ekle: `filter: 'ALL'`. Başka hiçbir alan değişmez.

- [ ] **Step 2: Kabuk HTML'ini yaz**

`<body>` içeriğini şu yapıya getir (kimlikler korunur):

```html
<div class="wrap">
  <header class="head" id="head" hidden>
    <p class="brand">Düğünce · Görevlerim</p>
    <h1 class="greet" id="greeting"></h1>
    <p class="couple" id="coupleLine"></p>
  </header>
  <nav class="tabs" id="tabs" role="tablist" aria-label="Görev filtresi" hidden></nav>
  <div id="list" hidden></div>
  <div class="card" id="loading">…mevcut yükleniyor bloğu…</div>
  <div class="card" id="error" hidden>…mevcut hata bloğu…</div>
  <div class="card" id="empty" hidden>
    <div class="center"><p>Henüz size atanmış bir görev yok.</p></div>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
```

- [ ] **Step 3: `renderTabs` fonksiyonunu yaz**

İmza: `function renderTabs()`. `state.tasks`'ten sayaçları hesaplar (`TODO`, `DOING`, `DONE`), dört sekme üretir: `Tümü`, `Yapılacak`, `Yapılıyor`, `Bitti`. Her sekme `<button role="tab">` + `aria-selected`. Tıklanınca `state.filter` güncellenir ve `renderList()` çağrılır. Sayaç `aria-label`'da okunur (ör. "3 yapılacak görev").

- [ ] **Step 4: `renderList`'i filtreyi uygulayacak şekilde yaz**

`state.filter !== 'ALL'` ise `state.tasks`'i `status` ile süz. Boş sonuçta `#empty` göster, `#list` gizle. `state.tasks` boşsa da `#empty` göster. Liste yeniden çizilirken **kaydırma konumu korunur**: çizimden önce `#list.scrollTop` saklanır, sonra geri yazılır.

- [ ] **Step 5: Görev kartını yaz — `buildTask(task)`**

Kart `<article class="task" role="button" tabindex="0">`. İçinde `.t-title` (başlık), `.t-meta` (rozet + son tarih + mesaj sayısı). `status === 'DONE'` ise kart `done` sınıfı alır. Tıklama ve `Enter`/`Space` `openSheet(task.id)` çağırır. Uzun başlık `word-break: break-word` ile sarar.

- [ ] **Step 6: Tarayıcıda doğrula — filtre ve kartlar**

Sayfayı aç, konsolda sahte veri bas:

```js
state.tasks = [
  {id:'1', title:'Salon rezervasyonunu onayla', status:'DOING', description:'Otel ile görüşüldü.', dueDate:'2026-08-15'},
  {id:'2', title:'Çiçek siparişi ver', status:'TODO', description:null, dueDate:'2026-09-01'},
  {id:'3', title:'Davetiyeyi kontrol et', status:'DONE', description:null, dueDate:null}
]
$('head').hidden = false; $('tabs').hidden = false; $('list').hidden = false
$('greeting').textContent = 'Merhaba Fatma'
$('coupleLine').textContent = 'Ayşe & Mehmet düğünü için görevleriniz'
renderTabs(); renderList()
```

Expected: 3 kart, sekmelerde sayaçlar (Tümü 3 · Yapılacak 1 · Yapılıyor 1 · Bitti 1). "Yapılacak" sekmesine tıkla → yalnız 1 kart.

- [ ] **Step 7: Commit**

```bash
git add frontend/public/h/index.html
git commit -m "feat(helper): sabit baslik, sayacli filtre sekmeleri, gorev kartlari"
```

---

### Task 3: Görev sayfası (alttan açılır panel)

**Files:**
- Modify: `frontend/public/h/index.html` (sheet CSS + HTML + `openSheet`/`closeSheet`)

**Interfaces:**
- Consumes: Task 2'nin `buildTask`'ı (kart tıklaması `openSheet(task.id)` çağırır).
- Produces: `openSheet(taskId: string): void`, `closeSheet(): void`. DOM — `#sheet` (`role="dialog"`, `aria-modal="true"`), `.scrim`, `#sheetTitle`, `#sheetDesc`, `#statusRow`, `#chatLink`, `#chatCount`.

- [ ] **Step 1: Sheet HTML'ini ve CSS'ini ekle**

Spec §5.2'deki yapı. `.sheet` başlangıçta `transform: translateY(100%)`; `.on` sınıfı `translateY(0)`. `.scrim` `opacity: 0; pointer-events: none`; `.on` ile görünür. `prefers-reduced-motion` açıkken geçiş süresi `0`.

- [ ] **Step 2: `openSheet(taskId)` yaz**

`state.tasks`'ten görevi bulur; `#sheetTitle`'a başlığı, `#sheetDesc`'e açıklamayı (`textContent`; boşsa "Açıklama yok" + `empty` sınıfı) yazar. Durum butonlarını `aria-pressed` ile işaretler. Mesaj sayısını `state.messages[taskId]?.length ?? 0` ile `#chatCount`'a yazar. `#sheet.classList.add('on')`, scrim `.on`. Odağı `#sheet` içine taşır (`#sheetTitle.focus()` için `tabindex="-1"`). `Escape` dinleyicisi ekler.

- [ ] **Step 3: `closeSheet()` yaz**

`.on` sınıflarını kaldırır, `Escape` dinleyicisini kaldırır, odağı son açılan karta geri verir (`state.lastFocusedId`).

- [ ] **Step 4: Aşağı çekerek kapanmayı ekle**

Tutamak (`.handle`) üzerinde `touchstart`/`touchmove`/`touchend` dinleyicisi: parmak aşağı 80px'den fazla sürüklenirse `closeSheet()`. Daha azsa panel yerine döner. `prefers-reduced-motion` açıkken animasyonsuz kapanır.

- [ ] **Step 5: Tarayıcıda doğrula — açılma, kapanma, odak**

Kart tıkla → panel alttan gelir, başlık/açıklama/durum görünür. `Escape` → kapanır. Scrim'e tıkla → kapanır. Tutamağı aşağı çek → kapanır. Kapanınca odak karta döner (konsolda `document.activeElement.className`).

- [ ] **Step 6: Uzun içerikle doğrula (Review Focus #4)**

```js
state.tasks[0].title = 'Çok uzun bir görev başlığı '.repeat(8)
state.tasks[0].description = 'Uzun açıklama '.repeat(60)
renderList(); openSheet('1')
```

Expected: kart taşmaz, panel kaydırılabilir, içerik kesilmez.

- [ ] **Step 7: Commit**

```bash
git add frontend/public/h/index.html
git commit -m "feat(helper): alttan acilan gorev sayfasi"
```

---

### Task 4: Sohbet ekranı (tam ekran)

**Files:**
- Modify: `frontend/public/h/index.html` (chat CSS + HTML + `openChat`/`closeChat`/`renderMessages`)

**Interfaces:**
- Consumes: Task 3'ün `#chatLink`'i (`openChat(state.openTaskId)` çağırır).
- Produces: `openChat(taskId: string): void`, `closeChat(): void`, `renderMessages(taskId: string): void`. DOM — `#chat` (tam ekran katman), `#chatTitle`, `#chatSub`, `#msgs`, `#composer`, `#msgInput`, `#sendBtn`, `#backBtn`.

- [ ] **Step 1: Chat HTML'ini ve CSS'ini ekle**

Spec §5.2'deki yapı. `.chat-screen` başlangıçta `transform: translateX(100%)`; `.on` ile `translateX(0)`. `#msgs` `align-items: flex-start`, `flex: 1`, `overflow-y: auto`. Balonlar: `.msg.COUPLE` solda açık renk, `.msg.HELPER` sağda sage. Composer altta sabit; `padding-bottom` `env(safe-area-inset-bottom)` ile artırılır.

- [ ] **Step 2: `renderMessages(taskId)` yaz**

`state.messages[taskId]`'i eskiden yeniye basar (`textContent`). Her balonda `.who` (çift adı veya "Siz"). Boşsa "Henüz mesaj yok." göster. Çizimden sonra `#msgs.scrollTop = #msgs.scrollHeight`.

- [ ] **Step 3: `openChat` / `closeChat` yaz**

`openChat`: `state.openTaskId = taskId`, `#chatTitle`'a görev başlığı, `#chatSub`'a çift adı, `renderMessages`, `#chat.classList.add('on')`, mesajları yükle (`loadMessages`), odağı `#msgInput`'a ver. `closeChat`: `.on` kaldır, `state.openTaskId = null`, odağı `#chatLink`'e geri ver.

- [ ] **Step 4: Gönderme akışını bağla**

`#sendBtn` ve `Enter` → `sendMessage(state.openTaskId, text)`. Gönderirken buton `disabled`. Başarıda girdi temizlenir, mesaj listeye eklenir, `renderMessages` çağrılır.

- [ ] **Step 5: Tarayıcıda doğrula — sohbet açma ve balonlar**

Kart → panel → "Mesajlar" → sohbet tam ekran açılır. Geri oku → panele/listeye döner. Balonlar doğru tarafta, metin 14px, taşma yok.

- [ ] **Step 6: Commit**

```bash
git add frontend/public/h/index.html
git commit -m "feat(helper): tam ekran sohbet ekrani"
```

---

### Task 5: Durum değiştirme — iyimser güncelleme ve geri alma

**Files:**
- Modify: `frontend/public/h/index.html` (`changeStatus`)

**Interfaces:**
- Consumes: Task 3'ün `#statusRow` butonları, Task 2'nin `renderList`/`renderTabs`'ı.
- Produces: `changeStatus(taskId: string, status: string): Promise<void>` — imza mevcutla aynı.

- [ ] **Step 1: `changeStatus`'ü iyimser güncellemeye çevir**

Akış: eski durumu sakla → `state.tasks`'te durumu hemen değiştir → `renderTabs()` + kartı yerinde güncelle (tüm listeyi yeniden çizme, yalnız ilgili kartın rozetini ve `done` sınıfını değiştir) → `PATCH` gönder → başarısızsa eski duruma geri al + `toast('Durum değiştirilemedi', true)`.

- [ ] **Step 2: Ağ hatası yolunu doğrula (Review Focus #3)**

Konsolda `apiFetch`'i geçici olarak boz:

```js
const realFetch = apiFetch
window.apiFetch = async () => ({ ok: false, status: 500 })
```

Durum değiştir → kart eski durumuna döner, toast çıkar. Doğrulama sonrası `location.reload()`.

- [ ] **Step 3: Kaydırma konumunun korunduğunu doğrula (Review Focus #5)**

`state.tasks`'i 50 sahte görevle doldur, listeyi aşağı kaydır, bir kartın durumunu değiştir → `#list.scrollTop` değişmez.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/h/index.html
git commit -m "feat(helper): iyimser durum guncellemesi ve geri alma"
```

---

### Task 6: Yükleniyor / hata / boş durumları ve toast

**Files:**
- Modify: `frontend/public/h/index.html` (`show`, state CSS)

**Interfaces:**
- Consumes: Task 2'nin kabuğu.
- Produces: `show(which: 'loading'|'error'|'list'): void` — mevcut imza korunur, `#tabs` görünürlüğünü de yönetir.

- [ ] **Step 1: `show()`'u güncelle**

`'list'` iken `#head`, `#tabs`, `#list` görünür; diğerlerinde gizli. `'loading'` iken yalnız `#loading`. `'error'` iken yalnız `#error`.

- [ ] **Step 2: Durum ekranlarını yeni dilde biçimlendir**

Yükleniyor: spinner + "Yükleniyor…". Hata: başlık + açıklama + "Tekrar dene" butonu (`load()` çağırır). Boş: "Henüz size atanmış bir görev yok." Toast: mevcut davranış korunur, `prefers-reduced-motion` açıkken animasyonsuz.

- [ ] **Step 3: Üç durumu da tarayıcıda doğrula**

```js
show('loading')   // spinner
show('error')     // hata kartı + buton
show('list')      // normal
```

- [ ] **Step 4: Commit**

```bash
git add frontend/public/h/index.html
git commit -m "feat(helper): yukleniyor, hata ve bos durum ekranlari"
```

---

### Task 7: Oturum ve polling davranışını koru (regresyon kontrolü)

**Files:**
- Modify: `frontend/public/h/index.html` (yalnız gerekli düzeltmeler)

**Interfaces:**
- Consumes: Task 4'ün `renderMessages`'ı, Task 2'nin `renderList`'i.
- Produces: değişiklik yok — mevcut `openSession`, `restoreCsrf`, `apiFetch`, `startPolling`, `stopPolling`, `load` korunur.

- [ ] **Step 1: `load()`'un yeni DOM'a uyduğunu doğrula**

`load()` içindeki `$('greeting')`, `$('coupleLine')`, `show('list')`, `renderList()`, `startPolling()` çağrıları yeni kimliklerle uyumlu olmalı. `renderTabs()` çağrısını `renderList()`'ten önce ekle.

- [ ] **Step 2: Polling'in sohbet açıkken çalıştığını doğrula (Review Focus #2)**

Gerçek backend'e karşı: sohbeti aç, sonra sunucuda yeni mesaj oluştur (`POST /test/add-message` gibi bir kanca veya ikinci tarayıcı sekmesi). 15 sn içinde mesaj **sayfa yenilenmeden** görünmeli ve `#msgs` en alta inmeli.

Konsolda doğrulama:

```js
JSON.stringify({
  openTask: state.openTaskId,
  msgCount: document.querySelectorAll('.msg').length,
  atBottom: (() => { const m = document.getElementById('msgs');
    return m.scrollHeight - m.scrollTop - m.clientHeight < 8 })()
})
```

Expected: `msgCount` artmış, `atBottom: true`.

- [ ] **Step 3: Token'sız yenileme yolunu doğrula (Review Focus #1)**

Gerçek backend'e karşı (PGlite sunucusu) test: token'lı linkle aç → oturum açılır → URL'den hash silinir → **sayfayı yenile** → liste gelmeli, "geçersiz bağlantı" olmamalı.

- [ ] **Step 4: Sayfa yüklenirken yalnız GET atıldığını doğrula**

DevTools → Network. Sayfa yüklemesinde `POST`/`PATCH` isteği **olmamalı**; yalnız `GET /helper/tasks`.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/h/index.html
git commit -m "fix(helper): yeni DOM ile oturum ve polling uyumu"
```

---

### Task 8: Erişilebilirlik ve son doğrulama

**Files:**
- Modify: `frontend/public/h/index.html` (ARIA, klavye, kontrast)

**Interfaces:**
- Consumes: Task 1–7'nin tamamı.
- Produces: yok — son cila.

- [ ] **Step 1: Klavye ile tam tur**

`Tab` ile: filtre sekmeleri → kartlar → panel içi butonlar → sohbet. `Enter`/`Space` kart açar, `Escape` paneli kapatır. Odak halkası görünür olmalı (`:focus-visible`).

- [ ] **Step 2: Kontrast ölçümü**

Tarayıcı konsolunda her metin/arka plan çifti için oranı hesapla. Gövde metni ≥ 4.5:1, büyük başlık ≥ 3:1. Ölçülen değerleri commit mesajına yaz.

- [ ] **Step 3: Üç ekran boyutunda doğrula**

390×844 (iPhone 14), 360×800 (Android), 320×568 (küçük). Taşma, kırpılma, yatay kaydırma olmamalı.

- [ ] **Step 4: `prefers-reduced-motion` doğrula**

DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`. Panel ve sohbet animasyonsuz açılmalı.

- [ ] **Step 5: Gerçek backend'e karşı uçtan uca**

PGlite sunucusu + gerçek helper token ile: liste → durum değiştir → mesaj gönder → sayfa yenile → oturum korunur → polling yeni mesajı getirir.

- [ ] **Step 6: Commit**

```bash
git add frontend/public/h/index.html
git commit -m "a11y(helper): klavye, kontrast ve reduced-motion destegi"
```
