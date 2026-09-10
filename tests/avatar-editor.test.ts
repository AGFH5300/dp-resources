import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../lib/content-security-policy';

const read = (path: string) => readFileSync(path, 'utf8');
const settings = read('app/settings/settings-centre.tsx');
const editor = read('components/account/avatar-editor.tsx');

describe('profile picture display and editing', () => {
  it('allows signed Supabase avatar images through the site CSP', () => {
    const csp = contentSecurityPolicy('avatarNonce123');
    const imageDirective =
      csp.split('; ').find((directive) => directive.startsWith('img-src ')) || '';

    expect(imageDirective).toContain("'self'");
    expect(imageDirective).toContain('data:');
    expect(imageDirective).toContain('blob:');
    expect(imageDirective).toContain('https://*.supabase.co');
  });

  it('opens an editor before the selected image is uploaded', () => {
    expect(settings).toContain("import { AvatarEditor } from '@/components/account/avatar-editor'");
    expect(settings).toContain('setAvatarEditorFile(file)');
    expect(settings).toContain('<AvatarEditor');
    expect(settings).toContain('onSave={uploadAvatar}');
    expect(settings).toContain('AVATAR_SOURCE_MAX_BYTES = 12 * 1024 * 1024');
    expect(settings).toContain('Crop, zoom and rotate it before saving.');
  });

  it('provides crop positioning, zoom, rotation, reset and a circular preview', () => {
    expect(editor).toContain('role="dialog"');
    expect(editor).toContain('aria-modal="true"');
    expect(editor).toContain('Drag to reposition');
    expect(editor).toContain('onPointerDown={startDrag}');
    expect(editor).toContain('onPointerMove={moveDrag}');
    expect(editor).toContain('type="range"');
    expect(editor).toContain('Profile picture zoom');
    expect(editor).toContain('rotate(-90)');
    expect(editor).toContain('rotate(90)');
    expect(editor).toContain('Reset');
    expect(editor).toContain('rounded-full');
  });

  it('renders the chosen crop to a compact upload instead of sending the original image', () => {
    expect(editor).toContain('const OUTPUT_SIZE = 512');
    expect(editor).toContain("document.createElement('canvas')");
    expect(editor).toContain('context.translate(');
    expect(editor).toContain('context.rotate(');
    expect(editor).toContain('context.scale(');
    expect(editor).toContain("canvasBlob(canvas, 'image/webp', 0.9)");
    expect(editor).toContain("new File([blob], fileName, { type })");
    expect(settings).toContain("fetch('/api/account/avatar'");
    expect(settings).toContain('body: file');
  });
});
