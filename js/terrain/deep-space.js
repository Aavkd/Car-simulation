import * as THREE from 'three';
import { BasePhysicsProvider, SurfaceTypes } from '../physics/physics-provider.js';
import { BlackHole } from '../environment/BlackHole.js';
import { SpatialAnomaly } from '../environment/SpatialAnomaly.js';

/**
 * Deep Space Generator
 * Procedural infinite space environment with volumetric galaxies, stars, and nebulae.
 */
export class DeepSpaceGenerator extends BasePhysicsProvider {
    constructor(params = {}) {
        super();
        this.params = Object.assign({
            starCount: 2000,      // Per chunk
            galaxyCount: 2,       // Per chunk (avg)
            nebulaCount: 2,       // Per chunk (avg)
            universeSize: 20000,  // Chunk Size
            blackHoleChance: 0.1, // 5% chance per chunk
            anomalyChance: 2,    // 10% chance per chunk
            // Visual Tweaks
            blackHoleBloom: 0.2,       // Multiplier for black hole glow
            blackHoleDistortion: 0.15, // Lensing strength
            blackHoleDiskSize: 5.0,    // Accretion disk scale
            anomalyBloom: 0.1,         // Multiplier for anomaly glow
            anomalySpeed: 1.0,         // Rotation speed multiplier
            anomalyDistortion: 0.5,     // Max glitch distortion
            // Physics Tweaks
            thrustMultiplier: 100,     // Multiplier for plane speed/thrust (default 2x)
            gravityScale: 1000,        // Overall gravity strength multiplier (adjust this to tune attraction)
            minSpawnHeight: -Infinity  // Minimum Y height for chunk generation (for excluding ground)
        }, params);

        this.mesh = new THREE.Group();
        this.objects = []; // Store references to update animations
        this.gravityAttractors = []; // {position: Vector3, mass: number, type: string, chunkKey: string}

        // Chunk System
        this.chunks = new Map(); // "x,y,z" -> THREE.Group
        this.chunkSize = this.params.universeSize;
        this.renderDistance = 1; // Increased from 2 for further visibility
        this.lastChunkKey = null;

        // Gravity Constants (tuned for 100x thrust high-speed flight)
        // With gravityScale=1000, these give:
        // - Black hole at 3000 units: ~500 m/s² (capped), at 5000 units: ~200 m/s², at 10000: ~50 m/s²
        // - Proper inverse-square falloff beyond ~3500 units
        this.GRAVITY_CONSTANT = 4;  // Base constant
        this.BLACK_HOLE_MASS = 1e6;   // Black hole mass (strong for high-speed orbits)
        this.GALAXY_MASS = 2.5e5;     // Galaxy mass (moderate pull)
        this.MAX_GRAVITY_DISTANCE = 70000; // Pull range
        this.MAX_ATTRACTORS = 3;      // Only consider closest N attractors
        this.MIN_GRAVITY_DISTANCE = 500;  // Soft minimum distance
    }

    generate() {
        // Initial generation at origin
        this._updateChunks(new THREE.Vector3(0, 0, 0));
        return this.mesh;
    }

    update(playerPos, skySystem, deltaTime = 1 / 60) {
        if (playerPos) {
            this._updateChunks(playerPos);
        }

        // Animate everything
        this.objects.forEach(obj => {
            if (obj.instance && obj.instance.update) {
                // Class instance based (BlackHole, Anomaly)
                obj.instance.update(deltaTime);
            } else if (obj.type === 'stars' || obj.type === 'supernova') {
                if (obj.material.uniforms) {
                    obj.material.uniforms.time.value += deltaTime;
                }
            } else if (obj.type === 'galaxy') {
                obj.mesh.rotation.y += obj.rotSpeed * deltaTime;

                // Update shader uniforms
                if (obj.material && obj.material.uniforms) {
                    obj.material.uniforms.time.value += deltaTime;
                    if (playerPos) {
                        obj.material.uniforms.camPos.value.copy(playerPos);
                    }
                }
            }
        });
    }

    _updateChunks(playerPos) {
        const cx = Math.floor(playerPos.x / this.chunkSize);
        const cy = Math.floor(playerPos.y / this.chunkSize);
        const cz = Math.floor(playerPos.z / this.chunkSize);

        const centerKey = `${cx},${cy},${cz}`;

        if (this.lastChunkKey === centerKey) return; // No change
        this.lastChunkKey = centerKey;

        // Determine needed chunks
        const neededChunks = new Set();
        const range = this.renderDistance;

        for (let x = -range; x <= range; x++) {
            for (let y = -range; y <= range; y++) {
                for (let z = -range; z <= range; z++) {
                    neededChunks.add(`${cx + x},${cy + y},${cz + z}`);
                }
            }
        }

        // Remove old chunks
        for (const [key, group] of this.chunks) {
            if (!neededChunks.has(key)) {
                this.mesh.remove(group);

                // Dispose resources if needed
                this.objects = this.objects.filter(obj => {
                    if (obj.chunkKey === key) {
                        if (obj.instance && obj.instance.dispose) {
                            obj.instance.dispose();
                        }
                        return false;
                    }
                    return true;
                });

                // Remove gravity attractors from this chunk
                this.gravityAttractors = this.gravityAttractors.filter(a => a.chunkKey !== key);

                this.chunks.delete(key);
            }
        }

        // Create new chunks
        for (const key of neededChunks) {
            if (!this.chunks.has(key)) {
                const [ix, iy, iz] = key.split(',').map(Number);
                const chunkGroup = this._generateChunk(ix, iy, iz, key);
                this.mesh.add(chunkGroup);
                this.chunks.set(key, chunkGroup);
            }
        }

        // Star Visibility LOD
        // Hide stars in distant chunks to reduce noise and improve performance
        const starRenderDist = 1; // Only show stars in immediate neighbors (3x3x3 area)

        for (const [key, group] of this.chunks) {
            const [ix, iy, iz] = key.split(',').map(Number);
            const dist = Math.max(Math.abs(cx - ix), Math.abs(cy - iy), Math.abs(cz - iz));

            const starMesh = group.getObjectByName('stars');
            if (starMesh) {
                starMesh.visible = (dist <= starRenderDist);
            }
        }
    }

    _generateChunk(cx, cy, cz, key) {
        const chunkGroup = new THREE.Group();
        const offsetX = cx * this.chunkSize;
        const offsetY = cy * this.chunkSize;
        const offsetZ = cz * this.chunkSize;
        const center = new THREE.Vector3(offsetX, offsetY, offsetZ);

        // Check Minimum Height (for exclusion zones)
        if (offsetY < this.params.minSpawnHeight) {
            // Only generate stars, no planets/objects
            // Or generate nothing at all if we want pure empty space near ground
            // Let's generate sparse stars just so it's not a black void if looking up from edge
            this._generateStarfield(chunkGroup, center, key);
            return chunkGroup;
        }

        // Seed random based on position (simple hash)
        // Note: JS Math.random cannot be seeded easily. 
        // We will just use pure random for now, meaning backtracking creates DIFFERENT stars.
        // True procedural generation requires a deterministic seeded random.
        // Given current constraints, we accept random generation for "infinite" feel.

        // 1. Stars
        this._generateStarfield(chunkGroup, center, key);

        // 2. Galaxies (Random chance per chunk)
        if (Math.random() < 0.5) {
            this._generateGalaxies(chunkGroup, center, key);
        }

        // 3. Nebulae
        if (Math.random() < 0.8) {
            this._generateNebulae(chunkGroup, center, key);
        }

        // 4. Exotic Objects (Black Holes, Anomalies)
        this._generateExoticObjects(chunkGroup, center, key);

        // 5. Landmarks (Special hardcoded chunks?)
        // If near origin (0,0,0), spawn the big ones
        if (cx === 0 && cy === 0 && cz === 0) {
            this._generateLandmarks(chunkGroup);
        }

        return chunkGroup;
    }

    _generateLandmarks(group) {
        // Massive Galaxy near origin
        this._createSpiralGalaxy({
            position: new THREE.Vector3(0, -2000, -8000),
            radius: 6000,
            colorInside: new THREE.Color(0xffaa00),
            colorOutside: new THREE.Color(0xaa00ff),
            rotation: { x: 0.5, y: 0, z: 0.2 },
            group: group,
            chunkKey: '0,0,0'
        });
    }

    _generateStarfield(group, center, key) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];

        const colorPalette = [
            new THREE.Color(0xffffff), new THREE.Color(0xaabbff),
            new THREE.Color(0xffddaa), new THREE.Color(0xffaa88)
        ];

        for (let i = 0; i < this.params.starCount; i++) {
            // Random position within chunk volume
            const x = center.x + (Math.random() - 0.5) * this.chunkSize;
            const y = center.y + (Math.random() - 0.5) * this.chunkSize;
            const z = center.z + (Math.random() - 0.5) * this.chunkSize;

            positions.push(x, y, z);

            const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors.push(color.r, color.g, color.b);
            sizes.push(Math.random() * 2.0);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

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
                varying float vDistanceAlpha;
                
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // Size attenuation
                    gl_PointSize = size * pixelRatio * (5000.0 / -mvPosition.z);
                    
                    // Twinkle effect
                    float twinkle = sin(time * 2.0 + position.x * 0.1) * 0.5 + 0.5;
                    gl_PointSize *= (0.8 + 0.4 * twinkle);

                    // Calculate opacity fade based on distance from camera (View Space origin is 0,0,0)
                    float dist = length(mvPosition.xyz);
                    // Fade out starts at 10000, fully invisible by 25000 (just before chunk edge)
                    vDistanceAlpha = 1.0 - smoothstep(10000.0, 25000.0, dist);

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vDistanceAlpha;
                
                void main() {
                    if (vDistanceAlpha <= 0.0) discard;

                    // Circular particle
                    vec2 center = gl_PointCoord - 0.5;
                    float dist = length(center);
                    if (dist > 0.5) discard;
                    
                    // Soft edge
                    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                    
                    // Combine alpha
                    gl_FragColor = vec4(vColor, alpha * vDistanceAlpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const starSystem = new THREE.Points(geometry, material);
        starSystem.name = 'stars'; // Name it for LOD toggling
        group.add(starSystem);
        this.objects.push({ type: 'stars', mesh: starSystem, material: material, chunkKey: key });
    }

    _generateGalaxies(group, center, key) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            const pos = new THREE.Vector3(
                center.x + (Math.random() - 0.5) * this.chunkSize * 0.8,
                center.y + (Math.random() - 0.5) * this.chunkSize * 0.8,
                center.z + (Math.random() - 0.5) * this.chunkSize * 0.8
            );
            this._createSpiralGalaxy({ position: pos, group: group, chunkKey: key });
        }
    }

    _createSpiralGalaxy(opts = {}) {
        const starCount = 4000; // Increased count
        const arms = opts.arms || (3 + Math.floor(Math.random() * 4)); // 3 to 6 arms
        const radius = opts.radius || (3000 + Math.random() * 4000);
        const coreSize = radius * 0.15; // Bright core

        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];
        const phases = []; // For animation offset

        const insideColor = opts.colorInside || new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
        const outsideColor = opts.colorOutside || new THREE.Color().setHSL(Math.random(), 0.8, 0.4);

        // Core Stars (Dense ball)
        const coreStars = Math.floor(starCount * 0.2);
        for (let i = 0; i < coreStars; i++) {
            // Uniform sphere distribution
            const r = Math.pow(Math.random(), 3) * coreSize; // Concentrate in center
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta) * 0.5; // Flattened y
            const z = r * Math.cos(phi);

            positions.push(x, y, z);

            // Core colors are bright/white-hot
            const color = insideColor.clone().lerp(new THREE.Color(1, 1, 1), 0.5);
            colors.push(color.r, color.g, color.b);
            sizes.push(2.0 + Math.random() * 3.0);
            phases.push(Math.random() * Math.PI * 2);
        }

        // Arm Stars
        const armStars = starCount - coreStars;
        for (let i = 0; i < armStars; i++) {
            const rNormal = Math.random();
            const r = rNormal * radius;

            const spinFactor = 5.0; // How many turns
            const spinAngle = (r / radius) * spinFactor;

            const branchAngle = (Math.floor(Math.random() * arms) / arms) * Math.PI * 2;

            // Random scatter from arm center
            // Wider spread, but concentrated at center
            const spread = (r / radius) * 800 + 100;

            // Gaussian-like distribution (dense at center, sparse at edges)
            const gaussian = (Math.random() - 0.5) + (Math.random() - 0.5); // Range -1 to 1, biased to 0
            const randomOffset = gaussian * spread;
            const randomOffsetZ = ((Math.random() - 0.5) + (Math.random() - 0.5)) * spread;

            const thickness = (1.0 - (r / radius)) * 200 + 50; // Thicker at center

            const totalAngle = branchAngle + spinAngle;

            const x = Math.cos(totalAngle) * r + randomOffset;
            const y = (Math.random() - 0.5) * thickness;
            const z = Math.sin(totalAngle) * r + randomOffsetZ;

            positions.push(x, y, z);

            const mixedColor = insideColor.clone().lerp(outsideColor, r / radius);
            mixedColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
            colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
            sizes.push(1.0 + Math.random() * 2.5);
            phases.push(Math.random() * Math.PI * 2);
        }

        // Gas/Dust Clouds (Volumetric fill)
        // Gas/Dust Clouds (Volumetric fill)
        const gasCount = starCount * 2; // Lots of gas particles
        for (let i = 0; i < gasCount; i++) {
            const rNormal = Math.random();
            const r = rNormal * radius;

            const spinFactor = 5.0;
            const spinAngle = (r / radius) * spinFactor;

            const branchAngle = (Math.floor(Math.random() * arms) / arms) * Math.PI * 2;

            // Gas is much more spread out
            // Increased multiplier for wider clouds
            const spread = (r / radius) * 1200 + 300;

            // Biased distribution (less particles at edges of spread)
            const gaussian = (Math.random() - 0.5) + (Math.random() - 0.5);
            const randomOffset = gaussian * spread;
            const randomOffsetZ = ((Math.random() - 0.5) + (Math.random() - 0.5)) * spread;

            const thickness = (1.0 - (r / radius)) * 500 + 100;

            const totalAngle = branchAngle + spinAngle;

            const x = Math.cos(totalAngle) * r + randomOffset;
            const y = (Math.random() - 0.5) * thickness;
            const z = Math.sin(totalAngle) * r + randomOffsetZ;

            positions.push(x, y, z);

            const param = r / radius;
            const gasColor = insideColor.clone().lerp(outsideColor, param);
            gasColor.offsetHSL(0, 0.2, -0.2);

            // Varied intensity
            const intensity = 0.1 + Math.random() * 0.2;
            colors.push(gasColor.r * intensity, gasColor.g * intensity, gasColor.b * intensity);

            sizes.push(50.0 + Math.random() * 100.0);
            phases.push(Math.random() * Math.PI * 2);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('starColor', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));

        // Custom Shader Material for Bloom and Twinkle
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                pixelRatio: { value: window.devicePixelRatio },
                camPos: { value: new THREE.Vector3() },
                bloomDist: { value: 50.0 }, // Distance where bloom starts maxing out
                baseSize: { value: 0.5 }
            },
            vertexShader: `
                uniform float time;
                uniform float pixelRatio;
                uniform vec3 camPos;
                uniform float bloomDist;
                uniform float baseSize;
                
                attribute float size;
                attribute vec3 starColor;
                attribute float phase;
                
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    
                    // Distance to camera
                    float distToCam = distance(worldPosition.xyz, camPos);
                    
                    // Bloom/Intensity Logic
                    // 1. Boost brightness when VERY close (bloomDist = ~50)
                    float proximityBoost = clamp((bloomDist - distToCam) / bloomDist, 0.0, 1.0) * 4.0;
                    
                    // 2. DAMPEN brightness when far away to prevent bloom
                    // As distance increases beyond 2000, fade intensity down to 0.05 (no bloom)
                    float distanceDim = clamp(1.0 - (distToCam - 9000.0) / 10000.0, 0.05, 1.0);
                    
                    float finalIntensity = (1.0 + proximityBoost) * distanceDim;

                    vColor = starColor * finalIntensity;
                    
                    // Twinkle
                    float twinkle = sin(time * 3.0 + phase) * 0.3 + 0.7;
                    
                    gl_PointSize = size * baseSize * pixelRatio * (1000.0 / -mvPosition.z) * twinkle;
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // Fade distant stars
                    vAlpha = 1.0; 
                }
            `,
            fragmentShader: `
                // Remove manual precision to avoid conflicts with Three.js defaults
                
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    float dist = length(coord);
                    
                    if (dist > 0.5) discard;
                    
                    // Soft particle
                    float strength = 1.0 - (dist * 2.0);
                    strength = pow(max(0.0, strength), 1.5); // Safe pow
                    
                    gl_FragColor = vec4(vColor, vAlpha * strength);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const galaxy = new THREE.Points(geometry, material);
        if (opts.position) galaxy.position.copy(opts.position);

        // Random initial rotation
        if (opts.rotation) galaxy.rotation.set(opts.rotation.x, opts.rotation.y, opts.rotation.z);
        else galaxy.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);

        // Add to specific group (chunk or main)
        (opts.group || this.mesh).add(galaxy);

        const galaxyData = {
            type: 'galaxy',
            mesh: galaxy,
            material: material, // Store material ref for updates
            chunkKey: opts.chunkKey,
            rotSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() < 0.5 ? 1 : -1)
        };
        this.objects.push(galaxyData);

        // Register galaxy as gravity attractor
        const worldPos = opts.position ? opts.position.clone() : new THREE.Vector3();
        this.gravityAttractors.push({
            position: worldPos,
            mass: this.GALAXY_MASS,
            type: 'galaxy',
            chunkKey: opts.chunkKey
        });
    }

    _generateNebulae(group, center, key) {
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const pos = new THREE.Vector3(
                center.x + (Math.random() - 0.5) * this.chunkSize * 0.9,
                center.y + (Math.random() - 0.5) * this.chunkSize * 0.9,
                center.z + (Math.random() - 0.5) * this.chunkSize * 0.9
            );
            const scale = 3000 + Math.random() * 4000;
            const color = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);

            this._createNebula({ position: pos, scale: scale, color: color, group: group, chunkKey: key });
        }
    }

    _createNebula(opts) {
        const texture = this._getCloudTexture();
        const material = new THREE.SpriteMaterial({
            map: texture, transparent: true, opacity: 0.4,
            color: opts.color || 0x8800ff, blending: THREE.AdditiveBlending, depthWrite: false,
            fog: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(opts.scale, opts.scale, 1);
        sprite.position.copy(opts.position);

        (opts.group || this.mesh).add(sprite);
        // Nebulae static, no update needed usually, but we could add pulse
    }

    _getStarTexture() {
        if (!this._starTexture) this._starTexture = this._createStarTexture();
        return this._starTexture;
    }

    _createStarTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'white'); grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
        return new THREE.CanvasTexture(canvas);
    }

    _getCloudTexture() {
        if (!this._cloudTexture) this._cloudTexture = this._createCloudTexture();
        return this._cloudTexture;
    }

    _createCloudTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, size, size);

        // Draw cloud puffs
        for (let i = 0; i < 40; i++) {
            const x = (0.2 + 0.6 * Math.random()) * size; // Keep somewhat centered
            const y = (0.2 + 0.6 * Math.random()) * size;
            const r = (0.1 + 0.2 * Math.random()) * size;

            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255,255,255,0.15)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Force fade out at edges
        ctx.globalCompositeOperation = 'destination-in';
        const maskGrad = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.5);
        maskGrad.addColorStop(0, 'rgba(0,0,0,1)');
        maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = maskGrad;
        ctx.fillRect(0, 0, size, size);

        return new THREE.CanvasTexture(canvas);
    }

    _generateExoticObjects(group, center, key) {
        // Black Hole Generation
        if (Math.random() < this.params.blackHoleChance) {
            const pos = new THREE.Vector3(
                center.x + (Math.random() - 0.5) * this.chunkSize * 0.7,
                center.y + (Math.random() - 0.5) * this.chunkSize * 0.7,
                center.z + (Math.random() - 0.5) * this.chunkSize * 0.7
            );

            // 50% chance of being a Pulsar
            const isPulsar = Math.random() < 0.5;

            const blackHole = new BlackHole({
                scale: 500 + Math.random() * 1000,
                colorInner: isPulsar ? '#88ccff' : '#ffc880',
                colorOuter: isPulsar ? '#ff44ff' : '#ff5050',
                isPulsar: isPulsar,
                distortion: this.params.blackHoleDistortion, // Configurable
                diskRadius: this.params.blackHoleDiskSize,   // Configurable
                bloomIntensity: this.params.blackHoleBloom   // Configurable
            });

            blackHole.mesh.position.copy(pos);
            group.add(blackHole.mesh);

            this.objects.push({
                type: 'blackhole',
                instance: blackHole,
                chunkKey: key
            });

            // Register black hole as gravity attractor (high mass!)
            this.gravityAttractors.push({
                position: pos.clone(),
                mass: this.BLACK_HOLE_MASS,
                type: 'blackhole',
                chunkKey: key
            });
        }

        // Spatial Anomaly Generation
        if (Math.random() < this.params.anomalyChance) {
            const pos = new THREE.Vector3(
                center.x + (Math.random() - 0.5) * this.chunkSize * 0.8,
                center.y + (Math.random() - 0.5) * this.chunkSize * 0.8,
                center.z + (Math.random() - 0.5) * this.chunkSize * 0.8
            );

            const anomaly = new SpatialAnomaly({
                radius: 100 + Math.random() * 300,
                color: new THREE.Color().setHSL(Math.random(), 1.0, 0.5),
                bloomIntensity: this.params.anomalyBloom,    // Configurable
                speed: this.params.anomalySpeed,             // Configurable
                maxDistortion: this.params.anomalyDistortion // Configurable
            });

            anomaly.mesh.position.copy(pos);
            group.add(anomaly.mesh);

            this.objects.push({
                type: 'anomaly',
                instance: anomaly,
                chunkKey: key
            });
        }
    }

    getHeightAt() { return -100000; }
    getNormalAt() { return new THREE.Vector3(0, 1, 0); }
    getSurfaceType() { return SurfaceTypes.TARMAC; }
    getSpawnPosition() { return new THREE.Vector3(0, 500, 0); }
    getGravity() { return 0; } // Earth gravity disabled - we use gravitational attractors instead
    getThrustMultiplier() { return this.params.thrustMultiplier; }

    /**
     * Calculate gravitational force from nearby attractors (black holes, galaxies)
     * Uses Newtonian gravity: F = G * M / r^2, direction toward attractor
     * @param {THREE.Vector3} playerPos - Current player position
     * @returns {THREE.Vector3} - Net gravitational acceleration vector
     */
    getGravitationalForce(playerPos) {
        const force = new THREE.Vector3(0, 0, 0);

        if (!playerPos || this.gravityAttractors.length === 0) {
            return force;
        }

        // Calculate distance to each attractor and sort by closest
        const attractorsWithDist = this.gravityAttractors
            .map(a => ({
                ...a,
                dist: a.position.distanceTo(playerPos)
            }))
            .filter(a => a.dist < this.MAX_GRAVITY_DISTANCE) // Only filter by max, not min
            .sort((a, b) => a.dist - b.dist)
            .slice(0, this.MAX_ATTRACTORS);

        // Maximum acceleration cap (500 m/s² ~= 50G, needed for high-speed orbits)
        const MAX_ACCELERATION = 500;

        // Apply gravitational acceleration from each attractor
        for (const attractor of attractorsWithDist) {
            const direction = attractor.position.clone().sub(playerPos).normalize();

            // Use soft minimum distance to prevent extreme forces at very close range
            // This creates smooth falloff instead of hard cutoff
            const effectiveDist = Math.max(attractor.dist, this.MIN_GRAVITY_DISTANCE);
            const distSq = effectiveDist * effectiveDist;

            // a = G * M / r^2, scaled by gravityScale parameter
            let acceleration = (this.GRAVITY_CONSTANT * attractor.mass * this.params.gravityScale) / distSq;

            // Cap acceleration to prevent extreme forces
            acceleration = Math.min(acceleration, MAX_ACCELERATION);

            force.add(direction.multiplyScalar(acceleration));
        }

        return force;
    }

    /**
     * Get list of nearby attractors for UI/debugging
     * @param {THREE.Vector3} playerPos - Current player position
     * @returns {Array} - Array of {type, distance, direction} objects
     */
    getNearbyAttractors(playerPos) {
        if (!playerPos) return [];

        return this.gravityAttractors
            .map(a => ({
                type: a.type,
                distance: a.position.distanceTo(playerPos),
                position: a.position.clone()
            }))
            .filter(a => a.distance < this.MAX_GRAVITY_DISTANCE)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5);
    }

    /**
     * Check if this is Deep Space terrain (for warp effect)
     * @returns {boolean}
     */
    isDeepSpace() {
        return true;
    }
}
