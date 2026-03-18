import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules before importing the module under test
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/ui/interactiveCheck', () => ({
  shouldUseInkUI: vi.fn(() => false),
}));

// Mock initInkApp to avoid loading ink/React, and trigger onController in the render callback
vi.mock('../../../src/ui/initInkApp', () => ({
  initInkApp: vi.fn(async (options: any) => {
    const resolvers: Record<string, (v: any) => void> = {};
    const promises: Record<string, Promise<any>> = {};
    for (const [key] of Object.entries(options.channels || {})) {
      promises[key] = new Promise((resolve) => {
        resolvers[key] = resolve;
      });
    }

    // Call render to get element and trigger onController
    const element = options.render(resolvers);
    const appProps = element?.props?.children?.props || element?.props;
    if (appProps?.onController) {
      const { createAuthController } = await import('../../../src/ui/auth/AuthApp');
      appProps.onController(createAuthController(vi.fn()));
    }

    const mockCleanup = vi.fn();
    return {
      renderResult: {
        cleanup: mockCleanup,
        clear: vi.fn(),
        unmount: vi.fn(),
        rerender: vi.fn(),
        waitUntilExit: vi.fn().mockResolvedValue(undefined),
        instance: {},
      },
      cleanup: mockCleanup,
      promises,
    };
  }),
}));

// Mock AuthApp to avoid loading ink/React
vi.mock('../../../src/ui/auth/AuthApp', () => ({
  AuthApp: vi.fn(() => null),
  createAuthController: vi.fn((_setProgress: unknown) => ({
    setPhase: vi.fn(),
    setStatusMessage: vi.fn(),
    showTeamSelector: vi.fn(),
    complete: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('authRunner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
    vi.mocked(shouldUseInkUI).mockReturnValue(false);
  });

  describe('shouldUseInkAuth', () => {
    it('should return false by default (opt-in)', async () => {
      const { shouldUseInkAuth } = await import('../../../src/ui/auth/authRunner');
      expect(shouldUseInkAuth()).toBe(false);
    });

    it('should return true when shouldUseInkUI returns true', async () => {
      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInkUI).mockReturnValue(true);

      const { shouldUseInkAuth } = await import('../../../src/ui/auth/authRunner');
      expect(shouldUseInkAuth()).toBe(true);
    });
  });

  describe('initInkAuth', () => {
    it('should initialize and return controller and promises', async () => {
      const { initInkAuth } = await import('../../../src/ui/auth/authRunner');

      const result = await initInkAuth({ initialPhase: 'logging_in' });

      expect(result).toHaveProperty('controller');
      expect(result).toHaveProperty('cleanup');
      expect(result).toHaveProperty('teamSelection');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('renderResult');
      expect(typeof result.controller.setPhase).toBe('function');
      expect(typeof result.controller.setStatusMessage).toBe('function');
      expect(typeof result.controller.showTeamSelector).toBe('function');
      expect(typeof result.controller.complete).toBe('function');
      expect(typeof result.controller.error).toBe('function');
    });

    it('should call initInkApp with correct options', async () => {
      const { initInkApp } = await import('../../../src/ui/initInkApp');
      const { initInkAuth } = await import('../../../src/ui/auth/authRunner');

      await initInkAuth({ initialPhase: 'logging_in' });

      expect(initInkApp).toHaveBeenCalledTimes(1);
      const call = vi.mocked(initInkApp).mock.calls[0][0];
      expect(call.componentName).toBe('AuthApp');
      expect(call.signalContext).toBe('auth');
      // Channels use AUTH_CANCELLED sentinel as fallback for signal handling
      const { AUTH_CANCELLED } = await import('../../../src/ui/auth/authRunner');
      expect(call.channels).toEqual({
        teamSelection: AUTH_CANCELLED,
        result: AUTH_CANCELLED,
      });
    });
  });
});
