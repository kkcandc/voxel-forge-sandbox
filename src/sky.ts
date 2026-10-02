import * as THREE from "three";
import { hash2, lerp, smoothstep } from "./noise";
import { createCloudTexture, createGlowTexture } from "./textures";

export type Atmosphere = {
  day: number;
  night: number;
  sunset: number;
  sunHeight: number;
  fogNear: number;
  fogFar: number;
};

export class SkyRig {
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  readonly hold: THREE.PointLight;
  readonly ore: THREE.PointLight[];
  private readonly sky: THREE.Mesh;
  private readonly clouds: THREE.Mesh;
  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.PointsMaterial;
  private readonly sunSprite: THREE.Sprite;
  private readonly moonSprite: THREE.Sprite;
  private readonly fireflies: THREE.Points;
  private readonly fireflyMat: THREE.PointsMaterial;
  private readonly fireflyPos: Float32Array;
  private readonly sunDir = new THREE.Vector3();
  private readonly fogColor = new THREE.Color();
  private readonly zenith = new THREE.Color();
  private readonly horizon = new THREE.Color();
  private readonly warm = new THREE.Color();
  private readonly sunColor = new THREE.Color();
  private readonly cloudColor = new THREE.Color();
  private readonly hemiSky = new THREE.Color();
  private readonly hemiGround = new THREE.Color();
  private readonly cNightZenith = new THREE.Color(0x070814);
  private readonly cDayZenith = new THREE.Color(0x2f78e4);
  private readonly cSunsetZenith = new THREE.Color(0x24356b);
  private readonly cNightHorizon = new THREE.Color(0x1a2344);
  private readonly cDayHorizon = new THREE.Color(0xd9ecff);
  private readonly cSunsetHorizon = new THREE.Color(0xff8d4a);
  private readonly cWhite = new THREE.Color(0xfff6de);
  private readonly cSunSet = new THREE.Color(0xffa05a);
  private readonly cCloud = new THREE.Color(0xfff7ef);
  private readonly cGroundNight = new THREE.Color(0x1c1a22);
  private readonly cGroundDay = new THREE.Color(0x5c6a3a);
  private readonly cFogWarm = new THREE.Color(0xf2d2b4);
  private readonly cUnder = new THREE.Color(0x146888);

  constructor(scene: THREE.Scene) {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uZenith: { value: this.zenith },
        uHorizon: { value: this.horizon },
        uWarm: { value: this.warm },
        uSunColor: { value: this.sunColor },
        uSunDir: { value: this.sunDir },
        uNight: { value: 0 },
        uSunset: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_Position.z = gl_Position.w * 0.9998;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uWarm;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform float uNight;
        uniform float uSunset;
        void main() {
          vec3 dir = normalize(vDir);
          float lift = smoothstep(-0.04, 0.58, dir.y);
          vec3 col = mix(uHorizon, uZenith, lift);
          col = mix(uHorizon * 0.42, col, smoothstep(-0.4, 0.05, dir.y));
          vec2 sunFlat = normalize(uSunDir.xz + vec2(0.0001));
          vec2 dirFlat = normalize(dir.xz + vec2(0.0001));
          float sunSide = pow(max(dot(dirFlat, sunFlat), 0.0), 1.5);
          col = mix(col, uWarm, sunSide * uSunset * (1.0 - lift));
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sunDot, 1400.0) * 1.55;
          col += uSunColor * pow(sunDot, 7.0) * (0.18 + uSunset * 0.55);
          float moonDot = max(dot(dir, normalize(-uSunDir)), 0.0);
          col += vec3(0.72, 0.82, 1.0) * pow(moonDot, 2200.0) * uNight;
          col += vec3(0.35, 0.48, 0.75) * pow(moonDot, 5.0) * uNight * 0.22;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(580, 32, 24), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -3;
    scene.add(this.sky);

    const starPositions: number[] = [];
    for (let i = 0; i < 480; i++) {
      const y = 0.12 + (i / 480) * 0.88;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * 2.399963 + hash2(i, 3, 1) * 0.4;
      const radius = 540;
      starPositions.push(Math.cos(theta) * ring * radius, y * radius, Math.sin(theta) * ring * radius);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xfff8ea,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    scene.add(this.stars);

    const glow = createGlowTexture();
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        color: 0xfff1cf,
      }),
    );
    this.moonSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        color: 0xc5d4ff,
        opacity: 0,
      }),
    );
    this.sunSprite.renderOrder = -2;
    this.moonSprite.renderOrder = -2;
    this.sunSprite.frustumCulled = false;
    this.moonSprite.frustumCulled = false;
    scene.add(this.sunSprite, this.moonSprite);

    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: true,
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: createCloudTexture() },
        uColor: { value: this.cloudColor },
        uOpacity: { value: 0.9 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDist;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDist = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDist;
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        void main() {
          vec2 uv = vUv * 3.2 + vec2(uTime * 0.004, uTime * 0.001);
          float alpha = texture2D(uMap, uv).a * uOpacity;
          alpha *= 1.0 - smoothstep(50.0, 340.0, vDist);
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(uColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 118;
    this.clouds.renderOrder = 2;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);

    this.fireflyPos = new Float32Array(54 * 3);
    const fireGeo = new THREE.BufferGeometry();
    fireGeo.setAttribute("position", new THREE.BufferAttribute(this.fireflyPos, 3));
    this.fireflyMat = new THREE.PointsMaterial({
      color: 0xffe2a1,
      size: 0.16,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.fireflies = new THREE.Points(fireGeo, this.fireflyMat);
    this.fireflies.frustumCulled = false;
    scene.add(this.fireflies);

    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
    this.moon = new THREE.DirectionalLight(0xb9c8ff, 0);
    this.hemi = new THREE.HemisphereLight(0x8eb6ff, 0x3e4a28, 0.55);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.hold = new THREE.PointLight(0xffc56b, 0, 8, 2);
    this.ore = [0, 1, 2, 3].map(() => new THREE.PointLight(0xffb15a, 0, 9, 2));
    scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemi, this.ambient, this.hold, ...this.ore);
  }

  direction(t: number, target = this.sunDir): THREE.Vector3 {
    const wrapped = ((t % 1) + 1) % 1;
    const angle = (wrapped - 0.25) * Math.PI * 2;
    return target.set(Math.cos(angle), Math.sin(angle), 0.32).normalize();
  }

  update(
    time: number,
    camera: THREE.Camera,
    player: THREE.Vector3,
    underwater: boolean,
    showLife: boolean,
    elapsed: number,
  ): Atmosphere {
    const sunDir = this.direction(time);
    const sunH = sunDir.y;
    const day = smoothstep(-0.08, 0.22, sunH);
    const night = 1 - smoothstep(-0.16, 0.18, sunH);
    const sunset = Math.exp(-((sunH - 0.06) ** 2) * 14) * smoothstep(-0.28, 0.04, sunH);

    this.zenith.copy(this.cNightZenith).lerp(this.cDayZenith, day);
    this.zenith.lerp(this.cSunsetZenith, sunset * 0.72);
    this.horizon.copy(this.cNightHorizon).lerp(this.cDayHorizon, day);
    this.horizon.lerp(this.cSunsetHorizon, Math.min(1, sunset * 1.15));
    this.warm.set(0xffb067);
    this.sunColor.copy(this.cWhite).lerp(this.cSunSet, sunset);

    const fog = this.fogColor.copy(this.horizon).lerp(this.cFogWarm, sunset * 0.25);
    const mist = Math.exp(-((sunH - 0.0) ** 2) * 22) * (1 - night * 0.5);
    let fogNear = lerp(72, 26, mist);
    let fogFar = lerp(132, 92, mist);
    if (underwater) {
      fog.copy(this.cUnder);
      fogNear = 1.5;
      fogFar = 26;
    }

    const skyMat = this.sky.material as THREE.ShaderMaterial;
    skyMat.uniforms.uNight!.value = night;
    skyMat.uniforms.uSunset!.value = sunset;

    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.starMat.opacity = night * 0.95;

    this.sunSprite.position.copy(camera.position).addScaledVector(sunDir, 460);
    const sunScale = 54 + sunset * 48;
    this.sunSprite.scale.set(sunScale, sunScale, 1);
    (this.sunSprite.material as THREE.SpriteMaterial).opacity = smoothstep(-0.04, 0.15, sunH);
    this.moonSprite.position.copy(camera.position).addScaledVector(sunDir, -460);
    this.moonSprite.scale.set(26, 26, 1);
    (this.moonSprite.material as THREE.SpriteMaterial).opacity = night * 0.9;

    this.clouds.position.x = camera.position.x;
    this.clouds.position.z = camera.position.z;
    this.cloudColor.copy(this.horizon).lerp(this.cCloud, 0.55);
    this.cloudMat.uniforms.uTime!.value = elapsed;
    this.cloudMat.uniforms.uOpacity!.value = underwater ? 0 : 0.35 + day * 0.55;

    this.sun.color.copy(this.sunColor);
    this.sun.intensity = smoothstep(-0.05, 0.18, sunH) * 7.2 + sunset * 1.6;
    this.sun.position.copy(camera.position).addScaledVector(sunDir, 40);
    this.sun.target.position.copy(camera.position);
    this.moon.intensity = night * 0.38;
    this.moon.position.copy(camera.position).addScaledVector(sunDir, -40);
    this.moon.target.position.copy(camera.position);
    this.hemiSky.copy(this.zenith).lerp(this.cWhite, 0.25);
    this.hemiGround.copy(this.cGroundNight).lerp(this.cGroundDay, day);
    this.hemi.color.copy(this.hemiSky);
    this.hemi.groundColor.copy(this.hemiGround);
    this.hemi.intensity = 1.15 + day * 0.85;
    this.ambient.intensity = underwater ? 0.7 : 0.72 + day * 0.28;

    if (showLife && night > 0.35 && !underwater) {
      for (let i = 0; i < 54; i++) {
        const a = elapsed * 0.35 + i * 1.7;
        const radius = 3.5 + (i % 6) * 0.85;
        this.fireflyPos[i * 3] = player.x + Math.cos(a) * radius;
        this.fireflyPos[i * 3 + 1] = player.y + 1.2 + Math.sin(a * 1.4) * 1.1 + (i % 4) * 0.35;
        this.fireflyPos[i * 3 + 2] = player.z + Math.sin(a * 0.8) * radius;
      }
      this.fireflyMat.opacity = (night - 0.35) * 1.3;
      (this.fireflies.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    } else {
      this.fireflyMat.opacity = 0;
    }

    return { day, night, sunset, sunHeight: sunH, fogNear, fogFar };
  }

  applyFog(scene: THREE.Scene, atmo: Atmosphere): void {
    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.color.copy(this.fogColor);
      fog.near = atmo.fogNear;
      fog.far = atmo.fogFar;
    }
  }

  exposure(atmo: Atmosphere, underwater: boolean): number {
    if (underwater) return 0.95;
    return 1.18 + atmo.sunset * 0.06 - atmo.night * 0.22;
  }
}
