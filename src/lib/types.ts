export type ScenarioPreset = 'industrial' | 'rescue' | 'construction'
export type CameraView = 'iso' | 'front' | 'side' | 'top'
export type ProjectionMode = 'perspective' | 'orthographic'
export type Side = 'L' | 'R' | 'C' | 'B'

export interface HumanDimensions {
  heightMm: number
  shoulderWidthMm: number
  hipWidthMm: number
  armRatio: number
  legRatio: number
}

export interface MachineDimensions {
  shoulderFrameMm: number
  pelvisRingMm: number
  legLengthMm: number
  armReachMm: number
  footLengthMm: number
  footWidthMm: number
  outriggerSpanMm: number
}

export interface JointState {
  shoulderPitchDeg: number
  shoulderYawDeg: number
  elbowDeg: number
  wristPitchDeg: number
  hipPitchDeg: number
  kneeDeg: number
  ankleDeg: number
}

export interface LoadCase {
  massKg: number
  gravity: [number, number, number]
  gripPointMm: [number, number, number]
  reachMm: number
  groundMode: 'feet' | 'feet-outriggers'
  scenario: ScenarioPreset
}

export interface ExoDesignConfig {
  schemaVersion: 1
  version: string
  human: HumanDimensions
  machine: MachineDimensions
  joints: JointState
  loadCase: LoadCase
  preset: ScenarioPreset
  materials: Record<string, string>
  visibility: {
    human: boolean
    mechanism: boolean
    utilities: boolean
    payload: boolean
    xrayHuman: boolean
  }
}

export interface ModuleManifestEntry {
  id: string
  name: string
  glbNodes: string[]
  parentId: string | null
  side: Side
  connectionInterfaces: string[]
  localAxis: [number, number, number]
  parameterRange: Record<string, [number, number]>
  jointRangeDeg?: [number, number]
  safetyLabels: string[]
}

export interface AnalysisWarning {
  code: 'STABILITY_AMBER' | 'STABILITY_RED' | 'CLEARANCE' | 'JOINT_LIMIT' | 'INTERFERENCE'
  severity: 'warning' | 'critical'
  moduleId: string
  message: string
}

export interface AnalysisSnapshot {
  conceptOnly: true
  timestamp: string
  comProjectionMm: [number, number]
  supportPolygonMm: Array<[number, number]>
  stabilityMarginMm: number
  stabilityState: 'safe' | 'warning' | 'critical'
  approximateTorqueNmPerArm: number
  minimumHumanClearanceMm: number
  collisions: string[]
  warnings: AnalysisWarning[]
}

export interface VersionSnapshot {
  id: string
  label: string
  createdAt: string
  config: ExoDesignConfig
}

export type NumericConfigPath =
  | keyof HumanDimensions
  | keyof MachineDimensions
  | keyof JointState
  | 'massKg'
  | 'reachMm'
