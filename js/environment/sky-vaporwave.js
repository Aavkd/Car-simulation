import * as THREE from 'three';
import { Starfield } from './starfield.js';

/**
 * Vaporwave Skybox
 * Static, stylized sky with retro sun and neon atmosphere
 */
export class SkyVaporwave {
    constructor(scene) {
        this.scene = scene;

        // Settings
        this.sunPosition = new THREE.Vector3(0, 500, -5000); // Fixed on horizon

        // Components
        this.skyDome = null;
        this.sun = null;
        this.sunLight = null;
        this.ambientLight = null;

        // Reuse starfield but with custom settings if needed
        this.starfield = new Starfield(scene);

        this._createSkyDome();
        this._createRetroSun();
        this._createLighting();

        // Force stars visible immediately
        this.starfield.setVisible(true);
    }

    _createSkyDome() {
        const geometry = new THREE.SphereGeometry(6000, 32, 32);

        // Deep purple to black gradient
        const material = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x000000) }, // Space black
                bottomColor: { value: new THREE.Color(0x2a0a3b) }, // Deep Purple
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

    _createRetroSun() {
        // Striped Sun Sprite
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Gradient Background
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#ffff00'); // Yellow Top
        grad.addColorStop(1, '#ff00ff'); // Magenta Bottom
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(256, 256, 240, 0, Math.PI * 2);
        ctx.fill();

        // Stripes (Masking)
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';

        // Create horizontal stripes that get thicker/denser at the bottom
        for (let y = 256; y < 512; y += 10 + (512 - y) * 0.1) {
            const height = 4 + (y - 256) * 0.05;
            ctx.fillRect(0, y, 512, height);
        }

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.sun = new THREE.Sprite(material);
        this.sun.position.copy(this.sunPosition);
        this.sun.scale.setScalar(1500); // Massive sun
        this.scene.add(this.sun);
    }

    _createLighting() {
        // Directional light matching sun
        this.sunLight = new THREE.DirectionalLight(0xff00ff, 1.0);
        this.sunLight.position.copy(this.sunPosition).normalize();
        this.scene.add(this.sunLight);

        // Ambient purple glow
        this.ambientLight = new THREE.AmbientLight(0x400080, 0.5);
        this.scene.add(this.ambientLight);

        // Hemisphere for ground contrast
        this.hemiLight = new THREE.HemisphereLight(0x00ffff, 0xff00ff, 0.4);
        this.scene.add(this.hemiLight);
    }

    update(deltaTime, cameraPosition) {
        // Keep sky centered
        if (cameraPosition) {
            this.skyDome.position.copy(cameraPosition);

            // Move sun with camera Z to simulate infinite horizon
            // But keep it "far away" relative to camera
            this.sun.position.set(
                cameraPosition.x * 0.9, // Parallax? Or just lock X?
                this.sunPosition.y, // Fixed Height
                cameraPosition.z - 4000 // Always 4000 units ahead?
            );
        }

        // Animate stars
        this.starfield.update(deltaTime, 1.0);
    }

    // Interface methods to match SkySystem
    setTime(t) { }
    setDayDuration(s) { }
    setPaused(p) { }
    getSunLight() { return this.sunLight; }
    getTime() { return 0; }
    getTimeString() { return "00:00"; }
    isNight() { return true; }
}
