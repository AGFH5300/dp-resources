# DP Resources

A small secure resource portal prototype for DP Resources.

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000` and switch between demo users in the page header.

## Configuration

The app starts without real Google Drive credentials and shows a configuration-empty state. To enable the live-library path, provide these environment variables:

- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

Private configuration must stay in environment variables and must not be committed.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
