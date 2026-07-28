import 'server-only';

import { createClient } from '@/lib/supabase-server';

function requireRows<T>(
  data: T[] | null,
  error: { message: string } | null,
  label: string,
) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}

export async function getExtendedQuestionDetail(
  variantId: string,
  assetIds: string[],
) {
  const client = await createClient();
  const [papersResult, videosResult, audioResult, assetSourcesResult] =
    await Promise.all([
      client
        .from('dp_qb_variant_papers')
        .select(
          'is_primary,sort_order,paper:dp_qb_papers!paper_id(id,reference,calculator_allowed)',
        )
        .eq('variant_id', variantId)
        .order('is_primary', { ascending: false })
        .order('sort_order'),
      client
        .from('dp_qb_variant_solution_videos')
        .select(
          'part_name,sort_order,video:dp_qb_solution_videos!video_id(id,provider,provider_video_id,source_url,source_metadata,vimeo_url,vimeo_video_id)',
        )
        .eq('variant_id', variantId)
        .order('sort_order'),
      assetIds.length
        ? client
            .from('dp_qb_audio_assets')
            .select(
              'asset_id,provider,source_audio_id,transcript_id,transcript,duration_seconds,source_metadata',
            )
            .in('asset_id', assetIds)
        : Promise.resolve({ data: [], error: null }),
      assetIds.length
        ? client
            .from('dp_qb_asset_sources')
            .select('asset_id,source_file_id')
            .in('asset_id', assetIds)
            .not('source_file_id', 'is', null)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const paperLinks = requireRows(
    papersResult.data as any[] | null,
    papersResult.error,
    'Question papers',
  );
  const paperIds = paperLinks
    .map((row: any) => row.paper?.id)
    .filter((id: unknown): id is string => typeof id === 'string');
  const paperAssetsResult = paperIds.length
    ? await client
        .from('dp_qb_paper_assets')
        .select(
          'paper_id,role,sort_order,asset:dp_qb_assets!asset_id(id,content_type,byte_size,verification_status)',
        )
        .in('paper_id', paperIds)
        .eq('role', 'formula_booklet')
        .order('sort_order')
    : { data: [], error: null };

  return {
    papers: paperLinks,
    paperAssets: requireRows(
      paperAssetsResult.data as any[] | null,
      paperAssetsResult.error,
      'Paper assets',
    ),
    videos: requireRows(
      videosResult.data as any[] | null,
      videosResult.error,
      'Solution videos',
    ),
    audio: requireRows(
      audioResult.data as any[] | null,
      audioResult.error,
      'Audio metadata',
    ),
    assetSources: requireRows(
      assetSourcesResult.data as any[] | null,
      assetSourcesResult.error,
      'Asset source aliases',
    ),
  };
}
