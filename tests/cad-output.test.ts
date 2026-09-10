import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const validation = JSON.parse(
  readFileSync(resolve(root, 'cad/output/validation.json'), 'utf8'),
) as {
  pass: boolean
  moduleFamilies: string[]
  missingModuleFamilies: string[]
  summary: {
    partFiles: number
    validBRep: number
    watertightStl: number
    positiveVolumeStl: number
    fitsBuildVolume: number
    printPlates: number
    validPrintPlates: number
  }
  engineeringBoundary: {
    loadBearing: boolean
    wearable: boolean
    humanTesting: boolean
  }
}

describe('CAD V0.2 delivery', () => {
  it('ships all approved module families as valid printable solids', () => {
    expect(validation.pass).toBe(true)
    expect(validation.moduleFamilies).toHaveLength(20)
    expect(validation.missingModuleFamilies).toEqual([])
    expect(validation.summary).toMatchObject({
      partFiles: 35,
      validBRep: 35,
      watertightStl: 35,
      positiveVolumeStl: 35,
      fitsBuildVolume: 35,
      printPlates: 4,
      validPrintPlates: 4,
    })
  })

  it('keeps the actual manufacturing boundary explicit', () => {
    expect(validation.engineeringBoundary).toEqual({
      loadBearing: false,
      wearable: false,
      humanTesting: false,
      statement: expect.any(String),
    })
  })

  it('includes individual STEP/STL files and slicer-ready plates', () => {
    const stepFiles = readdirSync(resolve(root, 'cad/output/step')).filter((name) => name.endsWith('.step'))
    const stlFiles = readdirSync(resolve(root, 'cad/output/stl')).filter((name) => name.endsWith('.stl'))
    const plateFiles = readdirSync(resolve(root, 'cad/output/3mf')).filter((name) => name.endsWith('.3mf'))

    expect(stepFiles).toHaveLength(35)
    expect(stlFiles).toHaveLength(35)
    expect(plateFiles).toHaveLength(4)
    expect(existsSync(resolve(root, 'cad/output/EXO_FORGE_CAD_V02_ASSEMBLY.step'))).toBe(true)
    expect(existsSync(resolve(root, 'cad/output/EXO_FORGE_CAD_V02_PRINT_PACK.zip'))).toBe(true)
  })
})
