// Chooses the data behind the mock client. The hosted demo is built with --mode demo and
// replays real model output (src/api/snapshot); every other mock build uses the hand-written
// fixtures. __SNAPSHOT__ is a build-time constant, so other builds leave the snapshot out.

import type { Snapshot } from './snapshot'

declare const __SNAPSHOT__: boolean

const mod = __SNAPSHOT__ ? await import('./snapshot') : null

export const SNAP: Snapshot | null = mod ? mod.snapshot : null
export const loadDetail: (id: string) => Promise<void> = mod ? mod.loadDetail : async () => undefined
