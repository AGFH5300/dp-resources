import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-static'

const source = path.join(process.cwd(), 'public', 'brand', 'ChatGPT Image Jul 9, 2026, 11_26_06 AM.png')

export async function GET() {
  const image = await readFile(source)
  return new Response(image, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
