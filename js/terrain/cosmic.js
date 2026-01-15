import * as THREE from 'three';
import { BasePhysicsProvider, SurfaceTypes } from '../physics/physics-provider.js';
import { DeepSpaceGenerator } from './deep-space.js';

/**
 * Cosmic Generator - Infinite Procedural Space Road
 * Replaces the old cosmic level with a new architecture:
 * 1. Background: Uses DeepSpaceGenerator (Stars, Nebulas, Black Holes)
 * 2. Road: Procedural Spline-based road with Turns, Slopes, and Corkscrews
 */
export class CosmicGenerator extends BasePhysicsProvider {
    constructor(params = {}) {
        super();
        this.params = Object.assign({
            // === Road Generation ===
            roadWidth: 170,          // Wider road for space flight
            segmentLength: 200000,   // Effectively infinite
            curveIntensity: 300,     // Harder turns
            slopeIntensity: 200,     // Steeper slopes
            corkscrewChance: 0.3,    // Chance of barrel roll sections

            // === Deep Space Background ===
            // Chunk System
            universeSize: 30000,     // Chunk size for celestial objects
            renderDistance: 1,       // How many chunks to render around player

            // Star Generation
            starCount: 2000,         // Stars per chunk

            // Galaxy Generation
            galaxyCount: 1000,          // Galaxies per chunk (avg)
            galaxyChance: 100,       // Chance to spawn galaxies in a chunk

            // Nebula Generation
            nebulaCount: 0,          // Nebulae per chunk (avg)
            nebulaChance: 0,       // Chance to spawn nebulae in a chunk

            // Black Hole Generation
            blackHoleChance: 0.1,    // Chance per chunk to spawn a black hole
            blackHoleBloom: 0.2,     // Multiplier for black hole glow
            blackHoleDistortion: 0.15, // Lensing strength
            blackHoleDiskSize: 5.0,  // Accretion disk scale

            // Spatial Anomaly Generation
            anomalyChance: 2,        // Chance per chunk (can be > 1 for guaranteed spawns)
            anomalyBloom: 0.1,       // Multiplier for anomaly glow
            anomalySpeed: 1.0,       // Rotation speed multiplier
            anomalyDistortion: 0.5,  // Max glitch distortion

            // Physics
            thrustMultiplier: 100,   // Multiplier for plane speed/thrust
            gravityScale: 1000,      // Overall gravity strength multiplier
            minSpawnHeight: -Infinity // Allow stars everywhere
        }, params);

        // --- Components ---
        this.mesh = new THREE.Group();
        this.roadMesh = null;

        // Create DeepSpaceGenerator with all customizable params
        this.backgroundGenerator = new DeepSpaceGenerator({
            universeSize: this.params.universeSize,
            renderDistance: this.params.renderDistance,
            starCount: this.params.starCount,
            galaxyCount: this.params.galaxyCount,
            nebulaCount: this.params.nebulaCount,
            blackHoleChance: this.params.blackHoleChance,
            blackHoleBloom: this.params.blackHoleBloom,
            blackHoleDistortion: this.params.blackHoleDistortion,
            blackHoleDiskSize: this.params.blackHoleDiskSize,
            anomalyChance: this.params.anomalyChance,
            anomalyBloom: this.params.anomalyBloom,
            anomalySpeed: this.params.anomalySpeed,
            anomalyDistortion: this.params.anomalyDistortion,
            thrustMultiplier: this.params.thrustMultiplier,
            gravityScale: this.params.gravityScale,
            minSpawnHeight: this.params.minSpawnHeight
        });

        // Add background to our group
        const bgMesh = this.backgroundGenerator.generate();
        this.mesh.add(bgMesh);

        // --- Path Parameters ---
        // We use a set of frequencies to generate a deterministic pseudo-random path
        // Lower frequencies = longer wavelengths = smoother transitions
        this.seed = Math.random() * 1000;
        this.frequencies = {
            // X-Axis (Turns) - Tighter curves for drifting
            turnMacro: 0.0006,   // Big sweeping turns (one cycle per ~1650 units)
            turnMicro: 0.0025,   // Tighter weaving for drift sections (one cycle per ~400 units)

            // Y-Axis (Elevation) - Noticeable hills
            slopeMacro: 0.0003,  // Big hills/dives (one cycle per ~3300 units)
            slopeMicro: 0.001,   // Medium undulation (one cycle per ~1000 units)

            // Banking (Corkscrews) - Gradual roll zones
            rollFreq: 0.0004     // Infrequent roll zones
        };
    }

    /**
     * Smoothstep function for C1-continuous transitions
     * Returns value between 0 and 1 with smooth derivative at boundaries
     */
    _smoothstep(t) {
        t = Math.max(0, Math.min(1, t));
        return t * t * (3 - 2 * t);
    }

    generate() {
        // Generate the Road Geometry
        // Since we need to support "Infinite" movement, we technically should strictly generate 
        // geometry around the camera. For this anticipated demo usage, we'll generate a 
        // massive strip forward from Z=0.

        const segments = 6000;
        const widthSegments = 30; // Smooth curve interpolation

        // Custom BufferGeometry allows us to strictly control every vertex
        // for exact match with our physics math.
        const geometry = new THREE.BufferGeometry();

        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        // Generation loop
        // We generate "rings" of vertices along the Z axis
        const zStart = -1000;
        const zEnd = this.params.segmentLength;
        const zStep = (zEnd - zStart) / segments;

        for (let i = 0; i <= segments; i++) {
            const z = zStart + i * zStep;

            // Get Path Properties at this Z
            const center = this._getPathPoint(z);
            const tangent = this._getTangent(z);
            const up = this._getNormalVector(z); // The "Up" vector of the road surface
            const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

            // Create Ring of vertices
            for (let j = 0; j <= widthSegments; j++) {
                // u goes from -0.5 to 0.5 (left to right)
                const u = (j / widthSegments) - 0.5;
                const xOffset = u * this.params.roadWidth;

                // Position: Center + Right * Offset
                const pos = new THREE.Vector3()
                    .copy(center)
                    .add(right.clone().multiplyScalar(xOffset));

                positions.push(pos.x, pos.y, pos.z);

                // Normal: Same as 'up' vector
                normals.push(up.x, up.y, up.z);

                // UVs
                uvs.push(j / widthSegments, z / 50.0); // Tiling texture along Z
            }
        }

        // Indices
        // Grid topology
        const vertsPerRing = widthSegments + 1;
        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < widthSegments; j++) {
                const a = i * vertsPerRing + j;
                const b = (i + 1) * vertsPerRing + j;
                const c = i * vertsPerRing + j + 1;
                const d = (i + 1) * vertsPerRing + j + 1;

                // Two triangles
                indices.push(a, b, d);
                indices.push(a, d, c);
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);

        // --- Material ---
        // Neon / Tron style road
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                roadWidth: { value: this.params.roadWidth }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPos;
                varying vec3 vNormal;
                
                void main() {
                    vUv = uv;
                    vPos = position;
                    vNormal = normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                varying vec3 vNormal;
                
                void main() {
                    // Grid effect
                    float gridX = step(0.95, abs(vUv.x * 2.0 - 1.0)); // Edge lines
                    float gridZ = step(0.98, fract(vUv.y * 2.0)); // Static transverse lines
                    
                    // Central line (thinner and very dim)
                    float centerLine = (1.0 - smoothstep(0.01, 0.03, abs(vUv.x - 0.5))) * 0.15;
                    
                    // Base Code - Much darker
                    vec3 color = vec3(0.01, 0.0, 0.02); // Very Dark Purple base
                    
                    // Neon Blue/Cyan highlights - Dimmed
                    vec3 highlight = vec3(0.0, 0.6, 0.8);
                    
                    // Mix
                    color += highlight * (gridX * 0.8 + gridZ * 0.4 + centerLine);
                    
                    // Add subtle pulse - Reduced intensity
                    float pulse = 0.5 + 0.5 * sin(vUv.y * 0.1 + time);
                    color += vec3(0.1, 0.0, 0.2) * pulse * 0.1;

                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });

        this.roadMesh = new THREE.Mesh(geometry, material);
        this.roadMesh.receiveShadow = true;
        this.mesh.add(this.roadMesh);

        return this.mesh;
    }

    update(deltaTime, playerPos, camera) {
        // Update Road Shader
        if (this.roadMesh && this.roadMesh.material.uniforms) {
            this.roadMesh.material.uniforms.time.value += deltaTime;
        }

        // Delegate to Background Generator
        if (this.backgroundGenerator) {
            // Background needs update for chunk management and effects
            // Pass camera to allow view-dependent effects (like Black Hole lensing)
            this.backgroundGenerator.update(playerPos, null, deltaTime, camera);
        }
    }

    // --- Mathematical Definition of the Path ---
    // This MUST match the geometry generation exactly for physics to work.

    /**
     * Get the center position of the road at linear distance z
     */
    _getPathPoint(z) {
        // Use seeded sine waves
        const s = this.seed;

        // Safe Zone: Dampen chaos near start (first 1500m)
        // Ensure track starts at (0,0,0) and straight
        if (z < 0) return new THREE.Vector3(0, 0, z); // Behind start is straight

        // Extended safe zone with smoothstep for gradual introduction of curves
        const safeZone = Math.min(1.0, z / 1500.0);
        const chaos = this._smoothstep(safeZone); // Smooth C1 transition

        // 1. Base Curve (X-Axis)
        // Tighter turns for drift sections
        const x = (
            Math.sin(z * this.frequencies.turnMacro + s) * this.params.curveIntensity * 2.0 +
            Math.sin(z * this.frequencies.turnMicro + s * 1.5) * this.params.curveIntensity * 0.8
        ) * chaos;

        // 2. Elevation (Y-Axis)
        // Noticeable hills and valleys with smooth transitions
        const y = (
            Math.sin(z * this.frequencies.slopeMacro + s * 0.5) * this.params.slopeIntensity * 2.0 +
            Math.cos(z * this.frequencies.slopeMicro + s * 0.7) * this.params.slopeIntensity * 0.8
        ) * chaos;

        return new THREE.Vector3(x, y, z);
    }

    /**
     * Get the banking angle (roll) at distance z
     * This allows for corkscrews and loops.
     */
    _getBankAngle(z) {
        // Safe Zone - Use smoothstep for C1 continuity
        // Banking starts gradually at z=1000 and is fully active by z=3000
        const safeT = Math.min(1.0, Math.max(0, (z - 1000) / 2000.0));
        const safeZone = this._smoothstep(safeT);
        if (safeZone === 0) return 0;

        const s = this.seed;

        // Base banking based on turn curvature (Natural banking)
        // Calculate approximate curvature using larger delta for stability
        const delta = 5.0;
        const x1 = this._getPathPoint(z - delta).x;
        const x2 = this._getPathPoint(z + delta).x;
        const xC = this._getPathPoint(z).x;
        // Second derivative approx
        const curvature = (x2 - 2 * xC + x1) / (delta * delta);

        // Reduced banking multiplier for gentler tilt
        let bank = -curvature * 150.0; // Gentler banking into turns

        // Corkscrew modifier - very gradual
        const rollZone = Math.sin(z * this.frequencies.rollFreq + s);

        // Smooth transition into roll zones (0.85 -> 1.0 maps to 0 -> 1)
        const rollT = Math.min(1.0, Math.max(0, (rollZone - 0.85) / 0.15));
        const rollIntensity = this._smoothstep(rollT);

        // Smoothly interpolate bank multiplier from 1x to 2x (gentler roll zones)
        bank *= 1.0 + rollIntensity * 1.0;

        // Clamp maximum bank angle to prevent extreme tilts
        bank = Math.max(-Math.PI * 0.4, Math.min(Math.PI * 0.4, bank));

        return bank * safeZone;
    }

    /**
     * Get the tangent vector (direction of road) at z
     */
    _getTangent(z) {
        const delta = 0.5;
        const p1 = this._getPathPoint(z - delta);
        const p2 = this._getPathPoint(z + delta);
        return new THREE.Vector3().subVectors(p2, p1).normalize();
    }

    /**
     * Get the Normal (Up) vector of the road surface at z
     * Incorporates banking.
     */
    _getNormalVector(z) {
        const tangent = this._getTangent(z);
        const bankAngle = this._getBankAngle(z);

        // Standard Up (World Y)
        const worldUp = new THREE.Vector3(0, 1, 0);

        // Calculate Right vector (Tangent x WorldUp)
        // Note: If Tangent is vertical, this breaks. 
        // But our path equation (z linear) prevents pure vertical tangents.
        let right = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();

        // Recalculate true Up (Right x Tangent) to ensure orthogonality before rotation
        let up = new THREE.Vector3().crossVectors(right, tangent).normalize();

        // Apply Banking Rotation
        // Rotate 'up' and 'right' around 'tangent' by bankAngle
        // We only return 'up', so just rotate 'up'.
        up.applyAxisAngle(tangent, bankAngle);

        return up;
    }

    // --- Physics Interface ---

    getHeightAt(worldX, worldZ) {
        // Iterative Refinement to find correct Spline Parameter 's'
        // The point (worldX, worldZ) lies on the line: C(s) + Right(s) * t
        // We need to find 's' and 't' such that the X and Z coords match.
        // Naive approximation: s = worldZ.
        // We iterate to minimize the Z error.

        let s = worldZ;
        let t = 0;
        const iterations = 4; // 3-4 iterations are usually enough for high precision

        for (let i = 0; i < iterations; i++) {
            const center = this._getPathPoint(s);
            const tangent = this._getTangent(s);
            const normal = this._getNormalVector(s);
            const right = new THREE.Vector3().crossVectors(tangent, normal).normalize();

            // Project current error onto the road axis
            // We want to find t such that: C.x + R.x * t = worldX  AND  C.z + R.z * t = worldZ
            // But we can only freely choose 's' (moves C) and 't'.
            // Let's solve for 't' using the vector dot product in 2D (XZ plane) logic?
            // Actually, simpler: calculate 't' based on projection onto Right vector
            // vector D = (worldX - C.x, 0, worldZ - C.z)
            // t = D dot Right (considering only XZ usually? or 3D?)
            // 3D projection is safer:
            const dx = worldX - center.x;
            const dz = worldZ - center.z;

            // t is finding lateral offset.
            // approx: t = dx * right.x + dz * right.z; 
            // (Assuming right is mostly in XZ plane and normalized)
            t = dx * right.x + dz * right.z;

            // Now, adjust 's' to reduce the longitudinal error.
            // Longitudinal vector matches Tangent.
            // longDist = dx * tangent.x + dz * tangent.z;

            // This longitudinal distance is essentially "how far along the curve relative to C(s) are we?"
            // We should add this to 's'.
            const sOffset = dx * tangent.x + dz * tangent.z;
            s += sOffset;
        }

        // Final Calculation with refined 's'
        const center = this._getPathPoint(s);
        const tangent = this._getTangent(s);
        const normal = this._getNormalVector(s);
        const right = new THREE.Vector3().crossVectors(tangent, normal).normalize();

        // Calculate final t
        const dx = worldX - center.x;
        const dz = worldZ - center.z;
        t = dx * right.x + dz * right.z;

        // Check bounds
        const halfWidth = this.params.roadWidth / 2;
        if (Math.abs(t) <= halfWidth + 5.0) { // Increased margin for safety
            // Calculate Y
            // Y = C.y + Right.y * t
            return center.y + right.y * t;
        }

        return -10000; // Abyss
    }

    getNormalAt(worldX, worldZ) {
        // Also need refinement for Normal to be consistent with Height
        let s = worldZ;
        for (let i = 0; i < 3; i++) {
            const center = this._getPathPoint(s);
            const tangent = this._getTangent(s);
            // Optimization: Minimal recalc needed for 's' update
            const dx = worldX - center.x;
            const dz = worldZ - center.z;
            const sOffset = dx * tangent.x + dz * tangent.z;
            s += sOffset;
        }
        return this._getNormalVector(s);
    }

    getSurfaceType(worldX, worldZ) {
        return SurfaceTypes.TARMAC;
    }

    getSpawnPosition() {
        // Road is guaranteed to be flat and at (0,0,0) for the first 500m
        // Spawn slightly up to drop in
        return new THREE.Vector3(0, 5, 0);
    }

    // Allow for special gravity or physics tweaks
    isDeepSpace() {
        return true;
    }

    getGravity() {
        // In "Deep Space" level, typical gravity is disabled or handled by attractors?
        // But for the Road, we want "Magnetic" gravity that pulls the car onto the track locally?
        // Or standard gravity?
        // Use standard gravity (9.81) so the car sits on the track, 
        // BUT the physics engine mostly cares about `getHeightAt`.
        // If the track is inverted, gravity needs to pull "Up" relative to world (Down relative to track).

        // PlanePhysics handles "isGrounded" logic.
        // It doesn't currently support custom gravity *vectors* from the provider, only magnitude.
        // However, it DOES align the plane to `getNormalAt`.

        // If we want to ride upside down loops, we need the "downforce" logic in PlanePhysics 
        // to dominate, or zero gravity.

        return 9.81;
    }

    getGravitationalForce(playerPos) {
        // Delegate to background for black hole pulls
        return this.backgroundGenerator.getGravitationalForce(playerPos);
    }
}
