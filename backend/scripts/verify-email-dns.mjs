/**
 * Brevo domain authentication — DNS doğrulaması.
 *
 * API anahtarı GEREKTİRMEZ; yalnızca DNS kayıtlarını denetler.
 * Kullanım: `npm run verify:email`
 *
 * Neyi kontrol eder:
 * - Brevo code (sahiplik kanıtı)
 * - DKIM 1 ve 2 (CNAME → 2048-bit anahtar, İKİSİ de gerekli)
 * - DMARC
 * - SPF (opsiyonel — Brevo shared IP'de zorunlu tutmuyor)
 *
 * DKIM bir CNAME'dir, TXT değil. `dig TXT mail._domainkey` boş döner —
 * bu bir hata değil, yanlış sorgudur. Bu betik CNAME zincirini çözer.
 */
import { resolveTxt, resolveCname } from 'node:dns/promises'

const DOMAIN = 'dugunce.com.tr'
const checks = []

async function txt(host) {
  try { return (await resolveTxt(host)).map(r => r.join('')) } catch { return [] }
}
async function cname(host) {
  try { return await resolveCname(host) } catch { return [] }
}

// 1. Brevo code
const root = await txt(DOMAIN)
const hasCode = root.some(r => r.startsWith('brevo-code:'))
checks.push(['Brevo code (TXT @)', hasCode, root.find(r=>r.startsWith('brevo-code:')) ? 'var' : 'YOK'])

// 2. SPF — uyarı, hata değil.
// Brevo shared IP'de kimlik doğrulamayı Brevo code + DKIM ile yapar.
// SPF alignment ve ileride toplu gönderim için önerilir.
const hasSpf = root.some(r => r.startsWith('v=spf1'))
checks.push([
  'SPF (TXT @)',
  true, // bloklamaz
  hasSpf ? root.find(r => r.startsWith('v=spf1')) : 'yok — önerilir, zorunlu değil',
])

// 3. DKIM 1 & 2
for (const sel of ['brevo1._domainkey', 'brevo2._domainkey']) {
  const cn = await cname(`${sel}.${DOMAIN}`)
  const t = await txt(`${sel}.${DOMAIN}`)
  const ok = cn.length > 0 && t.length > 0 && t[0].includes('k=rsa')
  checks.push([`DKIM ${sel}`, ok, ok ? `CNAME→${cn[0]}, ${t[0].length} char key` : 'ÇÖZÜLMÜYOR'])
}

// 4. DMARC
const dmarc = await txt(`_dmarc.${DOMAIN}`)
const hasDmarc = dmarc.some(r => r.startsWith('v=DMARC1'))
checks.push(['DMARC', hasDmarc, hasDmarc ? dmarc[0] : 'YOK'])

// Rapor
let fail = 0
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${name.padEnd(28)} ${detail}`)
  if (!ok) fail++
}
console.log()
console.log(fail === 0 ? '✅ Brevo domain authentication: HAZIR' : `❌ ${fail} kayıt eksik`)
process.exit(fail === 0 ? 0 : 1)
