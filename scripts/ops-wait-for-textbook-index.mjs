import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const PLACEMENT_IDS = [
  '19Fc-FWAcTK_48yIC5xa7Q6miJ-RnkMkW','1Q55I2Lwbcwkp7dQv_CQwr02A2zb93jlm','1gVx_kuRE9xWQzVahuhWCpp7hVu1vfBLD','1XXzW48aalvQP06ifkUtfB5BTRnVCuitM','1rmCaIIn125xQ04RNm0Itpt8lHsKmUI15','1yPcQtlrxQqIB1eBUoe8yz9cHMJ5dwue3','1G7cnpAeBe7ynxLwZLmZRhvUTBsiZMneq','1EsEHNoW7IsS70bIwcWIwKtMuneQrMuxF','1VeUaqyahEFRLZqWNUYcDfAlQRdXP2A0s','1iHOC5wskXDe8aPpseo7joSFZtes6IZbS','1GU-doqp15WHND1Jt1W1BIIwHzhCQ_dmK','1zNlcdPwAZKKUvwxz1FR2j-lCgVki0Tcn','1a1cwAxfQMA0Gm8wB4TMJoeFKC6uv85qG','1KIGMQWVWHo1DzWkurjFp_CBfPYB2SOhk','1p6mE34c-SLFZEkekTdqy9YnDY5w8fuOz','1J7RxN8-smkfXz6RIR51xyn0FsGClTk_i','1JT1GMjC8HttyMqQUMSamaldoUrtgeqvH','1OxSX2EagTVeqIzh-ERlBHX_nkjmaaJPB','1_assUG83WscRm-YEgEMAoIrAcRnkgZWS','1GMB0hhTlF4tPs40ZlEE26AfmJ0BcNUKL','1otdVajJ1WPETklHLHzshXfXjdsLWHGkx','1s25O-RPlnDZVQUPRdufjkrCj7HKpaypH','1ZfMPhY6sQ2Rtp92c-TYUqQZiSMPjOqUO','1rhwWSsCoy5BGVaeXes0xYDSHcWS7Ti8y','1Wax4eNY6WF2tI_xgF2FDXM1qS2GxHBD2','1F4e5pnRQT1W-m5VE4dHjwFB834PDx-Xh','1WCSn7IeHpG6xXlmglE67Exo7mdcq_gAj','19LBb9bBFyjppLPeUYap0YIU7fxmmefSp','19p4gieYDGIgsSYf4UCwhrbqEy7dqMJNC'
];
const OBSOLETE_IDS = [
  '11NyoTU_hVzLZEu6x-Q4KvucKcirJgxpn','1N9hPrW8Gre7oj_lYMRbsrOqweYgocg9v','10MA8BA8-MrMygcXh9BS-oYVkt_Rvn4eh','1JsFX_Ni8wbY5NvJqOMHsULUQxpACNUKc','1gdI30F1OyqbEPWkTFpn-7mpehzevwSfi','1tMGjL4C-zhXmpZ6YvlMwCIVwQxv1TSkD','1HorkEuB2SOn59vQuXfbQf-QYgizPevpt','1GpptOGvmKXyXv6xXzKqTUA9GbajBOmnz','1aKX4BXU8uPmw9smbAIuLiJuTi2tZ5-JZ','1GRfNeUS-hNV7CiBF_Gm1vN40eWaJvQem','13mPctJR96CfHFGSo5x7DlVUQsJ26co5c','1IPzXSMSJSape5GGzMbsC8XmlOwazfL4Y'
];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function snapshot() {
  const [stateResult, placementResult, oldIndexResult, oldPreviewResult] = await Promise.all([
    supabase.from('dp_resource_index_sync_state').select('status,phase,lock_token,completed_at,error_message,indexed_resources,indexed_files,indexed_folders').eq('id','00000000-0000-0000-0000-000000000001').maybeSingle(),
    supabase.from('dp_resource_index').select('drive_file_id').in('drive_file_id', PLACEMENT_IDS),
    supabase.from('dp_resource_index').select('drive_file_id').in('drive_file_id', OBSOLETE_IDS),
    supabase.from('dp_pdf_preview_documents').select('drive_file_id').in('drive_file_id', OBSOLETE_IDS),
  ]);
  for (const result of [stateResult, placementResult, oldIndexResult, oldPreviewResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const found = new Set((placementResult.data || []).map((row) => row.drive_file_id));
  return {
    state: stateResult.data,
    placementsReady: PLACEMENT_IDS.every((id) => found.has(id)),
    placementCount: found.size,
    oldIndexCount: (oldIndexResult.data || []).length,
    oldPreviewCount: (oldPreviewResult.data || []).length,
  };
}

function targetedMigrationReady(current) {
  return Boolean(
    current.placementsReady &&
    current.placementCount === PLACEMENT_IDS.length &&
    current.oldIndexCount === 0 &&
    current.oldPreviewCount === 0
  );
}

const deadline = Date.now() + 60 * 60 * 1000;
while (Date.now() < deadline) {
  const current = await snapshot();
  console.log(JSON.stringify({ event: 'textbook_index_wait', ...current }));

  if (
    current.state?.status === 'complete' &&
    !current.state?.lock_token &&
    targetedMigrationReady(current)
  ) {
    console.log(JSON.stringify({ event: 'textbook_index_ready_for_parallel_previews', mode: 'full-index-complete', ...current }, null, 2));
    process.exit(0);
  }

  if (current.state?.status === 'failed') {
    if (targetedMigrationReady(current)) {
      console.warn(JSON.stringify({
        event: 'textbook_index_partial_failure_but_targeted_migration_ready',
        reason: current.state.error_message || 'unknown error',
        placementCount: current.placementCount,
        obsoleteIndexRows: current.oldIndexCount,
        obsoletePreviewRows: current.oldPreviewCount,
      }, null, 2));
      process.exit(0);
    }
    throw new Error(`DP Resources index failed before the textbook migration rows were ready: ${current.state.error_message || 'unknown error'}`);
  }

  await sleep(5000);
}
throw new Error('Timed out waiting for the refreshed DP Resources index');
