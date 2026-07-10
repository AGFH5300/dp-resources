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

    let handler: ((payload: { new: { id?: string; is_suspended?: boolean } }) => void) | null = null
    const channel = { id: 'channel' }
    const removeChannel = vi.fn()
    const supabase = {
      channel: vi.fn(() => ({
        on: vi.fn((_event, _filter, cb) => { handler = cb; return { subscribe: vi.fn(() => channel) } }),
      })),
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
    return { handler: () => handler, cleanup: () => cleanup?.(), replace, fetch, removeChannel }
  }

  it('an UPDATE with is_suspended true redirects exactly once and repeated updates still redirect once', async () => {
    const ctx = await mountWatcher()
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: true } })
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: true } })
    expect(ctx.replace).toHaveBeenCalledTimes(1)
  })

  it('an active membership does not redirect', async () => {
    const ctx = await mountWatcher()
    ctx.handler()?.({ new: { id: 'user-1', is_suspended: false } })
    expect(ctx.replace).not.toHaveBeenCalled()
  })

  it('an active fallback response does not refresh or navigate', async () => {
    const ctx = await mountWatcher({ authenticated: true, suspended: false })
    vi.advanceTimersByTime(30000)
    await Promise.resolve(); await Promise.resolve()
    expect(ctx.fetch).toHaveBeenCalledWith('/api/account/status', { cache: 'no-store' })
    expect(ctx.replace).not.toHaveBeenCalled()
  })

  it('a suspended fallback response redirects once', async () => {
    const ctx = await mountWatcher({ authenticated: true, suspended: true })
    vi.advanceTimersByTime(30000)
    await Promise.resolve(); await Promise.resolve()
    vi.advanceTimersByTime(30000)
    await Promise.resolve(); await Promise.resolve()
    expect(ctx.replace).toHaveBeenCalledTimes(1)
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
