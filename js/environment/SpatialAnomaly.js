import * as THREE from 'three';

/**
 * SpatialAnomaly - A procedural glitch/crystal in space.
 * Represents a tear in reality or a high-energy artifact.
 */
export class SpatialAnomaly {
    constructor(params = {}) {
        this.params = Object.assign({
            radius: 500,
            color: new THREE.Color(0x00ffff),
            type: 'crystal', // 'crystal', 'glitch'
            bloomIntensity: 1.0, // [NEW] Controls brightness/bloom
            speed: 1.0,          // [NEW] Controls rotation/animation speed
            maxDistortion: 0.5   // [NEW] Max glitch intensity
        }, params);

        this.mesh = null;
        this.time = Math.random() * 100;

        this._init();
    }

    _init() {
        const geometry = new THREE.IcosahedronGeometry(1, 1);

        // Custom Shader Material for "Glitch" effect
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: this.params.color },
                distortion: { value: 0.0 },
                uBloomIntensity: { value: this.params.bloomIntensity }
            },
            vertexShader: `
                uniform float time;
                uniform float distortion;
                varying vec3 vNormal;
                varying vec3 vPos;
                varying float vNoise;

                // Simplex noise (simplified)
                float hash(vec3 p) {
                    p  = fract( p*0.3183099+.1 );
                    p *= 17.0;
                    return fract( p.x*p.y*p.z*(p.x+p.y+p.z) );
                }

                float noise( in vec3 x ) {
                    vec3 i = floor(x);
                    vec3 f = fract(x);
                    f = f*f*(3.0-2.0*f);
                    return mix(mix(mix( hash(i+vec3(0,0,0)), 
                                        hash(i+vec3(1,0,0)),f.x),
                                   mix( hash(i+vec3(0,1,0)), 
                                        hash(i+vec3(1,1,0)),f.x),f.y),
                               mix(mix( hash(i+vec3(0,0,1)), 
                                        hash(i+vec3(1,0,1)),f.x),
                                   mix( hash(i+vec3(0,1,1)), 
                                        hash(i+vec3(1,1,1)),f.x),f.y),f.z);
                }

                void main() {
                    vNormal = normal;
                    vPos = position;

                    float n = noise(position * 2.0 + time);
                    vNoise = n;
                    
                    vec3 pos = position;
                    // Spiky distortion
                    pos += normal * n * (0.2 + distortion);
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform float time;
                uniform float uBloomIntensity; // [NEW]
                varying vec3 vNormal;
                varying vec3 vPos;
                varying float vNoise;

                void main() {
                    vec3 viewDir = normalize(cameraPosition - vPos); // Approx in local space if not correct, but visual enough
                    
                    // Fresnel
                    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
                    
                    vec3 finalColor = color;
                    
                    // Pulse
                    finalColor += vec3(1.0) * vNoise * 0.5;
                    
                    // Edge Glow
                    finalColor += color * fresnel * 2.0;

                    // Apply Bloom Intensity
                    finalColor *= uBloomIntensity;

                    // Transparency
                    float alpha = 0.6 + 0.4 * sin(time * 3.0 + vPos.y);

                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.setScalar(this.params.radius);

        // Add internal wireframe for "tech" feel
        const wireGeo = new THREE.IcosahedronGeometry(1.2, 0);
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.3
        });
        const wireMesh = new THREE.Mesh(wireGeo, wireMat);
        this.mesh.add(wireMesh);
    }

    update(deltaTime) {
        this.time += deltaTime;

        if (this.mesh) {
            this.mesh.rotation.x += deltaTime * 0.2 * this.params.speed;
            this.mesh.rotation.y += deltaTime * 0.3 * this.params.speed;

            const mat = this.mesh.material;
            if (mat.uniforms) {
                mat.uniforms.time.value = this.time;
                // Random glitch
                if (Math.random() < 0.05) {
                    mat.uniforms.distortion.value = Math.random() * this.params.maxDistortion;
                } else {
                    mat.uniforms.distortion.value *= 0.9;
                }
            }
        }
    }
}
