// src/http/gateway.client.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

/**
 * Gateway HTTP Client
 * 
 * Handles all communication with the Gateway service.
 * Used by ScrapingListener to send notifications asynchronously.
 * 
 * No retries - fails fast and logs errors.
 * All calls are fire-and-forget (don't wait for response in critical path).
 */
@Injectable()
export class GatewayClient {
  private readonly logger = new Logger(GatewayClient.name)
  private readonly client: AxiosInstance
  private readonly gatewayUrl: string
  private readonly timeout: number = 30000 // 30 seconds

  constructor(private readonly configService: ConfigService) {
    this.gatewayUrl = this.configService.get('GATEWAY_URL', 'http://gateway:3000')

    this.logger.log(`GatewayClient initialized with URL: ${this.gatewayUrl}`)

    // Create axios instance with default settings
    this.client = axios.create({
      baseURL: this.gatewayUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Send cleaned scraping data to Gateway for Notion integration
   * 
   * This is async fire-and-forget:
   * - Send data to Gateway
   * - Gateway will handle publishing to RabbitMQ → Notion service
   * - Gateway will handle sending WhatsApp when Notion responds
   * - If this call fails, log error and continue
   * 
   * @param userId User ID for WhatsApp notification
   * @param title Page title
   * @param url Source URL
   * @param data Cleaned scraping data
   * @param notionPageId Optional parent page ID
   * @returns requestId from Gateway
   */
  async notifyNotion(payload: {
    userId: string
    title: string
    url?: string
    data: Record<string, any>
    notionPageId?: string
  }): Promise<{ requestId: string; message: string; timestamp: string } | null> {
    try {
      this.logger.log(`📤 GatewayClient.notifyNotion() - START`)
      this.logger.log(`   - userId: ${payload.userId}`)
      this.logger.log(`   - title: ${payload.title}`)
      this.logger.log(`   - url: ${payload.url}`)
      this.logger.log(`   - data keys: ${Object.keys(payload.data).join(', ')}`)

      // Prepare request to Gateway
      const endpoint = '/api/scraping/notify-notion'
      this.logger.log(`🚀 POST ${this.gatewayUrl}${endpoint}`)

      // Send to Gateway (no await in critical path - async notification)
      const response = await this.client.post(endpoint, payload)

      this.logger.log(`✅ GatewayClient.notifyNotion() - SUCCESS`)
      this.logger.log(`   - status: ${response.status}`)
      this.logger.log(`   - requestId: ${response.data?.requestId}`)
      this.logger.log(`   - message: ${response.data?.message}`)

      return response.data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const statusCode = axios.isAxiosError(error) ? error.response?.status : 'N/A'

      this.logger.error(`❌ GatewayClient.notifyNotion() - FAILED`)
      this.logger.error(`   - endpoint: /api/scraping/notify-notion`)
      this.logger.error(`   - error: ${errorMessage}`)
      this.logger.error(`   - status: ${statusCode}`)
      this.logger.error(`   - userId: ${payload.userId}`)
      this.logger.error(`   - title: ${payload.title}`)

      // Don't throw - return null to continue execution
      return null
    }
  }

  /**
   * Send WhatsApp message via Gateway (for future use)
   * Currently not used - Gateway listener handles WhatsApp notifications
   * 
   * @param userId User ID
   * @param message Message text
   */
  async sendWhatsAppMessage(userId: string, message: string): Promise<void> {
    try {
      this.logger.log(`📱 GatewayClient.sendWhatsAppMessage() - START`)
      this.logger.log(`   - userId: ${userId}`)
      this.logger.log(`   - messageLength: ${message.length}`)

      const endpoint = '/api/v1/messages/send'
      const payload = {
        channel: 'whatsapp',
        recipients: [userId],
        message,
      }

      this.logger.log(`🚀 POST ${this.gatewayUrl}${endpoint}`)

      await this.client.post(endpoint, payload)

      this.logger.log(`✅ WhatsApp message sent via Gateway`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Failed to send WhatsApp via Gateway: ${errorMessage}`)
      // Don't throw - continue execution
    }
  }

  /**
   * Health check endpoint (optional)
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health')
      return response.status === 200
    } catch (error) {
      this.logger.warn(`Gateway health check failed`)
      return false
    }
  }
}
