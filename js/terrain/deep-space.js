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
            starCount: 2000,      // Per chunk
            galaxyCount: 1,       // Per chunk (avg)
            nebulaCount: 2,       // Per chunk (avg)
            universeSize: 20000   // Chunk Size
        }, params);

        this.mesh = new THREE.Group();
        this.objects = []; // Store references to update animations

        // Chunk System
        this.chunks = new Map(); // "x,y,z" -> THREE.Group
        this.chunkSize = this.params.universeSize;
        this.renderDistance = 1; // Increased from 2 for further visibility
        this.lastChunkKey = null;
    }

    generate() {
        // Initial generation at origin
        this._updateChunks(new THREE.Vector3(0, 0, 0));
        return this.mesh;
    }

    update(playerPos, skySystem) {
        const deltaTime = 1 / 60;

        if (playerPos) {
            this._updateChunks(playerPos);
        }

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
                // Dispose resources if needed (skip for now for perf)
                this.chunks.delete(key);

                // Also remove objects from this.objects list? 
                // This is O(N) but necessary to stop animating invisible things
                // For optimal perf we should bucket objects by chunk, but simple filter is ok logic wise
                this.objects = this.objects.filter(obj => obj.chunkKey !== key);
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

        // 4. Landmarks (Special hardcoded chunks?)
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
        const starCount = 2000;
        const arms = 3 + Math.floor(Math.random() * 3);
        const radius = opts.radius || (2000 + Math.random() * 3000);
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const insideColor = opts.colorInside || new THREE.Color(Math.random(), Math.random(), Math.random());
        const outsideColor = opts.colorOutside || new THREE.Color(Math.random(), Math.random(), Math.random());

        for (let i = 0; i < starCount; i++) {
            const r = Math.random() * radius;
            const spinAngle = r * 0.002;
            const branchAngle = (i % arms) / arms * Math.PI * 2;
            const x = Math.cos(branchAngle + spinAngle) * r + (Math.random() - 0.5) * r * 0.2;
            const y = (Math.random() - 0.5) * 200;
            const z = Math.sin(branchAngle + spinAngle) * r + (Math.random() - 0.5) * r * 0.2;
            positions.push(x, y, z);
            const mixedColor = insideColor.clone().lerp(outsideColor, r / radius);
            colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 15, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
            vertexColors: true, map: this._getStarTexture(), transparent: true
        });

        const galaxy = new THREE.Points(geometry, material);
        if (opts.position) galaxy.position.copy(opts.position);
        if (opts.rotation) galaxy.rotation.set(opts.rotation.x, opts.rotation.y, opts.rotation.z);
        else galaxy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        // Add to specific group (chunk or main)
        (opts.group || this.mesh).add(galaxy);

        this.objects.push({
            type: 'galaxy', mesh: galaxy, chunkKey: opts.chunkKey,
            rotSpeed: (Math.random() * 0.05 + 0.01) * (Math.random() < 0.5 ? 1 : -1)
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
            color: opts.color || 0x8800ff, blending: THREE.AdditiveBlending, depthWrite: false
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
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * 128, y = Math.random() * 128, r = 20 + Math.random() * 40;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255,255,255,0.1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        return new THREE.CanvasTexture(canvas);
    }

    _generateExoticObjects() { } // Skipped for now in chunks

    getHeightAt() { return -100000; }
    getNormalAt() { return new THREE.Vector3(0, 1, 0); }
    getSurfaceType() { return SurfaceTypes.TARMAC; }
    getSpawnPosition() { return new THREE.Vector3(0, 500, 0); }
    getGravity() { return 0; }
}
