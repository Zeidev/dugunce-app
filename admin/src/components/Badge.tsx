/**
 * `Badge` — plan ve hesap durumu rozeti.
 *
 * KURAL (spec §9.1, brief §4): RENK TEK BAŞINA ANLATMAZ. Metin
 * (`PREMIUM` / `FREE` / `ACTIVE` / `SUSPENDED`) HER ZAMAN yazılır.
 *
 * NEDEN: renk körü bir operatör altın ile gri rozeti ayırt edemez.
 * Panelin tek işi premium açmak olduğu için yanlış düğünü premium
 * sanmak gerçek bir iş hatasıdır. Bu yüzden metin dekorasyon değil,
 * sözleşmenin parçası.
 *
 * BİLİNMEYEN DEĞER: backend yeni bir plan/durum eklerse rozet BOŞ
 * kalmaz; ham değer yazılır ve nötr (`badge--warn`) renk kullanılır.
 * Sessizce gizlemek, operatörün "planı yok" sanmasına yol açardı.
 */

export type BadgeKind = 'plan' | 'status'

interface BadgeProps {
  kind: BadgeKind
  /** Ham değer — backend ne döndüyse o yazılır. */
  value: string
}

/**
 * Değer → sınıf eşlemesi.
 *
 * NEDEN `Record` + `??` : `noUncheckedIndexedAccess` açık olduğu için
 * indeksleme `undefined` dönebilir; `??` ile bilinmeyen değer nötr
 * renge düşer. `switch` de olurdu ama tablo hâli tek bakışta okunur.
 */
const PLAN_CLASSES: Record<string, string> = {
  PREMIUM: 'badge--premium',
  FREE: 'badge--free',
}

const STATUS_CLASSES: Record<string, string> = {
  ACTIVE: 'badge--active',
  SUSPENDED: 'badge--suspended',
}

export function Badge({ kind, value }: BadgeProps): React.JSX.Element {
  const table = kind === 'plan' ? PLAN_CLASSES : STATUS_CLASSES
  const variant = table[value] ?? 'badge--warn'

  return (
    <span className={`badge ${variant}`}>
      {/*
        Metin her zaman görünür — `aria-hidden` YOK, `sr-only` YOK.
        Renk körü kullanıcı da gözle gören kullanıcı da aynı metni okur.
      */}
      {value}
    </span>
  )
}
