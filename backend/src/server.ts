// .env dosyasını EN BAŞTA yükle — diğer importlar process.env okur.
// `dotenv/config` yan etki importu; sırası kritik.
import 'dotenv/config'

import { loadEnv } from './config/env.js'
import { createApp } from './app.js'
import { logger } from './lib/logger.js'
import { closeDb } from './db/client.js'

/**
 * Sunucu giriş noktası.
 *
 * serv00'da Phusion Passenger bu dosyayı çalıştırır; `listen()` çağrısı
 * Passenger'ın kendi soketini kullanmasını engellemez (doküman: "Port
 * reservation is not needed when running the application with nodejs type").
 */
function main(): void {
  const env = loadEnv()
  const app = createApp()

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      'dugunce-api başladı',
    )
  })

  // Graceful shutdown
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'kapatılıyor')
    server.close(() => {
      closeDb()
        .then(() => {
          logger.info('temiz kapanış')
          process.exit(0)
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'kapanış sırasında hata')
          process.exit(1)
        })
    })

    // Zorla kapanış için güvenlik ağı
    setTimeout(() => {
      logger.error('zorla kapatılıyor')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'işlenmeyen promise reddi')
  })
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'yakalanmayan istisna — kapatılıyor')
    process.exit(1)
  })
}

main()
