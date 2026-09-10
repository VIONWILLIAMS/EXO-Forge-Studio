import type { AnalysisSnapshot, ExoDesignConfig, JointState } from './types'

export const GRAVITY = 9.80665

export function approximateTorquePerArm(massKg: number, reachMm: number) {
  return massKg * GRAVITY * (reachMm / 1000) / 2
}

export function computeSupportPolygon(config: ExoDesignConfig): Array<[number, number]> {
  const halfWidth = config.loadCase.groundMode === 'feet-outriggers' ? config.machine.outriggerSpanMm / 2 : config.human.hipWidthMm / 2 + config.machine.footWidthMm / 2
  const front = config.machine.footLengthMm * 0.58
  const rear = -config.machine.footLengthMm * 0.42
  return [[-halfWidth, rear], [halfWidth, rear], [halfWidth, front], [-halfWidth, front]]
}

const JOINT_LIMITS: Record<keyof JointState, [number, number]> = {
  shoulderPitchDeg: [-90, 120], shoulderYawDeg: [-85, 85], elbowDeg: [0, 145], wristPitchDeg: [-80, 80], hipPitchDeg: [-30, 100], kneeDeg: [0, 120], ankleDeg: [-25, 25],
}

export function calculateAnalysis(config: ExoDesignConfig): AnalysisSnapshot {
  const support = computeSupportPolygon(config)
  const systemMassKg = 203
  const forwardShift = config.loadCase.massKg * config.loadCase.reachMm / (systemMassKg + config.loadCase.massKg)
  const lateralShift = config.loadCase.scenario === 'rescue' ? 34 : 0
  const projection: [number, number] = [lateralShift, forwardShift]
  const left = projection[0] - support[0][0]
  const right = support[1][0] - projection[0]
  const rear = projection[1] - support[0][1]
  const front = support[2][1] - projection[1]
  const margin = Math.round(Math.min(left, right, rear, front))
  const clearance = Math.round((config.machine.pelvisRingMm - config.human.hipWidthMm) / 2 - 35)
  const warnings: AnalysisSnapshot['warnings'] = []
  const collisions: string[] = []
  if (margin < 0) warnings.push({ code: 'STABILITY_RED', severity: 'critical', moduleId: 'P03', message: `质心投影越出支撑多边形 ${Math.abs(margin)} mm` })
  else if (margin < 50) warnings.push({ code: 'STABILITY_AMBER', severity: 'warning', moduleId: 'P03', message: `稳定余量仅 ${margin} mm，低于 50 mm 设计阈值` })
  if (clearance < 30) warnings.push({ code: 'CLEARANCE', severity: clearance < 0 ? 'critical' : 'warning', moduleId: 'F03', message: `骨盆环与人体估算间隙 ${clearance} mm` })
  if (config.machine.shoulderFrameMm < config.human.shoulderWidthMm + 180) {
    collisions.push('F01/H03 shoulder envelope')
    warnings.push({ code: 'INTERFERENCE', severity: 'warning', moduleId: 'F01', message: '肩框与内侧操纵臂包络可能干涉' })
  }
  for (const [key, value] of Object.entries(config.joints) as Array<[keyof JointState, number]>) {
    const [min, max] = JOINT_LIMITS[key]
    if (value < min || value > max) warnings.push({ code: 'JOINT_LIMIT', severity: 'critical', moduleId: key.startsWith('shoulder') || key.includes('elbow') || key.includes('wrist') ? 'A01' : 'L01', message: `${key}=${value}° 超出 ${min}°…${max}°` })
  }
  return {
    conceptOnly: true, timestamp: new Date().toISOString(), comProjectionMm: projection, supportPolygonMm: support, stabilityMarginMm: margin,
    stabilityState: margin < 0 ? 'critical' : margin < 50 ? 'warning' : 'safe', approximateTorqueNmPerArm: Math.round(approximateTorquePerArm(config.loadCase.massKg, config.loadCase.reachMm) * 10) / 10,
    minimumHumanClearanceMm: clearance, collisions, warnings,
  }
}

export function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
export { JOINT_LIMITS }
