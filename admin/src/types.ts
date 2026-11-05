/**
 * Admin API yanıt tipleri.
 *
 * KAYNAK: `backend/src/admin/view.ts` — alanlar oradan BİREBİR alınır,
 * uydurulmaz. Backend `Date` döndürüyor ama JSON'da ISO **string** olur;
 * bu yüzden burada `Date` değil `string` yazılır (`new Date(x)` ile ayrıştır).
 *
 * NEDEN AYRI DOSYA: `api.ts` hem taşıma (fetch/CSRF/hata) hem şekil
 * dönüşümü yapıyor. Tipler aynı dosyada kalsaydı sayfalar `api.ts`'i
 * import etmek zorunda kalırdı — oysa bir tablo bileşeni yalnız `UserRow`
 * tipine ihtiyaç duyar, ağ katmanına değil.
 *
 * KURAL: `view.ts`'te OLMAYAN alan buraya EKLENMEZ. Backend beyaz liste
 * döndürüyor (`purchaseToken`, `passwordHash` yok); burada o alanları
 * tanımlamak, olmayan bir veriye göre UI yazılmasına yol açar.
 */

/**
 * `toAdminView` — oturumdaki yönetici.
 *
 * `lastLoginAt` null olabilir: hesap hiç giriş yapmamışsa backend null döner.
 */
export interface Admin {
  id: string
  email: string
  displayName: string
  role: string
  status: string
  lastLoginAt: string | null
}

/**
 * `toUserView` — kullanıcı satırı.
 *
 * `weddingCount` HESAPLANMIŞ alan (backend'de alt sorgu); tabloda
 * gösterilir ama yazılamaz.
 */
export interface UserRow {
  id: string
  email: string
  displayName: string
  status: string
  createdAt: string
  weddingCount: number
}

/**
 * `toWeddingView` — düğün satırı.
 *
 * `guestCount` / `memberCount` HESAPLANMIŞ; `purchaseToken` YOK (backend
 * makbuz token'ını beyaz listeden çıkarıyor).
 */
export interface WeddingRow {
  id: string
  coupleNames: string
  weddingDate: string
  plan: string
  guestCount: number
  memberCount: number
  createdAt: string
}

/**
 * `toAuditView` — denetim kaydı (SALT OKUMA).
 *
 * `metadata` JSONB: nesne ya da `null`. Backend nesne olmayan değerleri
 * `null`a indiriyor, bu yüzden burada `Record<string, unknown> | null`.
 */
export interface AuditRow {
  id: string
  actorType: string
  actorId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

/**
 * `GET /users`, `/weddings`, `/audit-logs` ortak zarfı.
 *
 * `nextCursor` **null** olabilir (son sayfa). `undefined` ile
 * karıştırılmamalı: "Daha fazla" butonu `=== null` kontrolüyle gizlenir,
 * `undefined` bu kontrolü deler ve buton sonsuza kadar görünür kalır.
 */
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/**
 * `GET /overview` — davetli sayaçları.
 *
 * DİKKAT: brief'teki tabloda `guests` tek satır görünüyor ama GERÇEK
 * sözleşme bir nesne: `store.countGuests()` `{total, attending, declined,
 * pending}` döner ve route bunu olduğu gibi yayınlar (spec §6.2 ile aynı).
 * Kaynak kod esas alındı.
 */
export interface GuestStats {
  total: number
  attending: number
  declined: number
  pending: number
}

/** `GET /overview` — dashboard sayaçları + son 20 denetim kaydı. */
export interface Overview {
  users: { total: number; newLast7Days: number }
  weddings: { total: number; active: number; premium: number; free: number }
  guests: GuestStats
  recentAudit: AuditRow[]
}

/**
 * `GET /weddings/:id` içindeki üye satırı.
 *
 * Kaynak: `panel-store.ts` → `WeddingMemberView`. `email` panelde
 * operatöre gerektiği için beyaz listede.
 */
export interface WeddingMemberRow {
  userId: string
  displayName: string
  email: string
  role: string
  joinedAt: string
}

/** `GET /users/:id` — kullanıcı + üyesi olduğu düğünler. */
export interface UserDetail {
  user: UserRow
  weddings: WeddingRow[]
}

/** `GET /weddings/:id` — düğün + üyeler + masraf sayısı. */
export interface WeddingDetail {
  wedding: WeddingRow
  members: WeddingMemberRow[]
  expenseCount: number
}
