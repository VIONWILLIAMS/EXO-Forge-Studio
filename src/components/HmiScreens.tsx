import { tr, useLocale } from '../i18n';
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

export type HmiMode = "standby" | "assist" | "service";
type Display = {
  id: string;
  matrix: number[][];
  widthMm: number;
  heightMm: number;
  surfaceOffsetMm: number;
};

export function displayTexture(id: string, mode: HmiMode, power: boolean) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 384;
  const g = c.getContext("2d")!;
  g.fillStyle = "#06131c";
  g.fillRect(0, 0, 768, 384);
  if (power) {
    const accent = mode === "service" ? "#ffc37a" : "#aaf4da";
    g.strokeStyle = "#1d3744";
    g.lineWidth = 2;
    for (let x = 28; x < 750; x += 40) {
      g.beginPath();
      g.moveTo(x, 75);
      g.lineTo(x, 335);
      g.stroke();
    }
    g.fillStyle = accent;
    g.font = "600 22px monospace";
    g.fillText("ATLAS / 04", 30, 42);
    g.fillStyle = "#8097a2";
    g.fillText(tr("SIMULATION"), 557, 42);
    g.fillStyle = "#edf9f6";
    g.font = "600 66px sans-serif";
    const title =
      mode === "assist" ? "ASSIST" : mode === "service" ? "SERVICE" : "STANDBY";
    g.fillText(
      tr(id === "WRIST" && mode !== "service" ? "MANUAL" : title),
      28,
      133,
    );
    g.fillStyle = accent;
    g.fillRect(30, 157, 708, 3);
    g.font = "20px monospace";
    g.fillStyle = "#89a6af";
    g.fillText(
      tr(id === "SERVICE" ? "DIAGNOSTIC / CONCEPT HMI" : "DUAL ARM / HUMAN ASSIST"),
      30,
      197,
    );
    g.fillStyle = accent;
    g.font = "500 39px monospace";
    g.fillText(mode === "assist" ? "50 kg" : "-- kg", 30, 257);
    g.fillText("88 %", 299, 257);
    g.fillText(tr("LOCAL"), 542, 257);
    g.font = "18px monospace";
    g.fillStyle = "#88a0ac";
    g.fillText(tr("DESIGN LOAD"), 30, 286);
    g.fillText(tr("DEMO SOC"), 299, 286);
    g.fillText(tr("NO LINK"), 542, 286);
    g.fillStyle = "#122a32";
    g.fillRect(30, 319, 708, 5);
    g.fillStyle = accent;
    g.fillRect(30, 319, 623, 5);
    g.font = "16px monospace";
    g.fillText(tr("DESIGN PREVIEW  /  NO HARDWARE CONNECTED"), 30, 359);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Screen({
  display,
  mode,
  power,
  explode,
  section,
  onSelect,
}: {
  display: Display;
  mode: HmiMode;
  power: boolean;
  explode: number;
  section: boolean;
  onSelect: () => void;
}) {
  const locale = useLocale();
  const texture = useMemo(
    () => displayTexture(display.id, mode, power),
    [display.id, mode, power, locale],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  const matrix = useMemo(() => {
    const m = new THREE.Matrix4().set(
      ...(display.matrix.flat() as Parameters<THREE.Matrix4["set"]>),
    );
    m.elements[12] /= 1000;
    m.elements[13] /= 1000;
    m.elements[14] /= 1000;
    const result = new THREE.Matrix4().makeRotationX(-Math.PI / 2).multiply(m);
    result.elements[14] -= explode * 0.22;
    if (display.id === "WRIST") result.elements[12] -= explode * 0.18;
    return result;
  }, [display, explode]);
  const clipping = useMemo(
    () => [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)],
    [],
  );
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh
        position={[0, 0, (display.surfaceOffsetMm + 0.8) / 1000]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <planeGeometry
          args={[display.widthMm / 1000, display.heightMm / 1000]}
        />
        <meshBasicMaterial
          map={texture}
          toneMapped={false}
          clippingPlanes={section ? clipping : []}
        />
      </mesh>
    </group>
  );
}

export function HmiScreens(props: {
  mode: HmiMode;
  power: boolean;
  explode: number;
  section: boolean;
  visible: boolean;
  onSelect: () => void;
}) {

  const [displays, setDisplays] = useState<Display[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/assets/v04/displays.json", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error("Display manifest unavailable");
        return r.json();
      })
      .then(setDisplays)
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      });
    return () => controller.abort();
  }, []);
  if (!props.visible) return null;
  return (
    <>
      {displays.map((display) => (
        <Screen key={display.id} display={display} {...props} />
      ))}
    </>
  );
}
