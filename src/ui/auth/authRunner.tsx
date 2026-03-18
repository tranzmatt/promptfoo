/**
 * Entry point for the Ink-based auth UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { initInkApp } from '../initInkApp';

export { shouldUseInkUI as shouldUseInkAuth } from '../interactiveCheck';

import type { RenderResult } from '../render';
import type { AuthController, TeamInfo, UserInfo } from './AuthApp';

/** Sentinel value resolved by signal handlers to indicate Ctrl+C cancellation */
export const AUTH_CANCELLED = Symbol('AUTH_CANCELLED');

export interface AuthRunnerOptions {
  /** Initial phase to start with */
  initialPhase?: 'idle' | 'logging_in';
}

export interface AuthUIResult {
  /** Render result for cleanup */
  renderResult: RenderResult;
  /** Controller for sending progress updates */
  controller: AuthController;
  /** Cleanup function */
  cleanup: () => void;
  /** Promise that resolves when a team is selected, undefined if Esc, or AUTH_CANCELLED on Ctrl+C */
  teamSelection: Promise<TeamInfo | undefined | typeof AUTH_CANCELLED>;
  /** Promise that resolves when auth completes, or AUTH_CANCELLED on Ctrl+C */
  result: Promise<UserInfo | undefined | typeof AUTH_CANCELLED>;
}

/**
 * Initialize the Ink-based auth UI.
 */
export async function initInkAuth(options: AuthRunnerOptions = {}): Promise<AuthUIResult> {
  const [React, { AuthApp }] = await Promise.all([import('react'), import('./AuthApp')]);

  // Controller is created inside the component and delivered via onController callback
  let resolveController: (c: AuthController) => void;
  const controllerPromise = new Promise<AuthController>((resolve) => {
    resolveController = resolve;
  });

  const { renderResult, cleanup, promises } = await initInkApp<AuthController>({
    componentName: 'AuthApp',
    controller: undefined,
    channels: {
      // Signal (Ctrl+C) resolves with AUTH_CANCELLED sentinel so auth.ts can
      // distinguish cancellation from normal "no selection needed" (undefined)
      teamSelection: AUTH_CANCELLED,
      result: AUTH_CANCELLED,
    },
    signalContext: 'auth',
    render: (resolvers) =>
      React.createElement(AuthApp, {
        initialPhase: options.initialPhase || 'idle',
        onTeamSelect: (team: TeamInfo | undefined) => {
          resolvers.teamSelection(team);
        },
        onComplete: (userInfo: UserInfo) => {
          resolvers.result(userInfo);
        },
        onError: (_error: string) => {
          resolvers.result(undefined);
        },
        onExit: () => {
          // Resolve with undefined if exited without completing
          resolvers.teamSelection(undefined);
          resolvers.result(undefined);
        },
        onController: (c: AuthController) => {
          resolveController(c);
        },
      }),
  });

  const resolvedController = await controllerPromise;

  return {
    renderResult,
    controller: resolvedController,
    cleanup,
    teamSelection: promises.teamSelection as Promise<TeamInfo | undefined | typeof AUTH_CANCELLED>,
    result: promises.result as Promise<UserInfo | undefined | typeof AUTH_CANCELLED>,
  };
}

export type { AuthController, TeamInfo, UserInfo };
