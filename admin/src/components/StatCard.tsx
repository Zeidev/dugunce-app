/**
 * `StatCard` — dashboard'un sayısal kartı (spec §9.1).
 *
 * BÜYÜK SAYI serif 32px, ETİKET uppercase 11px `--muted`, ALT SATIR
 * delta. Stiller `app.css` içindeki mevcut `.stat*` sınıflarında —
 * burada yeniden yazılmadı.
 */

interface StatCardProps {
  /** Kartın ne saydığı — kullanıcıya gösterilen metin. */
  label: string
  /** Ham sayı; biçimlendirme burada yapılır. */
  value: number
  /**
   * Alt satır (ör. "+5 / 7g", "%7,9"). Verilmezse satır HİÇ
   * render edilmez: boş bir `.stat__delta` kartın yüksekliğini
   * değiştirir ve ızgarada hizasız görünür.
   */
  delta?: string
}

/**
 * Sayıyı tr-TR biçiminde yazar (`12500` → `12.500`).
 *
 * NEDEN `toLocaleString('tr-TR')`: dashboard'da 4-5 haneli davetli
 * sayıları var; operatörün hane sayması gerekmesin. Sabit yerel ayar
 * kullanılıyor — tarayıcı diline bırakmak, aynı panelde iki farklı
 * biçim (1,234 vs 1.234) üretirdi.
 */
function formatCount(value: number): string {
  return value.toLocaleString('tr-TR')
}

export function StatCard({ label, value, delta }: StatCardProps): React.JSX.Element {
  return (
    <article className="stat">
      <div className="stat__label">{label}</div>
      {/*
        SIFIR GİZLENMEZ. "—" göstermek sıfır ile "veri yok"u
        karıştırırdı; dashboard'da gerçek sıfır bilgi taşır
        (ör. hiç premium satışı yok).
      */}
      <div className="stat__value">{formatCount(value)}</div>
      {delta !== undefined && <div className="stat__delta">{delta}</div>}
    </article>
  )
}
