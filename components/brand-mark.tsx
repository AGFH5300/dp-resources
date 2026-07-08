import Image from 'next/image'
import logoMark from '@/app/ChatGPT Image Jul 8, 2026, 11_40_32 PM.png'

export function BrandMark({ className = '', title }: { className?: string; title?: string }) {
  return (
    <Image
      src={logoMark}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      className={`inline-block aspect-square shrink-0 object-contain ${className}`.trim()}
      priority
    />
  )
}
