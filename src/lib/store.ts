import { create } from 'zustand'
import { clamp, JOINT_LIMITS } from './analysis'
import type { CameraView, ExoDesignConfig, HumanDimensions, JointState, MachineDimensions, ProjectionMode, ScenarioPreset, VersionSnapshot } from './types'

export const BASE_CONFIG: ExoDesignConfig = {
  schemaVersion: 1,
  version: '0.1.0',
  human: { heightMm: 1750, shoulderWidthMm: 460, hipWidthMm: 360, armRatio: 1, legRatio: 1 },
  machine: { shoulderFrameMm: 760, pelvisRingMm: 520, legLengthMm: 890, armReachMm: 1000, footLengthMm: 360, footWidthMm: 180, outriggerSpanMm: 1200 },
  joints: { shoulderPitchDeg: 18, shoulderYawDeg: 8, elbowDeg: 72, wristPitchDeg: 0, hipPitchDeg: 4, kneeDeg: 8, ankleDeg: 1 },
  loadCase: { massKg: 50, gravity: [0, -9.80665, 0], gripPointMm: [0, 1120, -500], reachMm: 500, groundMode: 'feet-outriggers', scenario: 'industrial' },
  preset: 'industrial',
  materials: { titanium: '#899397', carbon: '#20272a', polymer: '#111719', safetyOrange: '#ff6a1a', rubber: '#202426', statusLight: '#55e5b0' },
  visibility: { human: true, mechanism: true, utilities: true, payload: true, xrayHuman: false },
}

const LIMITS = {
  heightMm: [1650, 1850], shoulderWidthMm: [400, 520], hipWidthMm: [320, 440], armRatio: [0.9, 1.1], legRatio: [0.9, 1.1],
  shoulderFrameMm: [680, 840], pelvisRingMm: [460, 600], legLengthMm: [780, 1000], armReachMm: [800, 1150], footLengthMm: [320, 400], footWidthMm: [150, 210], outriggerSpanMm: [760, 1400],
  massKg: [0, 80], reachMm: [100, 900],
} satisfies Record<string, [number, number]>

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

export function migrateConfig(raw: unknown): ExoDesignConfig {
  if (!raw || typeof raw !== 'object') return clone(BASE_CONFIG)
  const candidate = raw as Partial<ExoDesignConfig> & { schemaVersion?: number }
  if (candidate.schemaVersion !== 1) return clone(BASE_CONFIG)
  return {
    ...clone(BASE_CONFIG), ...candidate,
    human: { ...BASE_CONFIG.human, ...(candidate.human ?? {}) },
    machine: { ...BASE_CONFIG.machine, ...(candidate.machine ?? {}) },
    joints: { ...BASE_CONFIG.joints, ...(candidate.joints ?? {}) },
    loadCase: { ...BASE_CONFIG.loadCase, ...(candidate.loadCase ?? {}) },
    materials: { ...BASE_CONFIG.materials, ...(candidate.materials ?? {}) },
    visibility: { ...BASE_CONFIG.visibility, ...(candidate.visibility ?? {}) },
    schemaVersion: 1,
  }
}

export function parseConfig(input: string): ExoDesignConfig {
  try { return migrateConfig(JSON.parse(input)) } catch { return clone(BASE_CONFIG) }
}

function loadInitialConfig() {
  if (typeof window === 'undefined') return clone(BASE_CONFIG)
  const stored = window.localStorage.getItem('exo-forge/config/v1')
  return stored ? parseConfig(stored) : clone(BASE_CONFIG)
}

function loadSnapshots(): VersionSnapshot[] {
  if (typeof window === 'undefined') return []
  try { const value = JSON.parse(window.localStorage.getItem('exo-forge/snapshots/v1') ?? '[]'); return Array.isArray(value) ? value.slice(0, 12) : [] } catch { return [] }
}

interface ExoStore {
  config: ExoDesignConfig
  selectedModule: string
  hiddenModules: string[]
  isolatedModule: string | null
  cameraView: CameraView
  projection: ProjectionMode
  explode: number
  sectionEnabled: boolean
  measureEnabled: boolean
  analysisOpen: boolean
  playing: boolean
  timeline: number
  past: ExoDesignConfig[]
  future: ExoDesignConfig[]
  snapshots: VersionSnapshot[]
  setSelected: (id: string) => void
  toggleModuleVisibility: (id: string) => void
  isolateSelected: () => void
  setCameraView: (view: CameraView) => void
  toggleProjection: () => void
  setExplode: (value: number) => void
  toggleSection: () => void
  toggleMeasure: () => void
  toggleAnalysis: () => void
  setTimeline: (value: number) => void
  togglePlaying: () => void
  setHuman: (key: keyof HumanDimensions, value: number) => void
  setMachine: (key: keyof MachineDimensions, value: number) => void
  setJoint: (key: keyof JointState, value: number) => void
  setLoad: (key: 'massKg' | 'reachMm', value: number) => void
  toggleVisibility: (key: keyof ExoDesignConfig['visibility']) => void
  applyPreset: (preset: ScenarioPreset) => void
  importConfig: (config: ExoDesignConfig) => void
  undo: () => void
  redo: () => void
  reset: () => void
  createSnapshot: (label?: string) => void
  restoreSnapshot: (id: string) => void
}

const commit = (state: ExoStore, config: ExoDesignConfig) => ({ config, past: [...state.past, clone(state.config)].slice(-50), future: [] })

const scenarioPatch = (preset: ScenarioPreset): Partial<ExoDesignConfig> => {
  if (preset === 'rescue') return { preset, joints: { ...BASE_CONFIG.joints, shoulderPitchDeg: -22, shoulderYawDeg: 18, elbowDeg: 96, hipPitchDeg: 34, kneeDeg: 58, ankleDeg: -8 }, loadCase: { ...BASE_CONFIG.loadCase, massKg: 20, reachMm: 320, gripPointMm: [0, 760, -320], scenario: preset, groundMode: 'feet-outriggers' } }
  if (preset === 'construction') return { preset, joints: { ...BASE_CONFIG.joints, shoulderPitchDeg: 104, shoulderYawDeg: 5, elbowDeg: 32, wristPitchDeg: 20, hipPitchDeg: 3, kneeDeg: 5 }, loadCase: { ...BASE_CONFIG.loadCase, massKg: 15, reachMm: 420, gripPointMm: [0, 2050, -160], scenario: preset, groundMode: 'feet-outriggers' } }
  return { preset, joints: clone(BASE_CONFIG.joints), loadCase: clone(BASE_CONFIG.loadCase) }
}

export const useExoStore = create<ExoStore>((set, get) => ({
  config: loadInitialConfig(), selectedModule: 'F01', hiddenModules: [], isolatedModule: null, cameraView: 'iso', projection: 'perspective', explode: 0, sectionEnabled: false, measureEnabled: false, analysisOpen: true, playing: false, timeline: 0, past: [], future: [], snapshots: loadSnapshots(),
  setSelected: (selectedModule) => set({ selectedModule }),
  toggleModuleVisibility: (id) => set((s) => ({ hiddenModules: s.hiddenModules.includes(id) ? s.hiddenModules.filter((item) => item !== id) : [...s.hiddenModules, id] })),
  isolateSelected: () => set((s) => ({ isolatedModule: s.isolatedModule === s.selectedModule ? null : s.selectedModule })),
  setCameraView: (cameraView) => set({ cameraView }), toggleProjection: () => set((s) => ({ projection: s.projection === 'perspective' ? 'orthographic' : 'perspective' })),
  setExplode: (explode) => set({ explode: clamp(explode, 0, 1) }), toggleSection: () => set((s) => ({ sectionEnabled: !s.sectionEnabled })), toggleMeasure: () => set((s) => ({ measureEnabled: !s.measureEnabled })), toggleAnalysis: () => set((s) => ({ analysisOpen: !s.analysisOpen })),
  setTimeline: (timeline) => set({ timeline: clamp(timeline, 0, 100) }), togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setHuman: (key, value) => set((s) => { const [min, max] = LIMITS[key]; return commit(s, { ...s.config, human: { ...s.config.human, [key]: clamp(value, min, max) } }) }),
  setMachine: (key, value) => set((s) => { const [min, max] = LIMITS[key]; return commit(s, { ...s.config, machine: { ...s.config.machine, [key]: clamp(value, min, max) } }) }),
  setJoint: (key, value) => set((s) => { const [min, max] = JOINT_LIMITS[key]; return commit(s, { ...s.config, joints: { ...s.config.joints, [key]: clamp(value, min, max) } }) }),
  setLoad: (key, value) => set((s) => { const [min, max] = LIMITS[key]; return commit(s, { ...s.config, loadCase: { ...s.config.loadCase, [key]: clamp(value, min, max) } }) }),
  toggleVisibility: (key) => set((s) => commit(s, { ...s.config, visibility: { ...s.config.visibility, [key]: !s.config.visibility[key] } })),
  applyPreset: (preset) => set((s) => commit(s, { ...s.config, ...scenarioPatch(preset) } as ExoDesignConfig)),
  importConfig: (config) => set((s) => commit(s, migrateConfig(config))),
  undo: () => set((s) => s.past.length ? { config: clone(s.past.at(-1)!), past: s.past.slice(0, -1), future: [clone(s.config), ...s.future].slice(0, 50) } : {}),
  redo: () => set((s) => s.future.length ? { config: clone(s.future[0]), past: [...s.past, clone(s.config)].slice(-50), future: s.future.slice(1) } : {}),
  reset: () => set((s) => commit(s, clone(BASE_CONFIG))),
  createSnapshot: (label) => set((s) => ({ snapshots: [{ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`, label: label ?? `版本 ${s.snapshots.length + 1}`, createdAt: new Date().toISOString(), config: clone(s.config) }, ...s.snapshots].slice(0, 12) })),
  restoreSnapshot: (id) => { const found = get().snapshots.find((item) => item.id === id); if (found) set((s) => commit(s, clone(found.config))) },
}))

if (typeof window !== 'undefined') {
  let timer = 0
  useExoStore.subscribe((state, previous) => {
    if (state.config !== previous.config) {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => window.localStorage.setItem('exo-forge/config/v1', JSON.stringify(state.config)), 120)
    }
    if (state.snapshots !== previous.snapshots) window.localStorage.setItem('exo-forge/snapshots/v1', JSON.stringify(state.snapshots))
  })
}
