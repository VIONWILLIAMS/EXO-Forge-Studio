import { beforeEach, describe, expect, it } from 'vitest'
import { approximateTorquePerArm, calculateAnalysis, computeSupportPolygon } from '../src/lib/analysis'
import { BASE_CONFIG, migrateConfig, parseConfig, useExoStore } from '../src/lib/store'

const fresh = () => JSON.parse(JSON.stringify(BASE_CONFIG))

beforeEach(() => useExoStore.setState({ config: fresh(), past: [], future: [], snapshots: [], hiddenModules: [], isolatedModule: null }))

describe('design-assist calculations', () => {
  it('calculates the approved 50 kg / 500 mm two-arm load case', () => {
    expect(approximateTorquePerArm(50, 500)).toBeCloseTo(122.583, 2)
    const analysis = calculateAnalysis(fresh())
    expect(analysis.approximateTorqueNmPerArm).toBe(122.6)
    expect(analysis.conceptOnly).toBe(true)
    expect(analysis.stabilityState).toBe('safe')
  })

  it('uses deployed outriggers in the support polygon', () => {
    const polygon = computeSupportPolygon(fresh())
    expect(polygon[0][0]).toBe(-600)
    expect(polygon[1][0]).toBe(600)
  })

  it('raises a clearance warning below 30 mm', () => {
    const config = fresh()
    config.machine.pelvisRingMm = 460
    config.human.hipWidthMm = 440
    const result = calculateAnalysis(config)
    expect(result.minimumHumanClearanceMm).toBe(-25)
    expect(result.warnings.some((warning) => warning.code === 'CLEARANCE')).toBe(true)
  })
})

describe('configuration contract and history', () => {
  it('falls back safely for corrupt or old schemas', () => {
    expect(parseConfig('{broken')).toEqual(BASE_CONFIG)
    expect(migrateConfig({ schemaVersion: 0, human: { heightMm: 9999 } })).toEqual(BASE_CONFIG)
  })

  it('round-trips schema version 1 JSON', () => {
    const config = fresh(); config.machine.shoulderFrameMm = 810
    expect(parseConfig(JSON.stringify(config))).toEqual(config)
  })

  it('clamps parameters and supports undo/redo', () => {
    const state = useExoStore.getState()
    state.setMachine('shoulderFrameMm', 999)
    expect(useExoStore.getState().config.machine.shoulderFrameMm).toBe(840)
    useExoStore.getState().undo()
    expect(useExoStore.getState().config.machine.shoulderFrameMm).toBe(760)
    useExoStore.getState().redo()
    expect(useExoStore.getState().config.machine.shoulderFrameMm).toBe(840)
  })

  it('enforces joint mechanical limits', () => {
    useExoStore.getState().setJoint('kneeDeg', 150)
    expect(useExoStore.getState().config.joints.kneeDeg).toBe(120)
  })
})
