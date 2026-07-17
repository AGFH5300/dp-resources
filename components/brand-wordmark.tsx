import Link from 'next/link';

export function BrandWordmark({
  href = '/auth/login',
  className = '',
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="DP Resources"
      className={`dp-brand-wordmark inline-flex items-center ${className}`.trim()}
    >
      <img
        src="/brand/dp-wordmark.png"
        alt=""
        aria-hidden="true"
        className="dp-wordmark-light h-[3.1em] w-auto object-contain"
      />
      <img
        src="/brand/dp-wordmark-dark.png"
        alt=""
        aria-hidden="true"
        className="dp-wordmark-dark h-[3.1em] w-auto object-contain"
      />
    </Link>
  );
}
