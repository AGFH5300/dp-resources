import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('live admin filter URL behavior', () => {
  async function helper() {
    vi.doMock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => '/admin' }))
    return import('../app/admin/admin-console')
  }

  it('mounting with unchanged filters causes zero navigation and no page reset', async () => {
    const { buildLiveParamsUrl } = await helper()
    expect(buildLiveParamsUrl('/admin', { section: 'users', userEmail: 'a@test.edu', userPage: '3' }, 'users', { userEmail: 'a@test.edu' }, ['userPage'])).toBeNull()
  })

  it('unchanged input causes zero navigation', async () => {
    const { buildLiveParamsUrl } = await helper()
    expect(buildLiveParamsUrl('/admin', { section: 'activity', email: '', activityPage: '4' }, 'activity', { email: '' }, ['activityPage'])).toBeNull()
  })

  it('a changed input causes exactly one navigation target', async () => {
    const { buildLiveParamsUrl } = await helper()
    const first = buildLiveParamsUrl('/admin', { section: 'users', userEmail: 'old@test.edu', userPage: '3' }, 'users', { userEmail: 'new@test.edu' }, ['userPage'])
    const second = buildLiveParamsUrl('/admin', { section: 'users', userEmail: 'new@test.edu', userPage: '1' }, 'users', { userEmail: 'new@test.edu' }, ['userPage'])
    expect(first).toBe('/admin?section=users&userEmail=new%40test.edu&userPage=1')
    expect(second).toBeNull()
  })

  it('a changed filter resets its page to 1', async () => {
    const { buildLiveParamsUrl } = await helper()
    expect(buildLiveParamsUrl('/admin', { section: 'activity', action: 'file_opened', activityPage: '7' }, 'activity', { action: 'download_started' }, ['activityPage'])).toContain('activityPage=1')
  })
})

describe('SuspensionWatcher executable behavior', () => {
  async function mountWatcher(status: unknown = { authenticated: true, suspended: false }) {
    vi.useFakeTimers()
    const replace = vi.fn()
    vi.stubGlobal('window', {
      location: { replace },
      sessionStorage: { setItem: vi.fn(), removeItem: vi.fn(), getItem: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    } as unknown as Window & typeof globalThis)
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Document)
    const fetch = vi.fn(async () => ({ ok: true, json: async () => status }))
    vi.stubGlobal('fetch', fetch)

    let handler: ((payload: { new: { id?: string; is_suspended?: boolean; suspension_reason?: string | null } }) => void) | null = null
    const channel = { id: 'channel' }
    const removeChannel = vi.fn()
    const on = vi.fn((_event, _filter, cb) => { handler = cb; return { subscribe: vi.fn(() => channel) } })
    const supabase = {
      channel: vi.fn(() => ({ on })),
      removeChannel,
    }
    vi.doMock('../lib/supabase-browser', () => ({ createClientSupabase: vi.fn(() => supabase) }))

    let cleanup: (() => void) | undefined
    vi.doMock('react', () => ({
      useRef: vi.fn(() => ({ current: false })),
      useEffect: vi.fn((effect: () => void | (() => void)) => { cleanup = effect() || undefined }),
    }))
    const { SuspensionWatcher } = await import('../components/suspension-watcher')
    SuspensionWatcher({ userId: 'user-1' })
    return { handler: () => handler, cleanup: () => cleanup?.(), replace, fetch, removeChannel, sessionStorage: window.sessionStorage }
  }

  it('an UPDATE with is_suspended true redirects exactly once and repeated updates still redirect once', async () => {
    const ctx = await mountWatcher()
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: true, suspension_reason: 'Policy violation' } })
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: true, suspension_reason: 'Second' } })
    expect(ctx.sessionStorage.setItem).toHaveBeenCalledTimes(2)
    expect(ctx.sessionStorage.setItem).toHaveBeenCalledWith('dp_resource_suspended_user_id', 'user-1')
    expect(ctx.sessionStorage.setItem).toHaveBeenCalledWith('dp_resource_suspension_reason', 'Policy violation')
    expect(ctx.replace).toHaveBeenCalledTimes(1)
    expect(ctx.replace).toHaveBeenCalledWith('/account-suspended')
  })

  it('an active membership does not redirect', async () => {
    const ctx = await mountWatcher()
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: false } })
    expect(ctx.replace).not.toHaveBeenCalled()
  })

  it('an active fallback response does not refresh or navigate', async () => {
    const ctx = await mountWatcher({ authenticated: true, suspended: false })
    vi.advanceTimersByTime(30000)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(ctx.fetch).toHaveBeenCalledWith('/api/account/status', { cache: 'no-store' })
    expect(ctx.replace).not.toHaveBeenCalled()
    expect(ctx.sessionStorage.removeItem).toHaveBeenCalledWith('dp_resource_suspension_reason')
  })

  it('a suspended fallback response stores the reason and redirects once without putting it in the URL', async () => {
    const ctx = await mountWatcher({ authenticated: true, suspended: true, suspensionReason: 'Fallback reason' })
    vi.advanceTimersByTime(30000)
    await Promise.resolve(); await Promise.resolve()
    vi.advanceTimersByTime(30000)
    await Promise.resolve(); await Promise.resolve()
    expect(ctx.sessionStorage.setItem).toHaveBeenCalledWith('dp_resource_suspension_reason', 'Fallback reason')
    expect(ctx.replace).toHaveBeenCalledTimes(1)
    expect(ctx.replace).toHaveBeenCalledWith('/account-suspended')
  })

  it('cleans up interval, focus listener, visibility listener and Realtime channel', async () => {
    const ctx = await mountWatcher()
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    ctx.cleanup()
    expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(document.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(ctx.removeChannel).toHaveBeenCalledWith({ id: 'channel' })
  })
})


describe('UnsuspensionWatcher executable behavior', () => {
  async function mountUnsuspensionWatcher(status: unknown = { authenticated: false, suspended: false }, initialUserId: string | null = 'user-1', storedUserId: string | null = initialUserId ? null : 'user-1') {
    vi.useFakeTimers()
    const replace = vi.fn()
    const store = new Map<string, string>()
    const sessionStorage = {
      setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
      removeItem: vi.fn((key: string) => { store.delete(key) }),
      getItem: vi.fn((key: string) => store.get(key) ?? null),
    }
    if (storedUserId) store.set('dp_resource_suspended_user_id', storedUserId)
    store.set('dp_resource_suspension_reason', 'Original reason')
    const listeners = new Map<string, EventListener>()
    vi.stubGlobal('CustomEvent', class CustomEvent<T = unknown> extends Event { detail: T; constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T } })
    vi.stubGlobal('window', {
      location: { replace },
      sessionStorage,
      addEventListener: vi.fn((event: string, cb: EventListener) => { listeners.set(event, cb) }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    } as unknown as Window & typeof globalThis)
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn((event: string, cb: EventListener) => { listeners.set(`document:${event}`, cb) }),
      removeEventListener: vi.fn(),
    } as unknown as Document)
    const fetch = vi.fn(async () => ({ ok: true, json: async () => status }))
    vi.stubGlobal('fetch', fetch)

    let handler: ((payload: { new: { id?: string; is_suspended?: boolean; suspension_reason?: string | null } }) => void) | null = null
    const channel = { id: 'unsuspension-channel' }
    const removeChannel = vi.fn()
    const on = vi.fn((_event, _filter, cb) => { handler = cb; return { subscribe: vi.fn(() => channel) } })
    const supabase = {
      channel: vi.fn(() => ({ on })),
      removeChannel,
    }
    vi.doMock('../lib/supabase-browser', () => ({ createClientSupabase: vi.fn(() => supabase) }))

    let cleanup: (() => void) | undefined
    vi.doMock('react', () => ({
      useMemo: vi.fn((factory: () => unknown) => factory()),
      useRef: vi.fn(() => ({ current: false })),
      useEffect: vi.fn((effect: () => void | (() => void)) => { cleanup = effect() || undefined }),
      useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
    }))
    const { UnsuspensionWatcher } = await import('../app/account-suspended/unsuspension-watcher')
    UnsuspensionWatcher({ initialUserId })
    return { handler: () => handler, cleanup: () => cleanup?.(), replace, fetch, removeChannel, sessionStorage, supabase, listeners, store, on }
  }

  it('subscribes to only the resolved user row and navigates once on realtime unsuspension after clearing storage', async () => {
    const ctx = await mountUnsuspensionWatcher()
    expect(ctx.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ filter: 'id=eq.user-1' }), expect.any(Function))
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: false, suspension_reason: null } })
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: false, suspension_reason: null } })
    expect(ctx.sessionStorage.removeItem).toHaveBeenNthCalledWith(1, 'dp_resource_suspension_reason')
    expect(ctx.sessionStorage.removeItem).toHaveBeenNthCalledWith(2, 'dp_resource_suspended_user_id')
    expect(ctx.replace).toHaveBeenCalledTimes(1)
    expect(ctx.replace).toHaveBeenCalledWith('/library')
    expect(ctx.replace.mock.calls.flat().join(' ')).not.toContain('Original reason')
    expect(ctx.replace.mock.calls.flat().join(' ')).not.toContain('user-1')
  })

  it('stays on the page for realtime suspended updates and publishes changed reasons', async () => {
    const ctx = await mountUnsuspensionWatcher()
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: true, suspension_reason: 'Updated\nreason' } })
    expect(ctx.replace).not.toHaveBeenCalled()
    expect(ctx.sessionStorage.setItem).toHaveBeenCalledWith('dp_resource_suspension_reason', 'Updated\nreason')
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'dp:suspension-reason-updated' }))
  })

  it('does not create an unfiltered subscription without an initial or stored user id', async () => {
    const ctx = await mountUnsuspensionWatcher(undefined, null, null)
    expect(ctx.supabase.channel).not.toHaveBeenCalled()
    expect(ctx.replace).not.toHaveBeenCalled()
  })

  it('fallback active response clears storage before one library navigation', async () => {
    const ctx = await mountUnsuspensionWatcher({ authenticated: true, suspended: false, suspensionReason: null })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(ctx.fetch).toHaveBeenCalledWith('/api/account/status', { cache: 'no-store' })
    expect(ctx.sessionStorage.removeItem).toHaveBeenNthCalledWith(1, 'dp_resource_suspension_reason')
    expect(ctx.sessionStorage.removeItem).toHaveBeenNthCalledWith(2, 'dp_resource_suspended_user_id')
    expect(ctx.replace).toHaveBeenCalledTimes(1)
    expect(ctx.replace).toHaveBeenCalledWith('/library')
  })

  it('fallback suspended response updates reason without navigating and unauthenticated response preserves storage', async () => {
    const suspended = await mountUnsuspensionWatcher({ authenticated: true, suspended: true, suspensionReason: 'Still suspended' })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(suspended.replace).not.toHaveBeenCalled()
    expect(suspended.sessionStorage.setItem).toHaveBeenCalledWith('dp_resource_suspension_reason', 'Still suspended')

    vi.resetModules()
    const unauthenticated = await mountUnsuspensionWatcher({ authenticated: false, suspended: false, suspensionReason: null })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    vi.advanceTimersByTime(24000)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(unauthenticated.replace).not.toHaveBeenCalled()
    expect(unauthenticated.sessionStorage.removeItem).not.toHaveBeenCalledWith('dp_resource_suspension_reason')
    expect(unauthenticated.sessionStorage.removeItem).not.toHaveBeenCalledWith('dp_resource_suspended_user_id')
  })

  it('cleans up realtime channel, interval, focus listener, and visibility listener', async () => {
    const ctx = await mountUnsuspensionWatcher()
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    ctx.cleanup()
    expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(document.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(ctx.removeChannel).toHaveBeenCalledWith({ id: 'unsuspension-channel' })
  })
})

describe('SuspensionReasonFallback live reason behavior', () => {
  it('listens for custom reason updates and removes the listener on unmount', async () => {
    const setReason = vi.fn()
    let cleanup: (() => void) | undefined
    vi.stubGlobal('window', {
      sessionStorage: { getItem: vi.fn(() => 'Stored reason'), removeItem: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis)
    vi.doMock('react', async () => {
      const actual = await vi.importActual<typeof import('react')>('react')
      return {
        ...actual,
        useState: vi.fn((initial: unknown) => [initial, setReason]),
        useEffect: vi.fn((effect: () => void | (() => void)) => { cleanup = effect() || undefined }),
      }
    })
    const { SuspensionReasonFallback } = await import('../app/account-suspended/suspension-reason-fallback')
    SuspensionReasonFallback({ initialReason: null })
    expect(setReason).toHaveBeenCalledWith('Stored reason')
    expect(window.addEventListener).toHaveBeenCalledWith('dp:suspension-reason-updated', expect.any(Function))
    const listener = vi.mocked(window.addEventListener).mock.calls[0][1] as EventListener
    listener({ type: 'dp:suspension-reason-updated', detail: { reason: 'New reason' } } as unknown as Event)
    expect(setReason).toHaveBeenCalledWith('New reason')
    cleanup?.()
    expect(window.removeEventListener).toHaveBeenCalledWith('dp:suspension-reason-updated', listener)
  })
})
