/**
 * Bağımlılık sınıflandırması — üretim kurulumu bozulmasın.
 *
 * `npm ci --omit=dev` ile kurulum yapıldığında yalnızca `dependencies`
 * gelir. Çalışma zamanında import edilen her paket orada olmalı,
 * yoksa uygulama serv00'da "Cannot find module" ile açılmaz.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.js')) out.push(full)
  }
  return out
}

/** `import ... from 'pkg'` ve `import('pkg')` desenlerinden paket adı çıkarır. */
function importedPackages(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const pkgs: string[] = []
  const re = /from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const spec = m[1] ?? m[2]
    if (!spec || spec.startsWith('.') || spec.startsWith('node:')) continue
    // scoped paket: @scope/name
    const parts = spec.split('/')
    pkgs.push(spec.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]!)
  }
  return pkgs
}

describe('üretim bağımlılıkları', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const runtimeDeps = new Set(Object.keys(pkg.dependencies ?? {}))

  it('dist/ içinde import edilen her paket dependencies\'te', () => {
    const distDir = join(ROOT, 'dist')
    const files = walk(distDir)
    expect(files.length).toBeGreaterThan(0)

    const used = new Set<string>()
    for (const f of files) for (const p of importedPackages(f)) used.add(p)

    // node: builtin değil, dependencies'te olmalı
    const missing = [...used].filter((p) => !runtimeDeps.has(p)).sort()
    expect(missing).toEqual([])
  })

  it('drizzle-orm çalışma zamanı bağımlılığı (dist onu import ediyor)', () => {
    expect(runtimeDeps.has('drizzle-orm')).toBe(true)
  })

  it('drizzle-kit dev bağımlılığı (sadece migration üretir)', () => {
    expect(pkg.devDependencies?.['drizzle-kit']).toBeDefined()
    expect(runtimeDeps.has('drizzle-kit')).toBe(false)
  })

  it('tsx dev bağımlılığı (üretimde derlenmiş JS çalışır)', () => {
    expect(pkg.devDependencies?.['tsx']).toBeDefined()
    expect(runtimeDeps.has('tsx')).toBe(false)
  })
})
