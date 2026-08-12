import type { FuseBridge } from '@shared/bridge';

export function getBridge(): FuseBridge {
  const bridge = window.fuse;
  if (!bridge) {
    throw new Error('This page is running outside the desktop app, so it cannot open the vault.');
  }
  return bridge;
}

export function hasBridge(): boolean {
  return Boolean(window.fuse);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/^Error invoking remote method '[^']+':\s*/, '');
  }
  return String(err);
}
