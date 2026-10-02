import * as THREE from "three";

export type ForgeMaterials = {
  opaque: THREE.MeshBasicMaterial;
  cutout: THREE.MeshBasicMaterial;
  glass: THREE.MeshBasicMaterial;
  water: THREE.MeshBasicMaterial;
  glow: THREE.MeshBasicMaterial;
  time: { value: number };
};

export function createMaterials(atlas: THREE.Texture): ForgeMaterials {
  const time = { value: 0 };

  const opaque = new THREE.MeshBasicMaterial({
    map: atlas,
    vertexColors: true,
  });

  const cutout = new THREE.MeshBasicMaterial({
    map: atlas,
    vertexColors: true,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  });
  cutout.customProgramCacheKey = () => "forge-cutout-wind";
  cutout.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader =
      "uniform float uTime;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vec4 forgeWorld = modelMatrix * vec4(transformed, 1.0);
        float forgeWind = sin(uTime * 1.45 + forgeWorld.x * 0.33 + forgeWorld.z * 0.29);
        transformed.x += forgeWind * 0.04;
        transformed.z += forgeWind * 0.028;
      `,
      );
  };

  const glass = new THREE.MeshBasicMaterial({
    map: atlas,
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const water = new THREE.MeshBasicMaterial({
    map: atlas,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  water.customProgramCacheKey = () => "forge-water-wave";
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader =
      "uniform float uTime;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vec4 forgeWorld = modelMatrix * vec4(transformed, 1.0);
        if (normal.y > 0.7) {
          transformed.y += sin(uTime * 1.65 + forgeWorld.x * 0.62 + forgeWorld.z * 0.48) * 0.045;
          transformed.y += sin(uTime * 0.9 + forgeWorld.x * 0.21) * 0.02;
        }
      `,
      );
  };

  const glow = new THREE.MeshBasicMaterial({
    map: atlas,
    vertexColors: true,
    color: 0xffe2a8,
  });

  return { opaque, cutout, glass, water, glow, time };
}
