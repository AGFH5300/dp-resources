export async function requireCanonicalContentSource(client, slug) {
  const canonicalSlug = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(canonicalSlug)) {
    throw new Error('Question Bank import is missing a canonical content source slug.');
  }
  const { data, error } = await client
    .from('dp_content_sources')
    .select('id,slug,is_active')
    .eq('slug', canonicalSlug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Unable to verify content source registry: ${error.message}`);
  if (!data) throw new Error(`Required content source is not registered: ${canonicalSlug}`);
  return { id: data.id, slug: data.slug };
}

export function attachCanonicalSource(table, rows, source) {
  if (!['dp_qb_question_sources', 'dp_qb_variant_sources'].includes(table)) return rows;
  return rows.map((row) => {
    if (String(row.provider || '').toLowerCase() !== source.slug) {
      throw new Error(`Source row provider does not match canonical registry slug: ${source.slug}`);
    }
    const common = {
      ...row,
      source_id: source.id,
      assignment_method: row.assignment_method || 'explicit_import',
      review_status: row.review_status || (source.slug === 'unknown' ? 'under_review' : 'reviewed'),
    };
    return table === 'dp_qb_question_sources'
      ? { ...common, source_scope: row.source_scope ?? row.source_subject_id ?? '' }
      : common;
  });
}
