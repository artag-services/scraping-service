// src/scraper/stealth.config.ts

import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import BlockResourcesPlugin from 'puppeteer-extra-plugin-block-resources'

/**
 * Configura Puppeteer con plugins anti-bot
 */
export function configureStealth() {
  puppeteer.use(StealthPlugin())

  // Bloquear recursos pesados para mejorar velocidad
  puppeteer.use(
    BlockResourcesPlugin({
      blockedTypes: new Set(['image', 'stylesheet', 'font', 'media']),
    }),
  )

  return puppeteer
}

/**
 * Opciones de lanzamiento optimizadas para scraping en Docker
 */
export const BROWSER_LAUNCH_OPTIONS = {
  headless: 'new' as const,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--allow-running-insecure-content',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
    '--disable-background-networking',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-extension-assets',
    '--disable-geolocation',
    '--disable-plugins',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--password-store=basic',
  ],
  defaultViewport: { width: 1920, height: 1080 },
  timeout: 60000, // 60 segundos para iniciar el browser
}

/**
 * User-Agents variados para evitar detección
 */
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
]

/**
 * Obtiene un User-Agent aleatorio
 */
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}
