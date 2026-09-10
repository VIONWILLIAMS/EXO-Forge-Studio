import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { HalfFloatType, WebGLRenderTarget } from "three";

/** Contact shading makes gaps readable; it is not a collision test. */
export function StudioOcclusion() {
  const { gl, scene, camera, size } = useThree();
  const pipeline = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(gl, target);
    const beauty = new RenderPass(scene, camera);
    const ao = new SSAOPass(scene, camera, 512, 512, 16);
    ao.kernelRadius = 0.055;
    ao.minDistance = 0.00004;
    ao.maxDistance = 0.0018;
    const output = new OutputPass();
    composer.addPass(beauty);
    composer.addPass(ao);
    composer.addPass(output);
    return { composer, ao, output, beauty };
  }, [gl, scene, camera]);
  useEffect(() => {
    pipeline.composer.setPixelRatio(Math.min(gl.getPixelRatio(), 2));
    pipeline.composer.setSize(size.width, size.height);
  }, [pipeline, size, gl]);
  useEffect(
    () => () => {
      pipeline.ao.dispose();
      pipeline.output.dispose();
      pipeline.beauty.dispose();
      pipeline.composer.dispose();
    },
    [pipeline],
  );
  useFrame((_, delta) => pipeline.composer.render(delta), 1);
  return null;
}
