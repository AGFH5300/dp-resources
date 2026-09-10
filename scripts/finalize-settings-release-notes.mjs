import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing expected ${label} in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one ${label} in ${path}`);
  }
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length));
}

replaceOnce(
  'lib/changelog.ts',
  `const historicalSummaries: Record<string, string[]> = {\n  '2026-09-09': [\n    'Added a complete Settings & Account Centre for profile details, private profile pictures, IB subjects and HL/SL levels, exam session and year, email and password changes, notification controls, privacy information, and DP Resources display preferences.',\n    'Added per-user controls for Library source tags, Library resource-type labels, Question Bank source tags, expanded source information, support notifications, and automatic What’s new release highlights.',\n    'Strengthened account security with current-password verification for sensitive changes, private avatar storage, safer account data synchronization, and refreshed production dependencies to clear high and critical security audit findings.',\n  ],`,
  `const historicalSummaries: Record<string, string[]> = {\n  '2026-09-10': [\n    'Added a complete Settings & Account Centre for profile details, username changes with automatic availability checking, private profile pictures, email and password changes, notification controls, privacy information, and DP Resources display preferences.',\n    'Added profile-picture editing with repositioning, crop preview, zoom and rotation, and fixed signed private avatars so they display correctly throughout the account interface.',\n    'Added per-user controls for Library source tags, Library resource-type labels, Question Bank source tags, expanded source information, support notifications, and automatic What’s new release highlights.',\n    'Strengthened account security with current-password verification for sensitive changes, private avatar storage, safer account data synchronization, and refreshed production dependencies to clear high and critical security audit findings.',\n  ],\n  // The Settings work merged on 9 September was still under pre-production testing.\n  // Suppress those intermediate merge titles so the public changelog shows only the final 10 September release.\n  '2026-09-09': [],`,
  'Settings changelog block',
);

replaceOnce(
  'lib/whats-new.ts',
  `    {\n      title: 'Profile pictures now appear in your account menu',\n      description:\n        'Upload a private JPG, PNG or WebP profile picture and DP Resources will use it in your signed-in account menu.',\n    },`,
  `    {\n      title: 'Crop and adjust your profile picture',\n      description:\n        'Choose a private JPG, PNG or WebP image, then reposition, zoom and rotate it with a circular preview before saving it to your account.',\n    },`,
  'What’s New profile-picture item',
);

replaceOnce(
  'tests/source-ui-and-whats-new.test.ts',
  `      'Profile pictures now appear in your account menu',`,
  `      'Crop and adjust your profile picture',`,
  'What’s New profile-picture test title',
);

replaceOnce(
  'tests/source-ui-and-whats-new.test.ts',
  `    expect(whatsNew).not.toContain('Save your IB academic profile');`,
  `    expect(whatsNew).not.toContain('Save your IB academic profile');\n    expect(whatsNew).toContain('reposition, zoom and rotate');`,
  'What’s New crop/zoom assertion',
);

console.log('Finalized Settings release notes and changelog.');
