/**
 * Admin API'sinin BEYAZ LİSTE görünümleri.
 *
 * NEDEN AYRI DOSYA: yanıt gövdesi her yerde aynı şekle sahip olmalı. Dönüşüm
 * route içine dağılırsa bir uçta `...row` yaymak makul görünür ve
 * `passwordHash` / `purchaseToken` istemciye sızar.
 *
 * KURAL: her fonksiyon nesneyi ALAN ALAN kurar. `...row` ASLA.
 * Yayma kullanılsaydı tabloya eklenen her yeni gizli sütun (ör. gelecekte
 * `totpSecret` benzeri bir alan) SESSİZCE yanıta girerdi — bunu yakalayan
 * bir test yazmak da mümkün olmazdı, çünkü sızıntı "doğru" görünürdü.
 *
 * Bu dosya bilinçli olarak Drizzle'a bağımlı değildir: dönüşüm, satırın
 * nereden geldiğini bilmez. Böylece route katmanı da store katmanı da
 * aynı fonksiyonları kullanır.
 */

/**
 * Admin hesabının istemciye giden görünümü.
 *
 * `passwordHash`, `totpSecret`, `recoveryCodes`, `failedAttempts`,
 * `lockedUntil` YOK. Sayaç/kilit bilgisi operasyonel bir iç detaydır;
 * panelde gösterilmez (giriş akışı da yalnız başarılı durumu döner).
 */
export interface AdminView {
  id: string
  email: string
  displayName: string
  role: string
  status: string
  lastLoginAt: Date | null
}

/** `toAdminView` girdisi — satırın ihtiyaç duyulan alanları. */
export interface AdminViewSource {
  id: string
  email: string
  displayName: string
  role: string
  status: string
  lastLoginAt: Date | null
}

/** Kullanıcı listesi/detayı görünümü — `weddingCount` hesaplanmış alan. */
export interface UserView {
  id: string
  email: string
  displayName: string
  status: string
  createdAt: Date
  weddingCount: number
}

/** `toUserView` girdisi — `emailVerifiedAt`, `updatedAt` gibi alanlar dışarıda kalır. */
export interface UserViewSource {
  id: string
  email: string
  displayName: string
  status: string
  createdAt: Date
  weddingCount: number
}

/**
 * Düğün görünümü.
 *
 * `purchaseToken` (Play makbuzu), `purchasePlatform`, `purchaseDate`,
 * `venueAddress`, `program` YOK. Makbuz token'ı bir ödeme kanıtıdır;
 * panelde göstermek gereksiz bir sızıntı yüzeyidir.
 */
export interface WeddingView {
  id: string
  coupleNames: string
  weddingDate: Date
  plan: string
  guestCount: number
  memberCount: number
  createdAt: Date
}

/** `toWeddingView` girdisi — sayımlar store'da alt sorguyla hesaplanır. */
export interface WeddingViewSource {
  id: string
  coupleNames: string
  weddingDate: Date
  plan: string
  guestCount: number
  memberCount: number
  createdAt: Date
}

/**
 * Denetim kaydı görünümü — SALT OKUMA.
 *
 * `metadata` olduğu gibi döner; oraya parola/token yazmamak YAZAN tarafın
 * sorumluluğudur (`AuditEntry` dokümantasyonu). Görünüm bunu filtrelemez,
 * çünkü filtrelemek "metadata güvenli" yanılsaması üretirdi.
 */
export interface AuditView {
  id: string
  actorType: string
  actorId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  createdAt: Date
}

/** `toAuditView` girdisi. */
export interface AuditViewSource {
  id: string
  actorType: string
  actorId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: unknown
  ip: string | null
  createdAt: Date
}

/** Admin satırı → beyaz liste görünümü. */
export function toAdminView(row: AdminViewSource): AdminView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    lastLoginAt: row.lastLoginAt,
  }
}

/** Kullanıcı satırı → beyaz liste görünümü. */
export function toUserView(row: UserViewSource): UserView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    createdAt: row.createdAt,
    // Sayım DB'de yapılır; burada yalnız taşınır. `?? 0` savunması:
    // alt sorgu bir gün NULL dönerse yanıt `null` değil `0` olsun.
    weddingCount: Number(row.weddingCount ?? 0),
  }
}

/** Düğün satırı → beyaz liste görünümü. */
export function toWeddingView(row: WeddingViewSource): WeddingView {
  return {
    id: row.id,
    coupleNames: row.coupleNames,
    weddingDate: row.weddingDate,
    plan: row.plan,
    guestCount: Number(row.guestCount ?? 0),
    memberCount: Number(row.memberCount ?? 0),
    createdAt: row.createdAt,
  }
}

/**
 * Audit satırı → beyaz liste görünümü.
 *
 * `metadata` JSONB olduğu için tipi `unknown`; nesne değilse (bozuk/eski
 * kayıt) `null` döneriz — istemciye dizi/skalar sızdırmak yerine boş.
 */
export function toAuditView(row: AuditViewSource): AuditView {
  return {
    id: row.id,
    actorType: row.actorType,
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata:
      row.metadata !== null && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : null,
    ip: row.ip,
    createdAt: row.createdAt,
  }
}
