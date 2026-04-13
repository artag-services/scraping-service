// src/notifications/adapters/email.adapter.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { NotificationAdapter } from '../interfaces/notification-adapter.interface'

@Injectable()
export class EmailAdapter implements NotificationAdapter {
  private readonly logger = new Logger(EmailAdapter.name)
  private transporter: nodemailer.Transporter | null = null

  constructor(private configService: ConfigService) {
    this.initializeTransporter()
  }

  getName(): string {
    return 'email'
  }

  async send(userId: string, message: string | any, options?: Record<string, any>): Promise<void> {
    if (!this.transporter) {
      throw new Error('Email adapter not configured')
    }

    try {
      const emailTo = options?.emailTo || userId
      const subject = options?.subject || 'Scraping Results'
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message, null, 2)

      await this.transporter.sendMail({
        from: this.configService.get('EMAIL_FROM', 'noreply@scraper.local'),
        to: emailTo,
        subject,
        html: this.formatEmailBody(messageStr),
        text: messageStr,
      })

      this.logger.log(`Email sent successfully to ${emailTo}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to send email to ${userId}: ${errorMessage}`)
      throw error
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    // Email is available if transporter is configured
    return this.transporter !== null
  }

  async validate(): Promise<boolean> {
    try {
      if (!this.transporter) {
        this.logger.warn('Email adapter not configured')
        return false
      }

      await this.transporter.verify()
      this.logger.log('Email adapter validated successfully')
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Email adapter validation failed: ${errorMessage}`)
      return false
    }
  }

  private initializeTransporter(): void {
    const smtpHost = this.configService.get('EMAIL_SMTP_HOST')
    const smtpPort = this.configService.get('EMAIL_SMTP_PORT', 587)
    const emailUser = this.configService.get('EMAIL_USER')
    const emailPass = this.configService.get('EMAIL_PASS')

    if (!smtpHost || !emailUser || !emailPass) {
      this.logger.warn('Email configuration incomplete, adapter disabled')
      return
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      })

      this.logger.log('Email adapter initialized')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to initialize email adapter: ${errorMessage}`)
    }
  }

  private formatEmailBody(message: string): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Scraping Results</h2>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
            <pre style="white-space: pre-wrap; word-wrap: break-word;">${this.escapeHtml(message)}</pre>
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            This is an automated message from the Scraping Service
          </p>
        </body>
      </html>
    `
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }
    return text.replace(/[&<>"']/g, (char) => map[char])
  }
}
