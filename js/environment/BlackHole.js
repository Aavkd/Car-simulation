import * as THREE from 'three';

/**
 * BlackHole - Volumetric raymarched black hole with accretion disk
 * Ported from React Three Fiber implementation to pure Three.js
 * 
 * Features:
 * - Realistic accretion disk with turbulent noise
 * - Gravitational lensing effect (ray bending)
 * - Configurable colors, rotation speed, distortion
 * - Optional pulsar jet mode
 */

const vertexShader = `
varying vec3 vOrigin;
varying vec3 vDirection;
void main() {
  vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vDirection = position - vOrigin;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec3 vOrigin;
varying vec3 vDirection;

uniform float uTime;
uniform vec3 uColorInner;
uniform vec3 uColorOuter;
uniform float uDensity;
uniform float uNoiseScale;
uniform float uDistortion; // Controls bending strength
uniform float uDiskRadius; // Controls disk size
uniform bool uIsPulsar;    // Toggle for pulsar jets
uniform float uBloomIntensity; // [NEW] Bloom emission multiplier

// Simplex 3D Noise 
// (Adapted from standard implementations for GLSL)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2  C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y
    i = mod289(i);
  vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);    // mod(j,N)
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1),
        dot(p2, x2), dot(p3, x3)));
}

// Rotation matrix
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float getDensity(vec3 p) {
    // Flatten the sphere into a disk
    float r = length(p.xy);
    float h = abs(p.z);

    // Event horizon radius is roughly 1.0 in this scale
    if (r < 1.5 || r > uDiskRadius) return 0.0;

    // Base density profile (gaussian-ish in height, falloff in radius)
    float density = exp(-h * h * 8.0) * (1.0 / (r * r * 0.5));

    // Rotate domain for swirling effect
    vec3 q = p;
    q.xy *= rot(uTime * 0.8 + 3.0 / (r + 0.1)); // Differential rotation

    // Add noise
    float noise = snoise(q * 2.5 + vec3(0.0, 0.0, uTime * 0.3));
    float detail = snoise(q * 8.0 - vec3(0.0, 0.0, uTime * 0.6)) * 0.5;

    density *= (1.0 + noise * 0.6 + detail * 0.3);

    // Soft edges
    density *= smoothstep(1.5, 2.0, r) * smoothstep(uDiskRadius, uDiskRadius - 0.8, r);

    return max(0.0, density * 5.0);
}

float getJetDensity(vec3 p) {
    float r = length(p.xy);
    float h = abs(p.z);
    
    // Jets are narrow beams along Z
    if (r > 3.0) return 0.0; 
    
    // 1. Bright Core (High energy, very narrow)
    float core = exp(-r * r * 15.0);
    
    // 2. Turbulent Sheath (Wider, noisy)
    float sheath = exp(-r * r * 1.5);
    
    // Helical/Twisting motion
    float angle = atan(p.y, p.x);
    float twist = sin(h * 1.5 + angle * 2.0 - uTime * 8.0);
    
    // High frequency noise for "energy" look
    float noise = snoise(vec3(p.x * 1.5, p.y * 1.5, p.z * 0.8 - uTime * 4.0));
    
    // Shockwaves / Pulses along the jet
    float pulse = smoothstep(-0.5, 1.0, sin(h * 0.8 - uTime * 5.0));
    
    // Combine
    float density = core * 5.0 + sheath * (0.5 + twist * 0.3 + noise * 0.4);
    
    // Modulation along length
    density *= exp(-h * 0.08); // Gradual falloff
    density *= (0.8 + 0.4 * pulse); // Pulsing brightness
    
    // Cut out the center where the black hole is
    density *= smoothstep(1.2, 2.5, h); 
    
    return density;
}

// Axis-Aligned Bounding Box Intersection
vec2 intersectAABB(vec3 rayOrigin, vec3 rayDir, vec3 boxMin, vec3 boxMax) {
    vec3 tMin = (boxMin - rayOrigin) / rayDir;
    vec3 tMax = (boxMax - rayOrigin) / rayDir;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
}

void main() {
    vec3 rayOrigin = vOrigin;
    vec3 rayDir = normalize(vDirection);

    // Bounding box for the accretion disk volume
    // Increased to ensure we capture rays that are bent from outside the immediate disk area
    vec3 boxMin = vec3(-15.0, -15.0, -15.0);
    vec3 boxMax = vec3(15.0, 15.0, 15.0);

    // We start marching from the camera or the box entry
    // But since we bend rays, the straight line intersection is just a heuristic for "nearness"
    // To properly simulate lensing, we should march from the camera (or close to it) 
    // and let the ray curve into the box.
    // However, for performance, we can skip empty space if we are far.
    
    vec2 tBox = intersectAABB(rayOrigin, rayDir, boxMin, boxMax);
    float tStart = max(0.0, tBox.x - 2.0); // Start a bit before the box to allow curving in
    
    vec3 p = rayOrigin + rayDir * tStart;
    vec3 dir = rayDir;
    
    vec4 color = vec4(0.0);
    
    float stepSize = 0.08;
    float t = tStart;

    // Schwarzschild radius (approx)
    float rs = 1.0;

    for (int i = 0; i < 300; i++) {
        float r = length(p);

        // Event Horizon Check
        if (r < rs) {
            // Hit the black hole
            color.rgb = vec3(0.0);
            color.a = 1.0; // Opaque black
            break;
        }

        // Gravity Bending
        // Force ~ 1/r^2 directed towards center
        // We update direction: dir += acceleration * dt
        // Acceleration magnitude controlled by uDistortion
        vec3 accel = -normalize(p) * (uDistortion * 2.0) / (r * r + 0.1);
        dir += accel * stepSize;
        dir = normalize(dir);

        // Move ray
        p += dir * stepSize;

        // Sample Disk Density
        if (abs(p.z) < 4.0 && length(p.xy) < uDiskRadius + 1.0) {
            float d = getDensity(p);
            if (d > 0.001) {
                float diskR = length(p.xy);
                vec3 emission = mix(uColorInner, uColorOuter, smoothstep(1.5, uDiskRadius, diskR));
                emission *= (1.0 + 3.0 / (diskR * diskR)); // Bright inner edge
                emission *= uBloomIntensity; // [NEW] Apply bloom intensity
                
                float alpha = d * stepSize * 0.6;
                color.rgb += emission * alpha * (1.0 - color.a);
                color.a += alpha;
            }
        }

        // Sample Jet Density (Pulsar Mode)
        if (uIsPulsar) {
             // Jets are tall, so we check a wider Z range, but narrow XY
            if (abs(p.z) < 14.0 && length(p.xy) < 4.0) {
                float jetD = getJetDensity(p);
                if (jetD > 0.001) {
                    // Gradient color for jets: Blueish white at base -> Purple/Reddish at tips
                    float h = abs(p.z);
                    vec3 baseColor = vec3(0.4, 0.8, 1.0); // Cyan/Blue
                    vec3 tipColor = vec3(0.8, 0.2, 1.0);  // Purple
                    vec3 jetColor = mix(baseColor, tipColor, smoothstep(2.0, 12.0, h));
                    
                    // Boost intensity for glow
                    jetColor *= 2.5 * uBloomIntensity; // [NEW] Apply bloom intensity
                    
                    float jetAlpha = jetD * stepSize * 0.5;
                    color.rgb += jetColor * jetAlpha * (1.0 - color.a);
                    color.a += jetAlpha;
                }
            }
        }

        if (color.a >= 0.99) break;

        // Break if we are far away and moving away
        if (r > 20.0 && dot(p, dir) > 0.0) break;
    }

    gl_FragColor = color;
}
`;

export class BlackHole {
    /**
     * Create a new BlackHole instance
     * @param {Object} options - Configuration options
     * @param {string|number} options.colorInner - Inner disk color (default: '#ffc880')
     * @param {string|number} options.colorOuter - Outer disk color (default: '#ff5050')
     * @param {number} options.rotationSpeed - Animation speed multiplier (default: 1.0)
     * @param {number} options.distortion - Gravitational lensing strength (default: 0.1)
     * @param {number} options.diskRadius - Accretion disk outer radius (default: 4.0)
     * @param {boolean} options.isPulsar - Enable pulsar jet mode (default: false)
     * @param {number} options.scale - Overall scale of the black hole (default: 1.0)
     * @param {THREE.Vector3} options.tilt - Rotation of the disk plane (default: [-Math.PI/2.5, 0, 0])
     */
    constructor(options = {}) {
        // Store configuration
        this.colorInner = options.colorInner || '#ffc880';
        this.colorOuter = options.colorOuter || '#ff5050';
        this.rotationSpeed = options.rotationSpeed ?? 1.0;
        this.distortion = options.distortion ?? 0.1;
        this.diskRadius = options.diskRadius ?? 4.0;
        this.isPulsar = options.isPulsar ?? false;
        this.isPulsar = options.isPulsar ?? false;
        this.baseScale = options.scale ?? 1.0;
        this.bloomIntensity = options.bloomIntensity ?? 1.0; // [NEW]

        // Tilt angle (default matches reference: tilted towards viewer)
        this.tilt = options.tilt || new THREE.Euler(-Math.PI / 2.5, 0, 0);

        // Internal time accumulator
        this._elapsedTime = 0;

        // Create the mesh
        this.mesh = this._createMesh();
        this.mesh.userData.blackHoleInstance = this;

        // Apply initial scale
        this.mesh.scale.setScalar(this.baseScale);
    }

    /**
     * Create the black hole mesh with shader material
     * @private
     */
    _createMesh() {
        // Large box geometry to contain the raymarched volume
        const geometry = new THREE.BoxGeometry(15, 15, 15);

        // Shader material with all uniforms
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uColorInner: { value: new THREE.Color(this.colorInner) },
                uColorOuter: { value: new THREE.Color(this.colorOuter) },
                uDensity: { value: 1.0 },
                uNoiseScale: { value: 2.0 },
                uDistortion: { value: this.distortion },
                uDiskRadius: { value: this.diskRadius },
                uIsPulsar: { value: this.isPulsar },
                uBloomIntensity: { value: this.bloomIntensity }
            },
            transparent: true,
            side: THREE.BackSide,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'BlackHole';

        // Apply tilt rotation
        if (this.tilt instanceof THREE.Euler) {
            mesh.rotation.copy(this.tilt);
        } else if (Array.isArray(this.tilt)) {
            mesh.rotation.set(this.tilt[0], this.tilt[1], this.tilt[2]);
        }

        return mesh;
    }

    /**
     * Update the black hole animation
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        this._elapsedTime += deltaTime * this.rotationSpeed;

        const material = this.mesh.material;
        material.uniforms.uTime.value = this._elapsedTime;

        // Sync uniform values with properties (allows runtime changes)
        material.uniforms.uColorInner.value.set(this.colorInner);
        material.uniforms.uColorOuter.value.set(this.colorOuter);
        material.uniforms.uDistortion.value = this.distortion;
        material.uniforms.uDiskRadius.value = this.diskRadius;
        material.uniforms.uDiskRadius.value = this.diskRadius;
        material.uniforms.uIsPulsar.value = this.isPulsar;
        material.uniforms.uBloomIntensity.value = this.bloomIntensity;
    }

    /**
     * Set the inner disk color
     * @param {string|number} color - Color value (hex string or number)
     */
    setColorInner(color) {
        this.colorInner = color;
        this.mesh.material.uniforms.uColorInner.value.set(color);
    }

    /**
     * Set the outer disk color
     * @param {string|number} color - Color value (hex string or number)
     */
    setColorOuter(color) {
        this.colorOuter = color;
        this.mesh.material.uniforms.uColorOuter.value.set(color);
    }

    /**
     * Set the rotation speed
     * @param {number} speed - Speed multiplier
     */
    setRotationSpeed(speed) {
        this.rotationSpeed = speed;
    }

    /**
     * Set the distortion intensity
     * @param {number} distortion - Distortion value (0 = no bending, higher = more lensing)
     */
    setDistortion(distortion) {
        this.distortion = distortion;
        this.mesh.material.uniforms.uDistortion.value = distortion;
    }

    /**
     * Set the disk radius
     * @param {number} radius - Outer radius of the accretion disk
     */
    setDiskRadius(radius) {
        this.diskRadius = radius;
        this.mesh.material.uniforms.uDiskRadius.value = radius;
    }

    /**
     * Toggle pulsar mode
     * @param {boolean} enabled - Whether to show pulsar jets
     */
    setPulsar(enabled) {
        this.isPulsar = enabled;
        this.mesh.material.uniforms.uIsPulsar.value = enabled;
    }

    /**
     * Set overall scale
     * @param {number} scale - Scale factor
     */
    setScale(scale) {
        this.baseScale = scale;
        this.mesh.scale.setScalar(scale);
    }

    /**
     * Get current configuration for serialization
     * @returns {Object} Configuration object
     */
    getConfig() {
        return {
            colorInner: this.colorInner,
            colorOuter: this.colorOuter,
            rotationSpeed: this.rotationSpeed,
            distortion: this.distortion,
            diskRadius: this.diskRadius,
            isPulsar: this.isPulsar,
            scale: this.baseScale,
            tilt: [this.mesh.rotation.x, this.mesh.rotation.y, this.mesh.rotation.z]
        };
    }

    /**
     * Apply configuration from serialized data
     * @param {Object} config - Configuration object
     */
    applyConfig(config) {
        if (config.colorInner) this.setColorInner(config.colorInner);
        if (config.colorOuter) this.setColorOuter(config.colorOuter);
        if (config.rotationSpeed !== undefined) this.setRotationSpeed(config.rotationSpeed);
        if (config.distortion !== undefined) this.setDistortion(config.distortion);
        if (config.diskRadius !== undefined) this.setDiskRadius(config.diskRadius);
        if (config.isPulsar !== undefined) this.setPulsar(config.isPulsar);
        if (config.scale !== undefined) this.setScale(config.scale);
        if (config.tilt) {
            this.mesh.rotation.set(config.tilt[0], config.tilt[1], config.tilt[2]);
        }
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
