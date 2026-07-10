export const SUSPENSION_REASON_STORAGE_KEY = 'dp_resource_suspension_reason'
export const SUSPENDED_USER_ID_STORAGE_KEY = 'dp_resource_suspended_user_id'
export const SUSPENSION_REASON_UPDATED_EVENT = 'dp:suspension-reason-updated'

export function dispatchSuspensionReasonUpdated(reason: string | null) {
  window.dispatchEvent(new CustomEvent(SUSPENSION_REASON_UPDATED_EVENT, { detail: { reason } }))
}
