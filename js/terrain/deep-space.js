import * as THREE from 'three';
import { BasePhysicsProvider, SurfaceTypes } from '../physics/physics-provider.js';

/**
 * Deep Space Generator
 * Procedural infinite space environment with volumetric galaxies, stars, and nebulae.
 */
export class DeepSpaceGenerator extends BasePhysicsProvider {
    constructor(params = {}) {
        super();
        this.params = Object.assign({
            starCount: 10000,
            galaxyCount: 5,
            nebulaCount: 8,
            universeSize: 50000 // Size of the playable area
        }, params);

        this.mesh = null;
        this.objects = []; // Store references to update animations
    }
generate() {
        this.mesh = new THREE.Group();
 // 0. Generate Landmarks (guaranteed visual interest)
this._generateLandmarks();

// 1. Generate Starfield
this._generateStarfield();

// 2. Generate Volumetric Galaxies
this._generateGalaxies();

// 3. Generate Nebulae (Gas Clouds)
this._generateNebulae();

// 4. Generate Supernovae / Black Holes
this._generateExoticObjects();

return this.mesh;
    }

_generateLandmarks() {
    // Create a predictable, beautiful scene near spawn
    // 1. A Massive Spiral Galaxy right in front
    this._createSpiralGalaxy({
        position: new THREE.Vector3(0, -2000, -8000),
        radius: 6000,
        colorInside: new THREE.Color(0xffaa00),
        colorOutside: new THREE.Color(0xaa00ff),
        rotation: { x: 0.5, y: 0, z: 0.2 }
    });

    // 2. A large nearby Nebula
    this._createNebula({
        position: new THREE.Vector3(3000, 1000, -3000),
        scale: 8000,
        color: new THREE.Color(0x00ffff)
    });

    // 3. Another Nebula below
    this._createNebula({
        position: new THREE.Vector3(-4000, -3000, 2000),
        scale: 10000,
        color: new THREE.Color(0xff0044)
    });
}

_generateStarfield() {
    // Create a massive particle system for stars
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];

    const colorPalette = [
        new THREE.Color(0xffffff), // White
        new THREE.Color(0xaabbff), // Blue-ish
        new THREE.Color(0xffddaa), // Yellow-ish
        new THREE.Color(0xffaa88)  // Red-ish
    ];

    for (let i = 0; i < this.params.starCount; i++) {
        const r = 2000 + Math.random() * this.params.universeSize; // Keep away from center slightly
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        positions.push(x, y, z);

        // Random color
        const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        colors.push(color.r, color.g, color.b);

        // Random size
        sizes.push(Math.random() * 2.0);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    // Shader material for twinkling stars
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            pixelRatio: { value: window.devicePixelRatio }
        },
        vertexShader: `
                uniform float time;
                uniform float pixelRatio;
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // Size attenuation
                    gl_PointSize = size * pixelRatio * (5000.0 / -mvPosition.z);
                    
                    // Twinkle effect
                    float twinkle = sin(time * 2.0 + position.x * 0.1) * 0.5 + 0.5;
                    gl_PointSize *= (0.8 + 0.4 * twinkle);

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
        fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    // Circular particle
                    vec2 center = gl_PointCoord - 0.5;
                    float dist = length(center);
                    if (dist > 0.5) discard;
                    
                    // Soft edge
                    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                    
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const starSystem = new THREE.Points(geometry, material);
    this.mesh.add(starSystem);
    this.objects.push({ type: 'stars', mesh: starSystem, material: material });
}

_generateGalaxies() {
    for (let i = 0; i < this.params.galaxyCount; i++) {
        // Bias some galaxies to be closer
        let posScale = 1.0;
        if (i < 5) posScale = 0.2; // First 5 are closer

        const pos = new THREE.Vector3(
            (Math.random() - 0.5) * this.params.universeSize * posScale,
            (Math.random() - 0.5) * this.params.universeSize * 0.5 * posScale,
            (Math.random() - 0.5) * this.params.universeSize * posScale
        );

        this._createSpiralGalaxy({ position: pos });
    }
}

_createSpiralGalaxy(opts = {}) {
    // Procedural Spiral Galaxy
    const starCount = 3000;
    const arms = 3 + Math.floor(Math.random() * 3); // 3 to 5 arms
    const armWidth = 0.5;
    const radius = opts.radius || (2000 + Math.random() * 3000);

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    // Choose galaxy colors
    const insideColor = opts.colorInside || new THREE.Color(Math.random(), Math.random(), Math.random());
    const outsideColor = opts.colorOutside || new THREE.Color(Math.random(), Math.random(), Math.random());

    for (let i = 0; i < starCount; i++) {
        // Radius from center
        const r = Math.random() * radius;

        // Spin angle based on radius (inner spins faster)
        const spinAngle = r * 0.002;

        // Arm angle
        const branchAngle = (i % arms) / arms * Math.PI * 2;

        // Random output for spread
        const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * armWidth * r;
        const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * armWidth * r / 2; // Flatter
        const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * armWidth * r;

        const x = Math.cos(branchAngle + spinAngle) * r + randomX;
        const y = randomY + (Math.random() - 0.5) * 200; // Thickness
        const z = Math.sin(branchAngle + spinAngle) * r + randomZ;

        positions.push(x, y, z);

        // Color mix
        const mixedColor = insideColor.clone();
        mixedColor.lerp(outsideColor, r / radius);

        colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 15,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        map: this._createStarTexture(),
        transparent: true
    });

    const galaxy = new THREE.Points(geometry, material);

    // Position
    if (opts.position) {
        galaxy.position.copy(opts.position);
    } else {
        galaxy.position.set(0, 0, 0); // Default, should be overridden
    }

    // Tilt
    if (opts.rotation) {
        galaxy.rotation.set(opts.rotation.x, opts.rotation.y, opts.rotation.z);
    } else {
        galaxy.rotation.x = Math.random() * Math.PI;
        galaxy.rotation.z = Math.random() * Math.PI;
    }

    this.mesh.add(galaxy);
    this.objects.push({
        type: 'galaxy',
        mesh: galaxy,
        rotSpeed: (Math.random() * 0.05 + 0.01) * (Math.random() < 0.5 ? 1 : -1)
    });
}

_createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');

    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

_generateNebulae() {
    for (let i = 0; i < this.params.nebulaCount; i++) {
        // Bias some to be closer
        let posScale = 1.0;
        if (i < 8) posScale = 0.25;

        const x = (Math.random() - 0.5) * this.params.universeSize * posScale;
        const y = (Math.random() - 0.5) * this.params.universeSize * 0.5 * posScale;
        const z = (Math.random() - 0.5) * this.params.universeSize * posScale;

        const scale = 5000 + Math.random() * 5000;
        const color = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);

        this._createNebula({
            position: new THREE.Vector3(x, y, z),
            scale: scale,
            color: color
        });
    }
}

_createNebula(opts) {
    const texture = this._getCloudTexture(); // Improved texture caching
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.4, // Increased opacity
        color: opts.color || 0x8800ff,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(opts.scale, opts.scale, 1);
    sprite.position.copy(opts.position);

    this.mesh.add(sprite);
}

_getCloudTexture() {
    if (!this._cloudTexture) {
        this._cloudTexture = this._createCloudTexture();
    }
    return this._cloudTexture;
}

_createCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');

    // Simple cloud noise approximation
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 128, 128);

    // Draw some random puff blobs
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * 128;
        const y = Math.random() * 128;
        const r = 20 + Math.random() * 40;

        const grad = context.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        context.fillStyle = grad;
        context.beginPath();
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
    }

    return new THREE.CanvasTexture(canvas);
}

_generateExoticObjects() {
    // Supernova Remnant / Black Hole
    // Just one massive one in the distance

    const geometry = new THREE.SphereGeometry(1000, 64, 64);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPos; // For 3D noise input
                
                void main() {
                    vUv = uv;
                    vNormal = normal;
                    vPos = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
        fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPos;
                
                // Simplex Noise (simplified)
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                    
                    // First corner
                    vec3 i  = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);
                    
                    // Other corners
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min( g.xyz, l.zxy );
                    vec3 i2 = max( g.xyz, l.zxy );
                    
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
                    vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y
                    
                    // Permutations
                    i = mod289(i);
                    vec4 p = permute( permute( permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                        
                    // Gradients
                    float n_ = 0.142857142857; // 1.0/7.0
                    vec3  ns = n_ * D.wyz - D.xzx;
                    
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)
                    
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)
                    
                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    
                    vec4 b0 = vec4( x.xy, y.xy );
                    vec4 b1 = vec4( x.zw, y.zw );
                    
                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    
                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                    
                    vec3 p0 = vec3(a0.xy,h.x);
                    vec3 p1 = vec3(a0.zw,h.y);
                    vec3 p2 = vec3(a1.xy,h.z);
                    vec3 p3 = vec3(a1.zw,h.w);
                    
                    // Normalise gradients
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                    p0 *= norm.x;
                    p1 *= norm.y;
                    p2 *= norm.z;
                    p3 *= norm.w;
                    
                    // Mix final noise value
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
                }
                
                void main() {
                    // Create a flow on the surface
                    float noiseVal = snoise(vPos * 0.005 + time * 0.5);
                    float intensity = (noiseVal + 1.0) / 2.0; // 0 to 1
                    
                    // Glowing orange/red for a Star or Black Hole Accretion
                    vec3 colorA = vec3(1.0, 0.2, 0.0); // Red
                    vec3 colorB = vec3(1.0, 0.9, 0.2); // Yellow/White
                    
                    vec3 finalColor = mix(colorA, colorB, intensity);
                    
                    // Fresnel rim layer
                    float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                    finalColor += vec3(0.5, 0.2, 1.0) * fresnel; // Purple rim
                    
                    gl_FragColor = vec4(finalColor, 0.9);
                }
            `,
        transparent: true,
        side: THREE.BackSide // Looking inside? or just a sphere
    });

    const starObj = new THREE.Mesh(geometry, material);
    // Place far away
    starObj.position.set(10000, 5000, -20000);
    this.mesh.add(starObj);
    this.objects.push({ type: 'supernova', mesh: starObj, material: material });
}

update(deltaTime) {
    // Animate everything
    this.objects.forEach(obj => {
        if (obj.type === 'stars' || obj.type === 'supernova') {
            if (obj.material.uniforms) {
                obj.material.uniforms.time.value += deltaTime;
            }
        } else if (obj.type === 'galaxy') {
            obj.mesh.rotation.y += obj.rotSpeed * deltaTime;
        }
    });
}

// --- Physics Interface ---

getHeightAt(worldX, worldZ) {
    // Deep space has no ground, but return a safe finite value
    // to prevent matrix/physics errors.
    return -100000;
}

getNormalAt(worldX, worldZ) {
    return new THREE.Vector3(0, 1, 0); // Irrelevant, but keep it valid
}

getSurfaceType(worldX, worldZ) {
    return SurfaceTypes.TARMAC; // Irrelevant
}

getSpawnPosition() {
    return new THREE.Vector3(0, 500, 0); // High up in space
}

getGravity() {
    return 0; // No gravity in deep space
}
}
