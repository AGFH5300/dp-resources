from pathlib import Path

path = Path('components/question-bank/practice-set-builder-v4.tsx')
text = path.read_text()

old = '''  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    if (!configuration) {
      setPreviewLoading(false);
      return;
    }
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;
    const controller = new AbortController();
    const debounce = window.setTimeout(() => {
      setPreviewLoading(true);
      fetch('/api/question-bank/practice-builder/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok)
            throw new Error(payload.error || 'Unable to preview this set.');
          return payload.preview as PracticePreview;
        })
        .then((nextPreview) => {
          if (previewRequest.current === requestId) setPreview(nextPreview);
        })
        .catch((error) => {
          if (error?.name !== 'AbortError' && previewRequest.current === requestId) {
            setPreviewError(
              error instanceof Error ? error.message : 'Unable to preview this set.',
            );
          }
        })
        .finally(() => {
          if (previewRequest.current === requestId) setPreviewLoading(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [configuration]);
'''

new = '''  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;

    if (!configuration || isMaximizing) {
      setPreviewLoading(false);
      return;
    }

    let disposed = false;
    const debounce = window.setTimeout(() => {
      setPreviewLoading(true);
      fetch('/api/question-bank/practice-builder/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration }),
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok)
            throw new Error(payload.error || 'Unable to preview this set.');
          return payload.preview as PracticePreview;
        })
        .then((nextPreview) => {
          if (!disposed && previewRequest.current === requestId)
            setPreview(nextPreview);
        })
        .catch((error) => {
          if (!disposed && previewRequest.current === requestId) {
            setPreviewError(
              error instanceof Error ? error.message : 'Unable to preview this set.',
            );
          }
        })
        .finally(() => {
          if (!disposed && previewRequest.current === requestId)
            setPreviewLoading(false);
        });
    }, 500);

    return () => {
      disposed = true;
      window.clearTimeout(debounce);
    };
  }, [configuration, isMaximizing]);
'''

if old not in text:
    raise SystemExit('Expected preview effect was not found; refusing to patch.')

text = text.replace(old, new, 1)
path.write_text(text)
