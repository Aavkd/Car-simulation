import * as THREE from 'three';

/**
 * Deep Space Skybox
 * Simple dark backdrop with appropriate lighting for deep space
 */
export class SkyDeepSpace {
    constructor(scene) {
        this.scene = scene;

        // Settings
        this.settings = {
            topColor: 0x000000,
            bottomColor: 0x000005,
            sunColor: 0xaaccff,
            exponent: 0.6,
            sunIntensity: 1.0,
            ambientIntensity: 0.3
        };

        // Components
        this.skyDome = null;
        this.sunLight = null; // We still need a "sun" for shadows
        this.ambientLight = null;

        this._createSkyDome();
        this._createLighting();
    }

    _createSkyDome() {
        const geometry = new THREE.SphereGeometry(200000, 32, 32);

        // Pure black to very dark blue gradient
        const material = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(this.settings.topColor) },
                bottomColor: { value: new THREE.Color(this.settings.bottomColor) },
                exponent: { value: this.settings.exponent }
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
        this.sunLight = new THREE.DirectionalLight(this.settings.sunColor, this.settings.sunIntensity);
        this.sunLight.position.set(100, 500, 100).normalize();
        this.scene.add(this.sunLight);

        // Ambient starlight
        this.ambientLight = new THREE.AmbientLight(0x222244, this.settings.ambientIntensity);
        this.scene.add(this.ambientLight);

        // No hemisphere light - space is directional
    }

    updateSettings() {
        if (this.skyDome) {
            this.skyDome.material.uniforms.topColor.value.setHex(this.settings.topColor);
            this.skyDome.material.uniforms.bottomColor.value.setHex(this.settings.bottomColor);
            this.skyDome.material.uniforms.exponent.value = this.settings.exponent;
        }

        if (this.sunLight) {
            this.sunLight.color.setHex(this.settings.sunColor);
            this.sunLight.intensity = this.settings.sunIntensity;
        }

        if (this.ambientLight) {
            this.ambientLight.intensity = this.settings.ambientIntensity;
        }
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
