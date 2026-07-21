function privacyUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'player.vimeo.com') return null;
    if (!/^\/video\/\d+/.test(url.pathname)) return null;
    url.searchParams.set('dnt', '1');
    url.searchParams.set('title', '0');
    url.searchParams.set('byline', '0');
    url.searchParams.set('portrait', '0');
    return url.toString();
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
  const source = privacyUrl(url);
  if (!source)
    return (
      <p className="dp-qb-video-unavailable" role="status">
        This solution video is unavailable.
      </p>
    );
  return (
    <div className="dp-qb-video-frame">
      <iframe
        src={source}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
      />
    </div>
  );
}
