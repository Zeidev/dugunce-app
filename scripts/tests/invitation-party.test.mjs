/**
 * Davetiye sayfası — kişi sayısı alanının görünürlüğü ve yarış koruması.
 *
 * NEDEN BU TEST:
 * Kullanıcı bildirdi: "kişi sayısını aktif edince geliyoruma basmadan
 * kişi sayısı alanı gözükmüyor ayrıca geliyoruma basıp kişi sayısını
 * değiştiremiyorum."
 *
 * İki ayrı hata vardı:
 *  A) `paintChoice()` `.show` sınıfını yalnız ATTENDING iken ekliyordu;
 *     davetli hiç seçim yapmadan alan görünmüyordu (oysa "kaç kişi
 *     geleceksiniz" sorusu seçimden ÖNCE de anlamlı).
 *  B) `sendRsvp` başında TÜM düğmeleri `disabled=true` yapıp sonda
 *     açıyordu; art arda tıklamada yalnız ilki işliyordu.
 *
 * Çalıştırma: node --test "scripts/tests/*.test.mjs"
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowSizeBox, nextPartySize } from '../../frontend/public/assets/js/invitation-party.mjs'

test('ozellik kapaliysa alan hic gorunmez', () => {
  assert.equal(shouldShowSizeBox({ partySizeEnabled: false, choice: 'ATTENDING' }), false)
  assert.equal(shouldShowSizeBox({ partySizeEnabled: false, choice: null }), false)
})

test('ozellik acikken HIC SECIM YAPILMAMISSA da alan gorunur', () => {
  // Bildirilen hatanın A şıkkı: "Geliyorum"a basmadan görünmüyordu.
  assert.equal(shouldShowSizeBox({ partySizeEnabled: true, choice: null }), true)
})

test('ozellik acikken ATTENDING de gorunur', () => {
  assert.equal(shouldShowSizeBox({ partySizeEnabled: true, choice: 'ATTENDING' }), true)
})

test('ozellik acikken DECLINED secilince alan gizlenir', () => {
  // "Gelemeyeceğim" diyen davetliye kaç kişi sorulmaz.
  assert.equal(shouldShowSizeBox({ partySizeEnabled: true, choice: 'DECLINED' }), false)
})

test('partySizeEnabled tanimsizsa acik sayilir (eski kayitlar)', () => {
  assert.equal(shouldShowSizeBox({ choice: null }), true)
})

test('artirma siniri asmaz', () => {
  assert.equal(nextPartySize(3, 5, +1), 4)
  assert.equal(nextPartySize(5, 5, +1), 5)
  assert.equal(nextPartySize(6, 5, +1), 5)
})

test('azaltma 1 in altina inmez', () => {
  assert.equal(nextPartySize(2, 5, -1), 1)
  assert.equal(nextPartySize(1, 5, -1), 1)
  assert.equal(nextPartySize(0, 5, -1), 1)
})

test('azami 1 ise artirma yapmaz', () => {
  assert.equal(nextPartySize(1, 1, +1), 1)
})
