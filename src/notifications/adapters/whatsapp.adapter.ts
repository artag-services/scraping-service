// src/notifications/adapters/whatsapp.adapter.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { NotificationAdapter } from '../interfaces/notification-adapter.interface'

@Injectable()
export class WhatsAppAdapter implements NotificationAdapter {
  private readonly logger = new Logger(WhatsAppAdapter.name)
  private readonly gatewayUrl: string
  private readonly webhookToken: string
  private readonly maxRetries: number = 3
  private readonly retryDelay: number = 1000

  constructor(private configService: ConfigService) {
    this.gatewayUrl = this.configService.get('GATEWAY_URL', 'http://gateway:3000')
    this.webhookToken = this.configService.get('GATEWAY_WEBHOOK_TOKEN', '')
  }

  getName(): string {
    return 'whatsapp'
  }

  async send(userId: string, message: string, options?: Record<string, any>): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.sendToGateway(userId, message)
        this.logger.log(`WhatsApp message sent successfully to ${userId}`)
        return
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        lastError = err
        this.logger.warn(
          `WhatsApp send attempt ${attempt}/${this.maxRetries} failed for ${userId}: ${err.message}`,
        )

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw new Error(
      `Failed to send WhatsApp message to ${userId} after ${this.maxRetries} attempts: ${lastError?.message}`,
    )
  }

  async isAvailable(userId: string): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.gatewayUrl}/api/whatsapp/check-user`,
        { userId },
        {
          headers: { Authorization: `Bearer ${this.webhookToken}` },
          timeout: 5000,
        },
      )
      return response.data?.available === true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Error checking WhatsApp availability for ${userId}: ${errorMessage}`)
      return false
    }
  }

  async validate(): Promise<boolean> {
    try {
      if (!this.gatewayUrl) {
        this.logger.error('GATEWAY_URL not configured')
        return false
      }
      if (!this.webhookToken) {
        this.logger.warn('GATEWAY_WEBHOOK_TOKEN not configured, continuing anyway')
      }
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`WhatsApp adapter validation failed: ${errorMessage}`)
      return false
    }
  }

  private async sendToGateway(userId: string, message: string): Promise<void> {
    const payload = {
      userId,
      message,
      timestamp: new Date().toISOString(),
    }

    const response = await axios.post(
      `${this.gatewayUrl}/api/whatsapp/send-direct`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.webhookToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    )

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Gateway returned status ${response.status}: ${response.data?.message || 'Unknown error'}`)
    }

    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Gateway returned failure response')
    }
  }
}
