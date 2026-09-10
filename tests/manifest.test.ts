import { describe, expect, it } from 'vitest'
import { MODULE_MANIFEST } from '../src/lib/manifest'

describe('module manifest', () => {
  it('contains exactly the approved 20 module families', () => {
    expect(MODULE_MANIFEST).toHaveLength(20)
    expect(MODULE_MANIFEST.map((item) => item.id)).toEqual(['H01','H02','H03','F01','F02','F03','L01','L02','L03','L04','L05','L06','A01','A02','A03','A04','P01','P02','P03','P04'])
  })

  it('keeps bilateral nodes independently named', () => {
    for (const item of MODULE_MANIFEST.filter((entry) => entry.side === 'B')) {
      expect(item.glbNodes.some((node) => node.endsWith('_L'))).toBe(true)
      expect(item.glbNodes.some((node) => node.endsWith('_R'))).toBe(true)
    }
  })

  it('defines local axes and safety labels for every family', () => {
    for (const item of MODULE_MANIFEST) {
      expect(item.localAxis).toHaveLength(3)
      expect(item.safetyLabels.length).toBeGreaterThan(0)
    }
  })
})
