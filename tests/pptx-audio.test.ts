import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractPptxAudioBlobs } from '@/lib/pptx-audio';

describe('PPTX embedded audio extraction', () => {
  it('deduplicates audio and Microsoft media relationships that target the same file', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide43.xml',
      '<p:sld xmlns:p="p" xmlns:r="r" xmlns:p14="p14"><p:cSld><a:audioFile xmlns:a="a" r:link="rIdAudio"/><p14:media r:embed="rIdMedia"/></p:cSld></p:sld>',
    );
    zip.file(
      'ppt/slides/_rels/slide43.xml.rels',
      '<Relationships><Relationship Target="../media/media1.mp3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Id="rIdAudio"/><Relationship Id="rIdMedia" Target="../media/media1.mp3" Type="http://schemas.microsoft.com/office/2007/relationships/media"/></Relationships>',
    );
    zip.file('ppt/media/media1.mp3', new Uint8Array([0x49, 0x44, 0x33]));

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const result = await extractPptxAudioBlobs(buffer);

    expect(result[43]).toHaveLength(1);
    expect(result[43][0].name).toBe('media1.mp3');
    expect(result[43][0].mediaPath).toBe('ppt/media/media1.mp3');
    expect(result[43][0].blob.type).toBe('audio/mpeg');
    expect(result[43][0].blob.size).toBe(3);
  });

  it('ignores media relationships that the slide does not reference', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="p"/>');
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      '<Relationships><Relationship Id="rIdUnused" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/unused.mp3"/></Relationships>',
    );
    zip.file('ppt/media/unused.mp3', new Uint8Array([1, 2, 3]));

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const result = await extractPptxAudioBlobs(buffer);

    expect(result[1]).toBeUndefined();
  });
});
