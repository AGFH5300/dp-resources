import { readFileSync, writeFileSync } from 'node:fs';

const path = 'app/settings/settings-centre.tsx';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing expected ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one ${label}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "import { Spinner } from '@/components/ui/spinner';\n",
  "import { AvatarEditor } from '@/components/account/avatar-editor';\nimport { Spinner } from '@/components/ui/spinner';\n",
  'AvatarEditor import anchor',
);

replaceOnce(
  "const AVATAR_MAX_BYTES = 2 * 1024 * 1024;\nconst AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);",
  "const AVATAR_MAX_BYTES = 2 * 1024 * 1024;\nconst AVATAR_SOURCE_MAX_BYTES = 12 * 1024 * 1024;\nconst AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);",
  'avatar size constants',
);

replaceOnce(
  "  const [confirmPassword, setConfirmPassword] = useState('');\n\n  const avatarInputRef = useRef<HTMLInputElement>(null);",
  "  const [confirmPassword, setConfirmPassword] = useState('');\n  const [avatarEditorFile, setAvatarEditorFile] = useState<File | null>(null);\n\n  const avatarInputRef = useRef<HTMLInputElement>(null);",
  'avatar editor state anchor',
);

replaceOnce(
  "  async function uploadAvatar(file: File | undefined) {\n    if (!file) return;\n",
  "  function selectAvatarFile(file: File | undefined) {\n    if (!file) return;\n\n    if (!AVATAR_TYPES.has(file.type)) {\n      toast.error('Use a JPG, PNG, or WebP image.');\n      if (avatarInputRef.current) avatarInputRef.current.value = '';\n      return;\n    }\n    if (file.size < 1 || file.size > AVATAR_SOURCE_MAX_BYTES) {\n      toast.error('Choose an image that is 12 MB or smaller.');\n      if (avatarInputRef.current) avatarInputRef.current.value = '';\n      return;\n    }\n\n    setAvatarEditorFile(file);\n  }\n\n  async function uploadAvatar(file: File | undefined) {\n    if (!file) return false;\n",
  'avatar upload function anchor',
);

replaceOnce(
  "      toast.success('Profile image updated.');\n    } catch (error) {\n      toast.error(\n        error instanceof Error ? error.message : 'Unable to upload profile image.',\n      );\n    } finally {",
  "      toast.success('Profile image updated.');\n      return true;\n    } catch (error) {\n      toast.error(\n        error instanceof Error ? error.message : 'Unable to upload profile image.',\n      );\n      return false;\n    } finally {",
  'avatar upload return handling',
);

replaceOnce(
  "                  JPG, PNG or WebP. Maximum 2 MB.",
  "                  Choose a JPG, PNG or WebP up to 12 MB. Crop, zoom and rotate it before saving.",
  'avatar helper text',
);

replaceOnce(
  "                    onChange={(event) =>\n                      void uploadAvatar(event.target.files?.[0])\n                    }",
  "                    onChange={(event) =>\n                      selectAvatarFile(event.target.files?.[0])\n                    }",
  'avatar file input handler',
);

replaceOnce(
  "      </section>\n    </div>\n  );\n}",
  "      </section>\n\n      <AvatarEditor\n        file={avatarEditorFile}\n        busy={saving === 'avatar'}\n        onCancel={() => {\n          setAvatarEditorFile(null);\n          if (avatarInputRef.current) avatarInputRef.current.value = '';\n        }}\n        onSave={uploadAvatar}\n      />\n    </div>\n  );\n}",
  'settings root closing anchor',
);

writeFileSync(path, source);
console.log('Applied avatar editor integration patch.');
