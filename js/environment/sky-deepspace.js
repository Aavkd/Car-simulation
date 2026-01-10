import * as THREE from 'three';

/**
 * Deep Space Skybox
 * Simple dark backdrop with appropriate lighting for deep space
 */
export class SkyDeepSpace {
    constructor(scene) {
        this.scene = scene;

        // Components
        this.skyDome = null;
        this.sunLight = null; // We still need a "sun" for shadows
        this.ambientLight = null;

        this._createSkyDome();
        this._createLighting();
    }

    _createSkyDome() {
        const geometry = new THREE.SphereGeometry(6000, 32, 32);

        // Pure black to very dark blue gradient
        const material = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x000000) },
                bottomColor: { value: new THREE.Color(0x000005) },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + vec3(0, 2000.0, 0)).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false
        });

        this.skyDome = new THREE.Mesh(geometry, material);
        this.scene.add(this.skyDome);
    }

    _createLighting() {
        // Key light (simulating a nearby star or galactic core)
        this.sunLight = new THREE.DirectionalLight(0xaaccff, 1.0);
        this.sunLight.position.set(100, 500, 100).normalize();
        this.scene.add(this.sunLight);

        // Ambient starlight
        this.ambientLight = new THREE.AmbientLight(0x222244, 0.3);
        this.scene.add(this.ambientLight);

        // No hemisphere light - space is directional
    }

    update(deltaTime, cameraPosition) {
        // Keep sky centered
        if (cameraPosition) {
            this.skyDome.position.copy(cameraPosition);
        }
    }

    // Interface methods
    setTime(t) { }
    setDayDuration(s) { }
    setPaused(p) { }
    getSunLight() { return this.sunLight; }
    getTime() { return 0; }
    getTimeString() { return "00:00"; }
    isNight() { return true; }
}
