// src/rate-limit/rate-limiter.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RateLimitStatus } from '../common/types'

interface UserLimit {
  used: number
  resetTime: Date
}

@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name)
  private dailyLimit: number
  private windowHours: number
  private userLimits: Map<string, UserLimit> = new Map()

  constructor(private configService: ConfigService) {
    this.dailyLimit = this.configService.get('RATE_LIMIT_DAILY', 10)
    this.windowHours = this.configService.get('RATE_LIMIT_WINDOW_HOURS', 24)

    this.logger.log(`Rate limiter initialized: ${this.dailyLimit} requests per ${this.windowHours} hours`)

    // Limpiar límites expirados cada 5 minutos
    setInterval(() => this.cleanupExpiredLimits(), 5 * 60 * 1000)
  }

  /**
   * Verifica si el usuario ha excedido el límite
   */
  isLimited(userId: string): boolean {
    const limit = this.userLimits.get(userId)

    if (!limit) {
      return false
    }

    if (new Date() > limit.resetTime) {
      this.userLimits.delete(userId)
      return false
    }

    return limit.used >= this.dailyLimit
  }

  /**
   * Obtiene el estado del límite del usuario
   */
  getStatus(userId: string): RateLimitStatus {
    const limit = this.userLimits.get(userId)

    if (!limit || new Date() > limit.resetTime) {
      return {
        userId,
        used: 0,
        limit: this.dailyLimit,
        resetTime: this.getResetTime(),
        isExceeded: false,
      }
    }

    return {
      userId,
      used: limit.used,
      limit: this.dailyLimit,
      resetTime: limit.resetTime,
      isExceeded: limit.used >= this.dailyLimit,
    }
  }

  /**
   * Registra un uso del usuario
   */
  recordUsage(userId: string): void {
    let limit = this.userLimits.get(userId)

    if (!limit || new Date() > limit.resetTime) {
      limit = {
        used: 0,
        resetTime: this.getResetTime(),
      }
    }

    limit.used++
    this.userLimits.set(userId, limit)

    this.logger.debug(`User ${userId} usage recorded: ${limit.used}/${this.dailyLimit}`)
  }

  /**
   * Reinicia el límite de un usuario (administrador)
   */
  resetUser(userId: string): void {
    this.userLimits.delete(userId)
    this.logger.log(`Rate limit reset for user ${userId}`)
  }

  /**
   * Obtiene el tiempo de reinicio
   */
  private getResetTime(): Date {
    const now = new Date()
    const resetTime = new Date(now.getTime() + this.windowHours * 60 * 60 * 1000)
    return resetTime
  }

  /**
   * Limpia los límites expirados
   */
  private cleanupExpiredLimits(): void {
    const now = new Date()
    let cleaned = 0

    for (const [userId, limit] of this.userLimits.entries()) {
      if (now > limit.resetTime) {
        this.userLimits.delete(userId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limits`)
    }
  }

  /**
   * Obtiene estadísticas del rate limiter
   */
  getStats(): { totalUsers: number; limitedUsers: number } {
    let limitedUsers = 0

    for (const limit of this.userLimits.values()) {
      if (limit.used >= this.dailyLimit) {
        limitedUsers++
      }
    }

    return {
      totalUsers: this.userLimits.size,
      limitedUsers,
    }
  }
}
