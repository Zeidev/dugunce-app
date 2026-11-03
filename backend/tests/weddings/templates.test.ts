import { describe, it, expect } from 'vitest'
import {
  TEMPLATES,
  FONTS,
  DEFAULT_TEMPLATE,
  RECOMMENDED_FONT,
  normalizeTemplate,
  normalizeFont,
} from '../../src/weddings/templates.js'

describe('templates registry', () => {
  it('11 şablon tanımlı', () => {
    expect(TEMPLATES).toHaveLength(11)
  })

  it('10 font tanımlı', () => {
    expect(FONTS).toHaveLength(10)
  })

  it('her şablonun önerilen fontu font listesinde', () => {
    for (const t of TEMPLATES) {
      expect(FONTS).toContain(RECOMMENDED_FONT[t])
    }
  })

  it('bilinmeyen şablon varsayılana düşer', () => {
    expect(normalizeTemplate('YOK')).toBe(DEFAULT_TEMPLATE)
    expect(normalizeTemplate(undefined)).toBe(DEFAULT_TEMPLATE)
    expect(normalizeTemplate(null)).toBe(DEFAULT_TEMPLATE)
    expect(normalizeTemplate(42)).toBe(DEFAULT_TEMPLATE)
  })

  it('geçerli şablon aynen döner', () => {
    expect(normalizeTemplate('GECE')).toBe('GECE')
  })

  it('boş font şablonun önerilen fontunu verir', () => {
    expect(normalizeFont('GECE', '')).toBe(RECOMMENDED_FONT['GECE'])
    expect(normalizeFont('GECE', undefined)).toBe(RECOMMENDED_FONT['GECE'])
  })

  it('geçersiz font önerilen fonta düşer', () => {
    expect(normalizeFont('GECE', 'YOK_FONT')).toBe(RECOMMENDED_FONT['GECE'])
  })

  it('geçerli font aynen döner', () => {
    expect(normalizeFont('GECE', 'BODONI')).toBe('BODONI')
  })

  it('geçersiz şablonla gelen geçerli font korunur', () => {
    expect(normalizeFont('YOK_SABLON', 'BODONI')).toBe('BODONI')
  })
})
