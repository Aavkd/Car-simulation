import * as THREE from 'three';
import { BasePhysicsProvider, SurfaceTypes } from '../physics/physics-provider.js';

/**
 * Cosmic Generator - Infinite Psychedelic Road
 * Features:
 * - Complex composite wave path (straight sections + wild curves)
 * - Psychedelic shader effects
 * - Floating cosmic geometry
 */
export class CosmicGenerator extends BasePhysicsProvider {
    constructor(params = {}) {
        super();
        this.params = Object.assign({
            roadWidth: 30,
            segmentLength: 100000, // 100km effectively infinite for this demo
            curveIntensity: 200,   // Amplitude of curves
            slopeIntensity: 80,    // Amplitude of hills
        }, params);

        this.mesh = null;
        this.material = null;

        // Path Parameters for "Infinite" composite waves
        // We use multiple frequencies to create chaos and order
        // Low freq = general direction/large turns
        // High freq = tight twists
        // Modulator = creates straight sections when 0
        this.frequencies = {
            main: 0.0015,
            twist: 0.004,
            elevation: 0.002,
            modulator: 0.0005 // Very slow wave to turn curves on/off
        };
    }

    generate() {
        const segments = 4000;
        const widthSegments = 20; // Higher fidelity for the wave effect

        const geometry = new THREE.PlaneGeometry(
            this.params.roadWidth,
            this.params.segmentLength,
            widthSegments,
            segments
        );

        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv.array;

        for (let i = 0; i < positions.length; i += 3) {
            // Original plane creates a flat strip along Z encoded in positions
            // x varies from -width/2 to width/2
            // y is 0
            // z varies from -length/2 to length/2 (default PlaneGeometry centers it)
            // We want z to start at 0 and go positive for easier math, or handle the offset.
            // PlaneGeometry centers at 0, so Z ranges [-L/2, L/2]. Let's shift it to [0, L] logic or just use Z.
            // Using Z as is allows negative values, but our math works fine.

            const xLocal = positions[i];
            const z = positions[i + 2];

            // Get path position
            const center = this._getRoadPoint(z);
            const tangent = this._getTangent(z);

            // Calculate Banking (Lean into curves)
            // Bank angle based on curvature (derivative of tangent angle)
            // Simple robust banking: -curvature * specific_factor
            const curvature = this._getCurvature(z);
            const bankAngle = -curvature * 800.0; // Tuned multiplier

            // Construct local coordinate frame
            // T = tangent (normalized)
            // U = up (world Y rotated by bank)
            // R = right ( T x U )

            // Approximation for speed: 
            // 1. Shift by Center
            // 2. Rotate xLocal vector by Bank Angle approximated around Z axis
            //    (since we are mostly moving Forward along Z)

            const cosB = Math.cos(bankAngle);
            const sinB = Math.sin(bankAngle);

            // Apply bank rotation to the flat cross section
            // Flat: (xLocal, 0)
            // Rotated: (xLocal * cos, xLocal * sin)

            positions[i] = center.x + xLocal * cosB;     // World X
            positions[i + 1] = center.y + xLocal * sinB; // World Y
            // Z stays roughly same, strictly should compress but negligible for game
        }

        geometry.computeVertexNormals();

        // --- Psyschedlic Cosmic Shader ---
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                roadWidth: { value: this.params.roadWidth }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPos;
                varying float vDist;
                
                void main() {
                    vUv = uv;
                    vPos = position;
                    vDist = -viewMatrix[3].z; // Approx distance to camera
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float roadWidth;
                varying vec2 vUv;
                varying vec3 vPos;
                
                #define PI 3.14159265359

                // Cosine based palette, 4 vec3 params
                vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
                    return a + b*cos( 6.28318*(c*t+d) );
                }

                void main() {
                    // Normalize UV to -1.0 to 1.0 for X
                    vec2 uv = vUv;
                    float xCentered = (uv.x - 0.5) * 2.0; // -1 to 1 across road
                    
                    // Moving Stripe Effect
                    float zFlow = uv.y * 200.0 - time * 2.0;
                    
                    // 1. Central Pulse Line
                    float centerGlow = 1.0 - smoothstep(0.0, 0.1, abs(xCentered));
                    
                    // 2. Grid / Transverse Lines
                    float gridZ = smoothstep(0.9, 0.95, fract(zFlow));
                    
                    // 3. Edge Glow
                    float edgeGlow = smoothstep(0.5, 1.0, abs(xCentered));
                    
                    // 4. Plasma Background
                    // Create swirly visual
                    vec2 plasmaUV = uv * vec2(10.0, 100.0); // Stretch
                    plasmaUV.y -= time;
                    float plasma = sin(plasmaUV.y + sin(plasmaUV.x * 2.0 + time));
                    plasma += cos(plasmaUV.x * 3.0 + time * 0.5);
                    
                    // Color Palette: Deep Space
                    // Purple, Magenta, Cyan, Black
                    vec3 col1 = vec3(0.1, 0.0, 0.2); // Dark base
                    vec3 col2 = vec3(0.0, 0.5, 1.0); // Cyan
                    vec3 col3 = vec3(1.0, 0.0, 0.8); // Magenta
                    
                    vec3 finalColor = mix(col1, col2, 0.5 + 0.5*sin(zFlow * 0.1));
                    finalColor = mix(finalColor, col3, edgeGlow);
                    
                    // Add grid intensity
                    finalColor += vec3(1.0) * gridZ * 0.5;
                    
                    // Add center laser
                    finalColor += vec3(0.5, 1.0, 1.0) * centerGlow * 1.5;
                    
                    // Plasma pulse overlay
                    finalColor += vec3(0.2, 0.0, 0.4) * (plasma * 0.2);

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.receiveShadow = true;

        this._addDecorators();

        return this.mesh;
    }

    _addDecorators() {
        const count = 300;
        const geoms = [
            new THREE.IcosahedronGeometry(4, 0),
            new THREE.TorusGeometry(3, 1, 8, 20),
            new THREE.OctahedronGeometry(3)
        ];

        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });

        for (let i = 0; i < count; i++) {
            const geom = geoms[Math.floor(Math.random() * geoms.length)];
            const obj = new THREE.Mesh(geom, mat);

            const z = (Math.random() - 0.5) * this.params.segmentLength;
            const pt = this._getRoadPoint(z);

            // Offset from road
            const dist = 30 + Math.random() * 80;
            const angle = Math.random() * Math.PI * 2;

            obj.position.set(
                pt.x + Math.cos(angle) * dist,
                pt.y + Math.sin(angle) * dist,
                z
            );

            obj.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

            // Store orbital data for animation
            obj.userData = {
                orbitSpeed: (Math.random() - 0.5) * 0.5,
                rotSpeed: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.02),
                basePos: obj.position.clone()
            };

            this.mesh.add(obj);
        }
    }

    update(deltaTime) {
        if (this.material && this.material.uniforms) {
            this.material.uniforms.time.value += deltaTime;
        }

        // Animate decorators
        if (this.mesh) {
            this.mesh.children.forEach(child => {
                if (child.userData && child.userData.rotSpeed) {
                    child.rotation.x += child.userData.rotSpeed.x;
                    child.rotation.y += child.userData.rotSpeed.y;

                    // Bobbing / Orbit logic could go here
                }
            });
        }
    }

    // --- Math / Path Logic ---

    _getRoadPoint(z) {
        // Modulation: 0 to 1 sine wave (slow)
        // Values near 0 imply straight road
        const mod = Math.sin(z * this.frequencies.modulator);
        const amount = Math.abs(mod); // Magnitude of chaotic-ness

        // Threshold: if amount < 0.2, force straight (LERP to 0)
        let intensity = this.params.curveIntensity * amount;
        if (amount < 0.2) intensity *= (amount / 0.2); // Smooth fade out

        // X: Composite sine
        const x = (Math.sin(z * this.frequencies.main) + Math.sin(z * this.frequencies.twist) * 0.4) * intensity;

        // Y: Composite elevation
        // modulated by same factor? Maybe we want hills even on straight-aways? 
        // Let's keep hills independent but related
        const y = Math.sin(z * this.frequencies.elevation) * Math.cos(z * this.frequencies.main * 0.5) * this.params.slopeIntensity * amount;

        return new THREE.Vector3(x, y, z);
    }

    _getTangent(z) {
        const delta = 0.1;
        const p1 = this._getRoadPoint(z - delta);
        const p2 = this._getRoadPoint(z + delta);
        return new THREE.Vector3().subVectors(p2, p1).normalize();
    }

    _getCurvature(z) {
        // Discrete derivative of tangent angle (2D x-z plane approximation is sufficient for banking)
        // or just second derivative of X function roughly
        const delta = 1.0;
        const t1 = this._getTangent(z - delta);
        const t2 = this._getTangent(z + delta);

        // Signed angle change around Y
        // Cross product y component tells us turn direction
        const cross = new THREE.Vector3().crossVectors(t1, t2);

        // Magnitude correlates to curvature
        return cross.y;
    }

    // --- Physics Interface ---

    getHeightAt(worldX, worldZ) {
        // 1. Find the ideal road center at this Z
        const center = this._getRoadPoint(worldZ);

        // 2. Determine banking
        const curvature = this._getCurvature(worldZ);
        const bankAngle = -curvature * 800.0;

        // 3. Project worldX diff onto the banked plane
        // Similar height derivation as Vaporwave but generalized
        // height = center.y + (dist_from_center) * tan(bankAngle)

        const dx = worldX - center.x;

        // Check bounds (road width)
        if (Math.abs(dx) < this.params.roadWidth * 0.6 + 5) { // generous physics bounds
            const dy = dx * Math.tan(bankAngle);
            return center.y + dy;
        }

        return -1000; // Falling off
    }

    getNormalAt(worldX, worldZ) {
        // Compute numerical normal from 3 nearby points on the mathematical surface
        const delta = 0.5;
        const hC = this.getHeightAt(worldX, worldZ);
        const hR = this.getHeightAt(worldX + delta, worldZ);
        const hF = this.getHeightAt(worldX, worldZ + delta);

        // fallback if abyss
        if (hC < -900) return new THREE.Vector3(0, 1, 0);

        const vRight = new THREE.Vector3(delta, hR - hC, 0); // Vector pointing Right
        const vForward = new THREE.Vector3(0, hF - hC, delta); // Vector pointing Forward

        // Normal is Cross(Forward, Right) -> Up
        const norm = new THREE.Vector3().crossVectors(vForward, vRight).normalize();

        return norm;
    }

    getSurfaceType(worldX, worldZ) {
        return SurfaceTypes.TARMAC;
    }

    getSpawnPosition() {
        return new THREE.Vector3(0, 5, 0);
    }
}
