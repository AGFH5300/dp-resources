import { readFileSync, writeFileSync } from 'node:fs';

const path = 'app/settings/settings-centre.tsx';
let source = readFileSync(path, 'utf8');

const before = `  async function uploadAvatar(file: File | undefined) {
    if (!file) return false;

    if (!AVATAR_TYPES.has(file.type)) {
      toast.error('Use a JPG, PNG, or WebP image.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }
    if (file.size < 1 || file.size > AVATAR_MAX_BYTES) {
      toast.error('Profile images must be 2 MB or smaller.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }
`;

const after = `  async function uploadAvatar(file: File | undefined) {
    if (!file) return false;

    if (!AVATAR_TYPES.has(file.type)) {
      toast.error('Use a JPG, PNG, or WebP image.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return false;
    }
    if (file.size < 1 || file.size > AVATAR_MAX_BYTES) {
      toast.error('Profile images must be 2 MB or smaller.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return false;
    }
`;

if (!source.includes(before)) throw new Error('Missing avatar upload validation anchor');
source = source.replace(before, after);
writeFileSync(path, source);
console.log('Finalized avatar editor upload return type.');
