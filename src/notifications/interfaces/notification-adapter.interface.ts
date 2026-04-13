// src/notifications/interfaces/notification-adapter.interface.ts

/**
 * Interfaz base para todos los adaptadores de notificación
 * Permite agregar fácilmente nuevos canales (Email, Slack, Notion, etc)
 */

export interface NotificationAdapter {
  /**
   * Identificador único del adaptador (ej: 'whatsapp', 'email', 'slack')
   */
  getName(): string

  /**
   * Envía un mensaje a través del canal
   * @param userId ID del usuario
   * @param message Contenido del mensaje (puede ser string u objeto)
   * @param options Opciones específicas del canal
   */
  send(userId: string, message: string | any, options?: Record<string, any>): Promise<void>

  /**
   * Verifica si el usuario tiene este canal configurado
   * @param userId ID del usuario
   */
  isAvailable(userId: string): Promise<boolean>

  /**
   * Valida que la configuración del adaptador sea correcta
   */
  validate(): Promise<boolean>
}
