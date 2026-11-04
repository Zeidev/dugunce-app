/**
 * `map-link.mjs` testleri.
 *
 * NEDEN: kullanıcı "adres alanında haritada göster butonu olsun"
 * dedi. Butonun hiç görünmemesinin kök nedeni, linkin YALNIZ elle
 * girilen `mapUrl`'e bağlı olmasıydı — mobilde o alan yok, yani
 * pratikte hiç görünmüyordu. Bu testler adresten üretimi kilitler.
 *
 * Çalıştırma: node --test scripts/tests/map-link.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveMapUrl } from '../../frontend/public/d/map-link.mjs'

test('elle girilen mapUrl onceliklidir', () => {
  const url = resolveMapUrl({
    mapUrl: 'https://maps.app.goo.gl/abc123',
    venueName: 'Kır Düğün Salonu',
    venueAddress: 'İzmir',
  })
  assert.equal(url, 'https://maps.app.goo.gl/abc123')
})

test('mapUrl yoksa adres+mekandan Google Maps aramasi uretilir', () => {
  const url = resolveMapUrl({
    venueName: 'Kır Düğün Salonu',
    venueAddress: 'Urla, İzmir',
  })
  assert.ok(url.startsWith('https://www.google.com/maps/search/?api=1&query='))
  const q = decodeURIComponent(url.split('query=')[1])
  assert.equal(q, 'Kır Düğün Salonu, Urla, İzmir')
})

test('yalniz adres varsa da link uretilir', () => {
  const url = resolveMapUrl({ venueAddress: 'Alsancak, İzmir' })
  assert.ok(url.includes('maps/search'))
  assert.equal(decodeURIComponent(url.split('query=')[1]), 'Alsancak, İzmir')
})

test('yalniz mekan adi varsa da link uretilir', () => {
  const url = resolveMapUrl({ venueName: 'Hilton Bomonti' })
  assert.equal(decodeURIComponent(url.split('query=')[1]), 'Hilton Bomonti')
})

test('hicbir alan yoksa null doner', () => {
  assert.equal(resolveMapUrl({}), null)
  assert.equal(resolveMapUrl({ venueName: '   ', venueAddress: '' }), null)
  assert.equal(resolveMapUrl(null), null)
})

test('bosluklar kirpilir ve tekrarli virgul olusmaz', () => {
  const url = resolveMapUrl({
    venueName: '  Kır Salonu  ',
    venueAddress: '  Urla  ',
  })
  assert.equal(decodeURIComponent(url.split('query=')[1]), 'Kır Salonu, Urla')
})

test('javascript semasi reddedilir, adrese duser', () => {
  // `<a href>` icine `javascript:` koymak XSS'tir (SECURITY §8).
  const url = resolveMapUrl({
    mapUrl: 'javascript:alert(1)',
    venueAddress: 'İzmir',
  })
  assert.ok(!url.startsWith('javascript:'))
  assert.ok(url.includes('maps/search'))
})

test('data semasi reddedilir', () => {
  const url = resolveMapUrl({
    mapUrl: 'data:text/html,<script>alert(1)</script>',
    venueAddress: 'İzmir',
  })
  assert.ok(url.startsWith('https://www.google.com/maps/search/'))
})

test('http semasi kabul edilir', () => {
  const url = resolveMapUrl({ mapUrl: 'http://example.com/map' })
  assert.equal(url, 'http://example.com/map')
})

test('turkce karakterler ve emoji bozulmadan kodlanir', () => {
  const url = resolveMapUrl({ venueAddress: 'Şişli, İstanbul 🌸' })
  const q = decodeURIComponent(url.split('query=')[1])
  assert.equal(q, 'Şişli, İstanbul 🌸')
  // Emoji tek başına encode edilmeli (surrogate pair bozulmamalı).
  assert.ok(url.includes('%F0%9F%8C%B8'))
})
