/// <reference types="vite/client" />

import type { FuseBridge } from '@shared/bridge';

declare global {
  interface Window {
    fuse?: FuseBridge;
  }
}

export {};
