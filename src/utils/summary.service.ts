// src/utils/summary.service.ts

import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name)
  private readonly maxChars = 4096 // Límite de WhatsApp
  private readonly emojiMap: Record<string, string> = {
    price: '💰',
    cost: '💰',
    cost_price: '💰',
    title: '📦',
    product: '📦',
    name: '📝',
    description: '📝',
    rating: '⭐',
    stars: '⭐',
    availability: '✅',
    stock: '✅',
    available: '✅',
    in_stock: '✅',
    url: '🔗',
    link: '🔗',
    image: '🖼️',
    date: '📅',
    time: '⏰',
    author: '👤',
    reviews: '💬',
  }

  /**
   * Genera un resumen inteligente de los datos scrapeados
   */
  summarize(data: Record<string, any>): string {
    if (!data || Object.keys(data).length === 0) {
      return '❌ No se encontraron datos'
    }

    // Check if this is auto-scraped data (has title, sections, links, text)
    if (this.isAutoScrapedData(data)) {
      return this.summarizeAutoScrapedData(data)
    }

    // Otherwise, use traditional field-by-field summarization
    return this.summarizeCustomData(data)
  }

  /**
   * Detecta si los datos vienen de auto-scraping
   */
  private isAutoScrapedData(data: Record<string, any>): boolean {
    return (
      'title' in data &&
      'sections' in data &&
      'links' in data &&
      'text' in data
    )
  }

  /**
   * Resume datos auto-scrapeados con estructura especial
   */
  private summarizeAutoScrapedData(data: Record<string, any>): string {
    const lines: string[] = []

    // Title
    if (data.title) {
      lines.push(`📦 Título: ${data.title}`)
    }

    // Sections
    if (Array.isArray(data.sections) && data.sections.length > 0) {
      lines.push(`\n📋 Secciones:`)
      data.sections.slice(0, 5).forEach((section: string) => {
        lines.push(`  • ${section}`)
      })
      if (data.sections.length > 5) {
        lines.push(`  ... (+${data.sections.length - 5} más)`)
      }
    }

    // Links
    if (Array.isArray(data.links) && data.links.length > 0) {
      lines.push(`\n🔗 Enlaces (${data.links.length} encontrados):`)
      data.links.slice(0, 5).forEach((link: any) => {
        lines.push(`  • ${link.text || 'Sin texto'}: ${link.href}`)
      })
      if (data.links.length > 5) {
        lines.push(`  ... (+${data.links.length - 5} más)`)
      }
    }

    // Text preview
    if (data.text) {
      lines.push(`\n📝 Contenido:`)
      const preview = data.text.substring(0, 300)
      lines.push(preview + (data.text.length > 300 ? '...' : ''))
    }

    let summary = lines.join('\n')

    // Si es muy largo, truncar
    if (summary.length > this.maxChars) {
      summary = this.truncate(summary, this.maxChars)
    }

    return summary || '❌ No se pudieron extraer datos'
  }

  /**
   * Resume datos personalizados (con selectores personalizados)
   */
  private summarizeCustomData(data: Record<string, any>): string {
    const lines: string[] = []

    for (const [key, value] of Object.entries(data)) {
      const emoji = this.getEmoji(key)
      const formattedValue = this.formatValue(value)

      if (formattedValue) {
        lines.push(`${emoji} ${this.capitalize(key)}: ${formattedValue}`)
      }
    }

    let summary = lines.join('\n')

    // Si es muy largo, truncar
    if (summary.length > this.maxChars) {
      summary = this.truncate(summary, this.maxChars)
    }

    return summary || '❌ No se pudieron extraer datos'
  }

  /**
   * Genera un resumen con encabezado y pie
   */
  summarizeWithHeader(data: Record<string, any>, url: string): string {
    const header = `📊 Resultados de Scraping\n🔗 ${url}\n${'='.repeat(50)}\n`
    const summary = this.summarize(data)
    const footer = `\n${'='.repeat(50)}\n⏰ ${new Date().toLocaleString('es-ES')}`

    return header + summary + footer
  }

  /**
   * Divide un texto en chunks de máximo maxChars caracteres
   */
  chunk(text: string, maxChars: number = this.maxChars): string[] {
    if (text.length <= maxChars) {
      return [text]
    }

    const chunks: string[] = []
    let currentChunk = ''

    const lines = text.split('\n')

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk.trim())
        }
        currentChunk = line + '\n'
      } else {
        currentChunk += line + '\n'
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }

  /**
   * Detecta el tipo de dato y lo formatea apropiadamente
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return ''
    }

    if (Array.isArray(value)) {
      return value.slice(0, 5).join(', ') + (value.length > 5 ? ` ... (+${value.length - 5})` : '')
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }

    const str = String(value).trim()

    // URLs
    if (str.startsWith('http')) {
      return `[Link](${str})`
    }

    // Precios
    if (this.looksLikePrice(str)) {
      return `**${str}**`
    }

    // Ratings
    if (this.looksLikeRating(str)) {
      return `⭐ ${str}/5`
    }

    return str
  }

  /**
   * Obtiene el emoji apropiado para un campo
   */
  private getEmoji(key: string): string {
    const lowerKey = key.toLowerCase()

    for (const [keyword, emoji] of Object.entries(this.emojiMap)) {
      if (lowerKey.includes(keyword)) {
        return emoji
      }
    }

    return '•'
  }

  /**
   * Capitaliza una cadena
   */
  private capitalize(str: string): string {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /**
   * Trunca un texto manteniendo líneas completas
   */
  private truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text
    }

    const truncated = text.substring(0, maxChars - 10)
    const lastNewline = truncated.lastIndexOf('\n')

    if (lastNewline > maxChars * 0.8) {
      return truncated.substring(0, lastNewline) + '\n\n... (truncado)'
    }

    return truncated + '\n\n... (truncado)'
  }

  /**
   * Detecta si parece un precio
   */
  private looksLikePrice(str: string): boolean {
    return /\$|€|£|¥|\d+\.\d{2}|\d+,\d{2}/.test(str)
  }

  /**
   * Detecta si parece un rating
   */
  private looksLikeRating(str: string): boolean {
    const num = parseFloat(str)
    return !isNaN(num) && num >= 0 && num <= 10
  }
}
