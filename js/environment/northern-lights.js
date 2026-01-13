import * as THREE from 'three';

/**
 * Northern Lights (Aurora Borealis) System
 * Creates beautiful animated aurora effects in the night sky
 */
export class NorthernLights {
    constructor(scene) {
        this.scene = scene;
        this.auroraGroup = new THREE.Group();
        this.auroraGroup.name = 'northernLights';

        this.time = 0;
        this.opacity = 0;

        this._createAuroraDome();

        this.scene.add(this.auroraGroup);
        this.auroraGroup.visible = false;
    }

    _createAuroraDome() {
        // Create a hemisphere for the aurora - renders on the inside
        const geometry = new THREE.SphereGeometry(3500, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                opacity: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vElevation;
                
                void main() {
                    vUv = uv;
                    vPosition = position;
                    
                    // Calculate elevation angle (0 at horizon, 1 at zenith)
                    vElevation = normalize(position).y;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float opacity;
                
                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vElevation;
                
                // Hash function for noise
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }
                
                // Smooth noise
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }
                
                // Fractal Brownian Motion
                float fbm(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    
                    for (int i = 0; i < 5; i++) {
                        value += amplitude * noise(p * frequency);
                        amplitude *= 0.5;
                        frequency *= 2.0;
                    }
                    return value;
                }
                
                void main() {
                    // Convert position to spherical-ish coordinates for wrapping
                    float angle = atan(vPosition.x, vPosition.z);
                    float height = vElevation;
                    
                    // Aurora only appears in upper portion of sky (5-50 degrees elevation)
                    // Lowered to appear closer to horizon as requested
                    float auroraZone = smoothstep(0.05, 0.2, height) * smoothstep(0.6, 0.3, height);
                    
                    if (auroraZone < 0.01) {
                        discard;
                    }
                    
                    // Create flowing aurora bands
                    float t = time * 0.15;
                    
                    // Multiple aurora curtain bands
                    vec2 uv1 = vec2(angle * 2.0 + t * 0.3, height * 8.0);
                    vec2 uv2 = vec2(angle * 1.5 - t * 0.2, height * 6.0 + t * 0.1);
                    vec2 uv3 = vec2(angle * 3.0 + t * 0.15, height * 10.0 - t * 0.05);
                    
                    // Flowing noise patterns
                    float flow1 = fbm(uv1);
                    float flow2 = fbm(uv2 + vec2(5.0, 3.0));
                    float flow3 = fbm(uv3 + vec2(10.0, 7.0));
                    
                    // Create curtain-like vertical structures
                    float curtain1 = sin(angle * 8.0 + flow1 * 4.0 + t) * 0.5 + 0.5;
                    float curtain2 = sin(angle * 12.0 + flow2 * 3.0 - t * 0.7) * 0.5 + 0.5;
                    float curtain3 = sin(angle * 6.0 + flow3 * 5.0 + t * 0.5) * 0.5 + 0.5;
                    
                    // Soft curtain edges
                    curtain1 = smoothstep(0.3, 0.7, curtain1);
                    curtain2 = smoothstep(0.35, 0.65, curtain2);
                    curtain3 = smoothstep(0.4, 0.6, curtain3);
                    
                    // Combine curtains with varying intensity
                    float curtains = curtain1 * 0.6 + curtain2 * 0.3 + curtain3 * 0.2;
                    
                    // Vertical ray structure (characteristic of aurora)
                    float rays = fbm(vec2(angle * 15.0, height * 2.0 + t * 0.5));
                    rays = pow(rays, 1.5) * 0.7 + 0.3;
                    
                    // Color gradients - classic aurora colors
                    vec3 green = vec3(0.2, 0.9, 0.4);
                    vec3 cyan = vec3(0.2, 0.8, 0.9);
                    vec3 purple = vec3(0.6, 0.2, 0.8);
                    vec3 pink = vec3(0.9, 0.3, 0.5);
                    
                    // Height-based color (green lower, purple/pink higher)
                    float colorHeight = smoothstep(0.25, 0.7, height);
                    vec3 baseColor = mix(green, cyan, colorHeight * 0.5);
                    baseColor = mix(baseColor, purple, colorHeight * colorHeight * 0.6);
                    
                    // Add color variation based on flow
                    float colorVar = flow1 * 0.5 + 0.5;
                    baseColor = mix(baseColor, mix(cyan, pink, colorVar), flow2 * 0.3);
                    
                    // Pulsing glow
                    float pulse = sin(t * 0.8) * 0.1 + sin(t * 1.3) * 0.05 + 0.95;
                    
                    // Intensity variations across the aurora
                    float intensity = curtains * rays * auroraZone * pulse;
                    
                    // Soft glow effect
                    float glow = pow(intensity, 0.8);
                    
                    // Final color with glow
                    vec3 finalColor = baseColor * glow * 1.5;
                    
                    // Alpha based on intensity
                    float alpha = glow * opacity * 0.6;
                    
                    // Prevent harsh edges
                    alpha *= smoothstep(0.0, 0.05, intensity);
                    
                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: true
        });

        this.auroraMesh = new THREE.Mesh(geometry, material);
        this.auroraMesh.renderOrder = -1; // Render before other transparent objects
        this.auroraGroup.add(this.auroraMesh);
    }

    /**
     * Update the northern lights animation
     * @param {number} deltaTime - Time since last frame
     * @param {number} visibility - Visibility factor (0-1)
     */
    update(deltaTime, visibility) {
        this.time += deltaTime;

        // Smooth opacity transition
        const targetOpacity = visibility;
        this.opacity += (targetOpacity - this.opacity) * deltaTime * 2;

        // Update visibility
        const shouldBeVisible = this.opacity > 0.01;
        if (shouldBeVisible !== this.auroraGroup.visible) {
            this.auroraGroup.visible = shouldBeVisible;
        }

        if (!shouldBeVisible) return;

        // Update shader uniforms
        this.auroraMesh.material.uniforms.time.value = this.time;
        this.auroraMesh.material.uniforms.opacity.value = this.opacity;
    }

    /**
     * Set visibility directly
     * @param {boolean} visible 
     */
    setVisible(visible) {
        if (!visible) {
            this.opacity = 0;
            this.auroraGroup.visible = false;
        }
    }

    /**
     * Get the aurora group for positioning
     * @returns {THREE.Group}
     */
    getGroup() {
        return this.auroraGroup;
    }

    /**
     * Update position to follow camera
     * @param {THREE.Vector3} position 
     */
    setPosition(position) {
        this.auroraGroup.position.copy(position);
    }
}
