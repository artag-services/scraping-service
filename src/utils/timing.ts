import { Logger } from '@nestjs/common'

export function Timed() {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value
    const className = (target as any).constructor?.name ?? 'Unknown'

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const logger = new Logger(className)
      const start = Date.now()
      logger.log(`⏱ ${propertyKey} — START`)

      try {
        const result = await original.apply(this, args)
        const elapsed = Date.now() - start
        logger.log(`✅ ${propertyKey} — ${elapsed}ms`)
        return result
      } catch (error) {
        const elapsed = Date.now() - start
        const msg = error instanceof Error ? error.message : String(error)
        logger.error(`❌ ${propertyKey} — ${elapsed}ms — FAILED: ${msg}`)
        throw error
      }
    }

    return descriptor
  }
}
