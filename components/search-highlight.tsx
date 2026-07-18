export function SearchHighlight({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const part = query.trim();
  if (!part) return text;
  const index = text.toLowerCase().indexOf(part.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-amber-100 text-amber-950">
        {text.slice(index, index + part.length)}
      </mark>
      {text.slice(index + part.length)}
    </>
  );
}
