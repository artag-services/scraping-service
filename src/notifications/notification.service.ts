// src/notifications/notification.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { NotificationAdapter } from './interfaces/notification-adapter.interface'

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name)
  private adapters: Map<string, NotificationAdapter> = new Map()

  /**
   * ✨ NEW: Inject all adapters that will be registered on module init
   */
  constructor(
    private readonly availableAdapters: NotificationAdapter[] = [],
  ) {}

  /**
   * ✨ NEW: Auto-register all injected adapters when module initializes
   * This ensures all adapters are available before any service uses them
   */
  onModuleInit(): void {
    if (this.availableAdapters.length === 0) {
      this.logger.warn('⚠️ No notification adapters provided - service will have no adapters')
      return
    }

    for (const adapter of this.availableAdapters) {
      this.registerAdapter(adapter)
    }

    this.logger.log(`✅ NotificationService initialized with ${this.availableAdapters.length} adapters`)
  }

  /**
   * Registra un nuevo adaptador de notificación
   */
  registerAdapter(adapter: NotificationAdapter): void {
    const name = adapter.getName()
    this.adapters.set(name, adapter)
    this.logger.log(`✅ Adapter registered: ${name}`)
  }

  /**
   * Obtiene todos los adaptadores registrados
   */
  getAdapters(): Map<string, NotificationAdapter> {
    return this.adapters
  }

  /**
   * Obtiene un adaptador específico
   */
  getAdapter(name: string): NotificationAdapter | undefined {
    return this.adapters.get(name)
  }

  /**
   * Envía una notificación a través de un adaptador específico
   */
  async send(
    adapterName: string,
    userId: string,
    message: string | any,
    options?: Record<string, any>,
  ): Promise<void> {
    const adapter = this.adapters.get(adapterName)

    if (!adapter) {
      throw new Error(`Adapter '${adapterName}' not found. Available adapters: ${Array.from(this.adapters.keys()).join(', ')}`)
    }

    const isAvailable = await adapter.isAvailable(userId)
    if (!isAvailable) {
      throw new Error(`Adapter '${adapterName}' not available for user ${userId}`)
    }

    return adapter.send(userId, message, options)
  }

  /**
   * Intenta enviar a través de múltiples adaptadores (fallback)
   * Devuelve true si al menos uno fue exitoso
   */
  async sendMultiple(
    adapterNames: string[],
    userId: string,
    message: string | any,
    options?: Record<string, any>,
  ): Promise<boolean> {
    const errors: Record<string, string> = {}

    for (const adapterName of adapterNames) {
      try {
        await this.send(adapterName, userId, message, options)
        this.logger.log(`Message sent successfully via ${adapterName} to ${userId}`)
        return true
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        errors[adapterName] = errorMessage
        this.logger.warn(`Failed to send via ${adapterName}: ${errorMessage}`)
      }
    }

    this.logger.error(`All adapters failed for user ${userId}:`, errors)
    return false
  }

  /**
   * Valida todos los adaptadores registrados
   */
  async validateAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}

    for (const [name, adapter] of this.adapters) {
      try {
        results[name] = await adapter.validate()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`Validation failed for adapter ${name}: ${errorMessage}`)
        results[name] = false
      }
    }

    return results
  }
}
