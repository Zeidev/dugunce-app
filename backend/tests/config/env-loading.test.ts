/**
 * .env dosyası gerçekten okunuyor mu?
 *
 * `dotenv` package.json'da bağımlılık olarak duruyordu ama hiçbir yerde
 * çağrılmıyordu — yani `.env` dosyası ölüydü ve `npm run dev` her
 * seferinde "DATABASE_URL: Required" ile patlıyordu.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '../..')

describe('.env yükleme', () => {
  it('server.ts dotenv yapılandırmasını içe aktarır', () => {
    const src = readFileSync(join(ROOT, 'src/server.ts'), 'utf8')
    // dotenv/config veya dotenv.config() çağrısı olmalı
    const hasDotenv = /dotenv/.test(src)
    expect(hasDotenv).toBe(true)
  })

  it('dotenv, diğer importlardan ÖNCE yüklenir', () => {
    const src = readFileSync(join(ROOT, 'src/server.ts'), 'utf8')
    const lines = src.split('\n')
    const dotenvLine = lines.findIndex((l) => /dotenv/.test(l))
    const envLine = lines.findIndex((l) => /config\/env/.test(l))
    expect(dotenvLine).toBeGreaterThanOrEqual(0)
    // .env process.env'ye yazılmadan loadEnv çağrılırsa değerler boş gelir
    expect(dotenvLine).toBeLessThan(envLine)
  })

  it('dotenv bağımlılığı package.json\'da var', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.['dotenv']).toBeDefined()
  })
})
