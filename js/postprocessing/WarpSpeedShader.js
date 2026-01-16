import * as THREE from 'three';

/**
 * Warp Speed Post-Processing Shader
 * Creates a radial blur/tunnel effect that intensifies with speed.
 * Used for the hyperspace feel in Deep Space terrain.
 */
export const WarpSpeedShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        'speedFactor': { value: 0.0 },           // 0-1 normalized speed
        'center': { value: new THREE.Vector2(0.5, 0.5) }, // Center of radial effect
        'blurStrength': { value: 0.04 },         // Maximum blur intensity (very subtle)
        'blurSamples': { value: 64 },            // Number of blur samples
        'aberrationStrength': { value: 0.00005 },  // Chromatic aberration intensity (subtle)
        'vignetteStrength': { value: 0.4 },      // Edge darkening intensity (subtle)
        'vignetteStrength': { value: 0.4 },      // Edge darkening intensity (subtle)
        'streakIntensity': { value: 0.015 },      // Light streak/star line intensity (subtle)
        'distortion': { value: 0.0 }             // Radial distortion strength
    },

    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float speedFactor;
        uniform vec2 center;
        uniform float blurStrength;
        uniform float blurSamples;
        uniform float aberrationStrength;
        uniform float vignetteStrength;
        uniform float streakIntensity;
        uniform float distortion;

        varying vec2 vUv;

        // Pseudo-random for streak noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
            // Early exit if no speed effect
            if (speedFactor < 0.001) {
                gl_FragColor = texture2D(tDiffuse, vUv);
                return;
            }

            vec2 uv = vUv;
            vec2 toCenter = center - uv;
            float dist = length(toCenter);
            vec2 dir = normalize(toCenter);

            // ========== GEOMETRIC DISTORTION ==========
            // Fisheye/Warp effect at edges
            if (distortion > 0.001) {
                // Strength increases with distance from center
                float r = dist;
                // Distortion formula: r_new = r * (1 + k * r^2)
                // We want to stretch edges outward (pin cushion) or inward (barrel)?
                // For hyperspace, pulling edges OUT (pin cushion) feels faster? 
                // actually, increasing FOV makes center smaller, edges stretch.
                
                // Simple radial offset
                // INVERTED for Barrel Distortion (Fisheye/Tunnel)
                // We want to sample from FUTURE (further out) pixels to squeeze them in
                float distortAmount = distortion * r * r; 
                
                // Use + instead of - to sample from further out (Barrel)
                // Note: toCenter/dir points TO center. 
                // uv = center - dir * dist.
                // We want longer distance.
                // factor > 1.0?
                // r_new = r * (1.0 + distortion * r * r);
                
                float k = distortion; 
                float r2 = r * r;
                float f = 1.0 + k * r2;
                
                // New UV position based on barrel distortion
                // We move AWAY from center effectively (sampling from further out)
                uv = center - dir * (r * f);
                
                // Re-calculate derived values with new UV
                toCenter = center - uv;
                dist = length(toCenter);
                dir = normalize(toCenter);
            }

            // Smooth speed curve for more dramatic effect at high speeds
            float speed = smoothstep(0.0, 1.0, speedFactor);
            float speedSq = speed * speed; // Quadratic for more dramatic high-speed effect

            // ========== RADIAL ZOOM BLUR ==========
            vec4 color = vec4(0.0);
            float totalWeight = 0.0;

            // Radial blur intensity increases towards edges and with speed
            float blurAmount = blurStrength * speedSq * dist;
            int samples = int(blurSamples);

            for (int i = 0; i < 16; i++) {
                if (i >= samples) break;

                float t = float(i) / float(samples - 1);
                float weight = 1.0 - abs(t - 0.5) * 2.0; // Weight towards center samples

                vec2 sampleUV = uv + dir * blurAmount * (t - 0.5) * 2.0;
                color += texture2D(tDiffuse, sampleUV) * weight;
                totalWeight += weight;
            }

            color /= totalWeight;

            // ========== CHROMATIC ABERRATION ==========
            float aberration = aberrationStrength * speedSq * dist;

            // Separate RGB channels along radial direction
            float r = texture2D(tDiffuse, uv + dir * aberration * 1.5).r;
            float b = texture2D(tDiffuse, uv - dir * aberration * 1.5).b;

            // Blend chromatic aberration with blur
            color.r = mix(color.r, r, speed * 0.7);
            color.b = mix(color.b, b, speed * 0.7);

            // ========== LIGHT STREAKS ==========
            // Add subtle radial light streaks at high speed
            if (speed > 0.3 && streakIntensity > 0.0) {
                // Angle from center
                float angle = atan(toCenter.y, toCenter.x);

                // Create streak pattern based on angle
                float streakPattern = abs(sin(angle * 60.0 + hash(floor(uv * 100.0)) * 6.28));
                streakPattern = pow(streakPattern, 3.0);

                // Streaks are brighter towards edges and at high speed
                float streakBrightness = streakPattern * dist * (speed - 0.3) * streakIntensity;

                // Add subtle blue-white streak color
                vec3 streakColor = vec3(0.8, 0.9, 1.0) * streakBrightness;
                color.rgb += streakColor * 0.5;
            }

            // ========== TUNNEL VIGNETTE ==========
            // Darkening at edges that intensifies with speed
            float vignette = 1.0 - dist * vignetteStrength * speed;
            vignette = max(0.0, vignette);
            vignette = smoothstep(0.0, 1.0, vignette);

            color.rgb *= mix(1.0, vignette, speed * 0.5);

            // ========== CENTER BRIGHTENING ==========
            // Subtle center glow at high speeds (hyperspace core)
            float centerGlow = 1.0 - smoothstep(0.0, 0.3, dist);
            centerGlow *= speedSq * 0.15;
            color.rgb += vec3(0.9, 0.95, 1.0) * centerGlow;

            // ========== FINAL OUTPUT ==========
            gl_FragColor = color;
        }
    `
};
