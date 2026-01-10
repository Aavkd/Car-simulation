import * as THREE from 'three';
import { BasePhysicsProvider, SurfaceTypes } from '../physics/physics-provider.js';

export class VaporwaveGenerator extends BasePhysicsProvider {
    constructor(params = {}) {
        super();
        this.params = Object.assign({
            roadWidth: 100,
            segmentLength: 50000, // 50km
            curveIntensity: 150,
            slopeIntensity: 40
        }, params);

        this.mesh = null;

        // Math constants for the procedural generation
        this.curveFreq = 0.002;
        this.slopeFreq = 0.005;
    }

    generate() {
        // Create a massive strip for the road
        const segments = 2000; // Resolution of the curve
        const widthSegments = 2; // Low poly width

        const geometry = new THREE.PlaneGeometry(
            this.params.roadWidth,
            this.params.segmentLength,
            widthSegments,
            segments
        );

        // Rotate to be horizontal initially (Plane is created on XY plane)
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;

        for (let i = 0; i < positions.length; i += 3) {
            const xLocal = positions[i]; // -width/2, 0, width/2
            // positions[i+1] is 0 (y)
            const z = positions[i + 2];

            const centerX = this._getRoadCenterX(z);
            const centerY = this._getRoadCenterY(z);

            // Calculate Banking
            const derivative = this._getCurveDerivative(z);
            const bankAngle = -derivative * 2.0; // Same factor as physics

            // Rotate the local X point by the bank angle
            // Effective rotation in 2D cross-section (X,Y)
            // x_final = cx + x_local * cos(angle)
            // y_final = cy + x_local * sin(angle)

            positions[i] = centerX + xLocal * Math.cos(bankAngle);
            positions[i + 1] = centerY + xLocal * Math.sin(bankAngle);
        }

        geometry.computeVertexNormals();

        // Custom Shader Material for the Grid Effect
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                gridSize: { value: 10.0 },
                speed: { value: 0.5 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying float vHeight;
                void main() {
                    vUv = uv;
                    vHeight = position.y;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                
                // Hue to RGB Helper
                vec3 hsv2rgb(vec3 c) {
                    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                }

                void main() {
                    // Create moving grid effect
                    vec2 gridUV = vUv * vec2(40.0, 1000.0); // Stretch Grid (Wider X for wider road)
                    gridUV.y += time * 2.0; // Animate flow
                    
                    float gridLineX = step(0.95, fract(gridUV.x));
                    float gridLineY = step(0.95, fract(gridUV.y));
                    float grid = max(gridLineX, gridLineY);
                    
                    // Rainbow generation
                    // Base hue on V coordinate (Z depth) + Time
                    float hue = fract(vUv.y * 5.0 - time * 0.2);
                    vec3 rainbow = hsv2rgb(vec3(hue, 0.8, 1.0));
                    
                    // Darker background rainbow, brighter grid
                    vec3 finalColor = mix(rainbow * 0.2, rainbow, grid);
                    
                    // Add side glow
                    float sideGlow = pow(abs(vUv.x - 0.5) * 2.0, 3.0);
                    finalColor += vec3(sideGlow * 0.5);
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });

        this.material = material;

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;

        this._addDecorators();

        return this.mesh;
    }

    _addDecorators() {
        // Add some floating neon objects along the path
        const decoratorCount = 200;
        const decoratorGeom = new THREE.OctahedronGeometry(2);
        const decoratorMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

        for (let i = 0; i < decoratorCount; i++) {
            const z = Math.random() * this.params.segmentLength;

            const mesh = new THREE.Mesh(decoratorGeom, decoratorMat);

            const roadX = this._getRoadCenterX(z);
            const roadY = this._getRoadCenterY(z);

            // Place on sides
            const side = Math.random() > 0.5 ? 1 : -1;
            const dist = this.params.roadWidth + 10 + Math.random() * 50;

            mesh.position.set(
                roadX + side * dist,
                roadY + 5 + Math.random() * 20, // Floating
                z
            );

            // Random rotation
            mesh.rotation.set(Math.random(), Math.random(), Math.random());

            this.mesh.add(mesh);
        }
    }

    update(deltaTime) {
        if (this.material && this.material.uniforms) {
            this.material.uniforms.time.value += deltaTime;
        }
    }

    // --- Math Helpers ---

    _getEnvelope(z) {
        // Ramp up from 0 to 1 over first 500 meters to ensure flat start
        return Math.min(1.0, Math.max(0.0, z / 500.0));
    }

    _getEnvelopeDerivative(z) {
        // Derivative of ramp is 1/500 if z < 500, else 0
        return (z >= 0 && z < 500) ? (1.0 / 500.0) : 0.0;
    }

    _getRoadCenterX(z) {
        // Env * Sin(z)
        const env = this._getEnvelope(z);
        return Math.sin(z * this.curveFreq) * this.params.curveIntensity * env;
    }

    _getRoadCenterY(z) {
        const env = this._getEnvelope(z);
        return Math.sin(z * this.slopeFreq) * this.params.slopeIntensity * env;
    }

    _getCurveDerivative(z) {
        // d(u*v) = u'v + uv'
        // u = sin(kz)*I, v = env
        const k = this.curveFreq;
        const I = this.params.curveIntensity;

        const u = Math.sin(z * k) * I;
        const du = k * Math.cos(z * k) * I;

        const v = this._getEnvelope(z);
        const dv = this._getEnvelopeDerivative(z);

        return du * v + u * dv;
    }

    _getSlopeDerivative(z) {
        const k = this.slopeFreq;
        const I = this.params.slopeIntensity;

        const u = Math.sin(z * k) * I;
        const du = k * Math.cos(z * k) * I;

        const v = this._getEnvelope(z);
        const dv = this._getEnvelopeDerivative(z);

        return du * v + u * dv;
    }

    // --- Physics Interface ---

    getHeightAt(worldX, worldZ) {
        const roadCenterX = this._getRoadCenterX(worldZ);
        const roadCenterY = this._getRoadCenterY(worldZ);

        // Check if on road width
        // Calculate the "true" distance from the center line accounting for banking
        // But simple X distance is usually fine for these shallow angles
        // Ideally we project (point - center) onto the bank vector

        const curveDeriv = this._getCurveDerivative(worldZ);
        const bankAngle = -curveDeriv * 2.0;

        // Calculate height on the banked plane
        // Height = CenterY + (X - CenterX) * tan(bankAngle) 
        // (Using sin/tan approximation for small angles, sin is used in mesh generation)
        // Mesh Y = cy + x_local * sin(angle). 
        // Mesh X = cx + x_local * cos(angle).
        // If we have worldX, and want height.
        // worldX = cx + x_local * cos. -> x_local = (worldX - cx) / cos.
        // height = cy + x_local * sin = cy + (worldX - cx) * tan(angle).

        // Approximate x_local ~ (worldX - cx) since cos(small) ~ 1
        const distFromCenter = worldX - roadCenterX;

        // Check bounds with X local
        // If banking is huge, X world range shrinks.
        // Allow variance
        if (Math.abs(distFromCenter) <= (this.params.roadWidth / 2) + 2) {
            const height = roadCenterY + distFromCenter * Math.tan(bankAngle);
            return height;
        }

        return -1000; // Abyss
    }

    getNormalAt(worldX, worldZ) {
        const dxdz = this._getCurveDerivative(worldZ);
        const dydz = this._getSlopeDerivative(worldZ);

        // Base Tangent (along road center)
        const tangentZ = new THREE.Vector3(dxdz, dydz, 1).normalize();

        // Bank Tangent (across road)
        // From getHeightAt: slope in X is tan(bankAngle)
        const bankAngle = -dxdz * 2.0;
        const slopeX = Math.tan(bankAngle);
        const tangentX = new THREE.Vector3(1, slopeX, 0).normalize();

        const normal = new THREE.Vector3().crossVectors(tangentZ, tangentX).normalize();

        if (normal.y < 0) normal.negate();

        return normal;
    }

    getSurfaceType(worldX, worldZ) {
        return SurfaceTypes.TARMAC;
    }

    getSpawnPosition() {
        return new THREE.Vector3(0, 5, 0); // Start at 0,0 where envelope is 0 -> Straight road
    }
}
