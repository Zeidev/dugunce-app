/**
 * Davetiye karşılama metni.
 *
 * KULLANICI KARARI (2026-11-04):
 * - Davetiyede davetlinin ADI YAZMAZ. Sebep: isim yanlış yazılırsa
 *   (ör. "Ayşe" yerine "Ayse", yanlış kişiye gönderim) davetiye
 *   mahcup ediyor; ayrıca tek bir link birden çok kişiye iletilebiliyor.
 * - Ücretsiz sürümde SABİT genel mesaj.
 * - Premium'da çift kendi metnini yazar.
 *
 * Premium kapısı SUNUCUDA: `plan` alanı istemciden gelmez
 * (`weddingPatchSchema` yalnız beyaz listedeki alanları kabul eder),
 * bu yüzden istemci metni gönderse bile ücretsiz düğünde genel mesaj
 * görünür.
 */

/** Ücretsiz sürümün sabit karşılama metni. */
export const DEFAULT_GREETING = 'Sizi düğünümüzde görmek isteriz.'

/** Özel karşılama metninin azami uzunluğu. */
export const MAX_GREETING_LENGTH = 300

/**
 * Davetliye gösterilecek karşılama metnini çözer.
 *
 * @param plan Düğünün planı (`FREE` | `PREMIUM`).
 * @param invitationMessage Çiftin yazdığı metin (yalnız premium'da geçerli).
 */
export function resolveGreeting(
  plan: string | null | undefined,
  invitationMessage: string | null | undefined,
): string {
  const isPremium = plan === 'PREMIUM'

  // Ücretsiz: özel metin YOK SAYILIR. Kapı burada — istemciye güvenmek
  // "premium özelliği herkese açık" demek olurdu.
  if (!isPremium) return DEFAULT_GREETING

  const text = typeof invitationMessage === 'string' ? invitationMessage.trim() : ''
  return text === '' ? DEFAULT_GREETING : text
}
