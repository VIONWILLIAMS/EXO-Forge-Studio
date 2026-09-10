import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const read = (name: string) =>
  JSON.parse(readFileSync(resolve(root, name), "utf8"));
const data = read("cad/v04/output/assembly.json");

describe("R04 corrective development-input contract", () => {
  it("retains millimetres, named parts and all module families", () => {
    expect(data.config.revision).toBe("ATLAS-R04");
    expect(data.config.units).toBe("mm");
    expect(new Set(data.parts.map((p: any) => p.family)).size).toBe(20);
    for (const p of data.parts) {
      expect(p.validBRep && p.watertight && p.positiveVolume, p.id).toBe(true);
    }
  });
  it("references existing definitions with unique instance identities", () => {
    const keys = new Set(data.parts.map((p: any) => p.id));
    expect(new Set(data.instances.map((i: any) => i.id)).size).toBe(
      data.instances.length,
    );
    for (const i of data.instances) expect(keys.has(i.part)).toBe(true);
  });
  it("does not reintroduce shoulder deformation into protected hips", () => {
    const r = read("output/v04/anatomy-validation.json");
    expect(r.protectedVertices).toBeGreaterThan(200);
    expect(r.legacyMaxDisplacementMm).toBeGreaterThan(40);
    expect(r.r04MaxDisplacementMm).toBe(0);
    expect(r.armWeightLeakCount).toBe(0);
  });
  it("runs 20 bounded exact-geometry interface checks", () => {
    const r = read("cad/v04/output/interface-validation.json");
    expect(r.checks).toHaveLength(20);
    expect(r.checks.every((c: any) => c.pass)).toBe(true);
    expect(r.fullAssembly).toBe("NOT RUN");
    expect(r.manufacturingRelease).toBe(false);
  });
  it("provides three independently enclosed electronic displays", () => {
    for (const screen of ["CHEST", "WRIST", "SERVICE"])
      for (const part of ["HOUSING", "BEZEL", "GLASS"]) {
        expect(
          data.parts.some((p: any) => p.id === `P02_HMI_${screen}_${part}`),
        ).toBe(true);
      }
    expect(read("public/assets/v04/displays.json")).toHaveLength(3);
  });
  it("uses corrected pin and jaw definitions without obsolete ones", () => {
    const keys = data.parts.map((p: any) => p.id);
    expect(keys).toContain("L06_TOE_PIN");
    expect(keys).toContain("A04_PARALLEL_JAW");
    expect(keys).not.toContain("L06_TOE_HINGE");
    expect(keys).not.toContain("A04_JAW");
    expect(
      data.config.hingeBoreDiameter - data.config.hingePinDiameter,
    ).toBeCloseTo(0.4);
  });
  it("uses CAD-congruent display groups and inspectable delivery files", () => {
    const r = read("output/v04/cad-display-alignment.json");
    expect(r.pass).toBe(true);
    expect(r.displayGroupsCompared).toBeGreaterThan(150);
    expect(r.worstDeviationMm).toBeLessThan(0.01);
    expect(
      existsSync(resolve(root, "assets/source/v04/EXO_ATLAS_R04.blend")),
    ).toBe(true);
  });
});
