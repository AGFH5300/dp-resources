import JSZip from 'jszip';

export type PptxAudioBlob = {
  name: string;
  mediaPath: string;
  blob: Blob;
};

export type PptxAudioBlobsBySlide = Record<number, PptxAudioBlob[]>;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeXmlAttribute(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function readXmlAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? decodeXmlAttribute(match[1] ?? match[2] ?? '') : '';
}

function resolveZipPath(fromPath: string, target: string) {
  const decodedTarget = decodeXmlAttribute(target).replaceAll('\\', '/');
  const base = fromPath.slice(0, fromPath.lastIndexOf('/') + 1);
  const source = decodedTarget.startsWith('/') ? decodedTarget.slice(1) : `${base}${decodedTarget}`;
  const resolved: string[] = [];

  for (const part of source.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }

  return resolved.join('/');
}

function audioMimeType(mediaPath: string) {
  const extension = mediaPath.split('.').pop()?.toLowerCase();
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'm4a' || extension === 'aac') return 'audio/mp4';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

export async function extractPptxAudioBlobs(buffer: ArrayBuffer): Promise<PptxAudioBlobsBySlide> {
  const zip = await JSZip.loadAsync(buffer);
  const bySlide: PptxAudioBlobsBySlide = {};
  const seen = new Set<string>();
  const blobCache = new Map<string, Promise<Blob>>();
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));

  await Promise.all(slideFiles.map(async (slidePath) => {
    const slideNumber = Number(slidePath.match(/slide(\d+)\.xml$/i)?.[1] || 0);
    if (!slideNumber) return;

    const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const relsFile = zip.file(relsPath);
    const slideFile = zip.file(slidePath);
    if (!relsFile || !slideFile) return;

    const [relsXml, slideXml] = await Promise.all([relsFile.async('text'), slideFile.async('text')]);
    const relationshipTags = relsXml.match(/<Relationship\b[^>]*\/?\s*>/gi) ?? [];

    for (const tag of relationshipTags) {
      const id = readXmlAttribute(tag, 'Id');
      const rawTarget = readXmlAttribute(tag, 'Target');
      const type = readXmlAttribute(tag, 'Type');
      if (!id || !rawTarget) continue;
      if (!/audio|media/i.test(type) && !/\.(mp3|m4a|wav|aac|ogg)$/i.test(rawTarget)) continue;

      const referencePattern = new RegExp(`(?:r:embed|r:link)\\s*=\\s*["']${escapeRegExp(id)}["']`, 'i');
      if (!referencePattern.test(slideXml)) continue;

      const mediaPath = resolveZipPath(slidePath, rawTarget);
      const media = zip.file(mediaPath);
      if (!media) continue;

      const dedupeKey = `${slideNumber}:${mediaPath.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      let blobPromise = blobCache.get(mediaPath);
      if (!blobPromise) {
        blobPromise = media.async('uint8array').then((bytes) => new Blob([bytes], { type: audioMimeType(mediaPath) }));
        blobCache.set(mediaPath, blobPromise);
      }

      const blob = await blobPromise;
      (bySlide[slideNumber] ||= []).push({
        name: mediaPath.split('/').pop() || `Slide ${slideNumber} audio`,
        mediaPath,
        blob,
      });
    }
  }));

  return bySlide;
}
