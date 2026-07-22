import React from 'react';
import { ExternalLink } from 'lucide-react';

function publicVideoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'player.vimeo.com') return null;
    const match = url.pathname.match(/^\/video\/(\d+)/);
    if (!match) return null;
    const hash = url.searchParams.get('h');
    return `https://vimeo.com/${match[1]}${hash ? `/${hash}` : ''}`;
  } catch {
    return null;
  }
}

export function SolutionVideo({
  url,
  title,
}: {
  url: string;
  title: string;
}) {
  const source = publicVideoUrl(url);
  if (!source)
    return (
      <p className="dp-qb-video-unavailable" role="status">
        This solution video is unavailable.
      </p>
    );
  return (
    <div className="dp-qb-video-link">
      <p>This video cannot be embedded because of its privacy settings.</p>
      <a href={source} target="_blank" rel="noreferrer noopener">
        <ExternalLink className="size-4" /> Open {title} on Vimeo
      </a>
    </div>
  );
}
