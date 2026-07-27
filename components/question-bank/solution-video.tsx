import React from 'react';
import { ExternalLink } from 'lucide-react';

function providerLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function solutionReference(value: string) {
  if (!value.startsWith('dp-solution-id://')) return null;
  const raw = value.slice('dp-solution-id://'.length);
  const slash = raw.indexOf('/');
  const provider = decodeURIComponent(slash >= 0 ? raw.slice(0, slash) : raw);
  const identifier = decodeURIComponent(slash >= 0 ? raw.slice(slash + 1) : '');
  return { provider, identifier };
}

function publicVideoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.hostname === 'player.vimeo.com') {
      const match = url.pathname.match(/^\/video\/(\d+)/);
      if (!match) return null;
      const hash = url.searchParams.get('h');
      return {
        url: `https://vimeo.com/${match[1]}${hash ? `/${hash}` : ''}`,
        label: 'Open on Vimeo',
        isVimeo: true,
      };
    }
    return {
      url: url.toString(),
      label: `Open on ${url.hostname.replace(/^www\./, '')}`,
      isVimeo: false,
    };
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
  const reference = solutionReference(url);
  if (reference)
    return (
      <div className="dp-qb-video-link" role="status">
        <p>
          This solution is stored as a provider reference and does not include a
          directly playable URL.
        </p>
        <dl className="mt-3 grid gap-1 text-sm">
          <div>
            <dt className="inline font-medium">Provider: </dt>
            <dd className="inline">{providerLabel(reference.provider)}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Solution ID: </dt>
            <dd className="inline break-all font-mono text-xs">
              {reference.identifier || 'Not supplied'}
            </dd>
          </div>
        </dl>
      </div>
    );

  const source = publicVideoUrl(url);
  if (!source)
    return (
      <p className="dp-qb-video-unavailable" role="status">
        This solution video is unavailable.
      </p>
    );
  return (
    <div className="dp-qb-video-link">
      <p>
        {source.isVimeo
          ? 'This video cannot be embedded because of its privacy settings.'
          : 'This video opens on its verified provider page.'}
      </p>
      <a href={source.url} target="_blank" rel="noreferrer noopener">
        <ExternalLink className="size-4" /> {source.label}: {title}
      </a>
    </div>
  );
}
