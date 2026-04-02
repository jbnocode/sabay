import type { NextRequest } from 'next/server'

/** Headers Places/Maps expect when the API key has referrer restrictions (browser → Next proxy → AWS). */
export function amazonLocationForwardHeaders(req: NextRequest): Record<string, string> {
  const referer =
    req.headers.get('referer')?.trim() ||
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    'http://localhost:3000/'
  let origin = req.headers.get('origin')?.trim()
  if (!origin) {
    try {
      origin = new URL(referer).origin
    } catch {
      origin = 'http://localhost:3000'
    }
  }
  return { Referer: referer, Origin: origin }
}
