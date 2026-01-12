/**
 * Halftone Shader for Three.js
 * Ported/Adapted from AcerolaFX_Halftone.fx
 */
import * as THREE from 'three';

export const HalftoneShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2() },
        'dotSize': { value: 1.0 }, // Multiplier
        'angle': { value: 45.0 }, // Degrees
        'scale': { value: 1.0 },
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
        uniform float dotSize;
        uniform float angle;
        uniform float scale;
        
        varying vec2 vUv;
        
        float getLuminance(vec3 color) {
            return dot(color, vec3(0.2126, 0.7152, 0.0722));
        }
        
        // Rotate UV coordinates
        vec2 rotate(vec2 uv, float theta) {
            float c = cos(theta);
            float s = sin(theta);
            return vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
        }

        // Halftone dot pattern
        // Returns 1.0 if pixel is within dot, 0.0 otherwise
        float halftone(vec2 uv, float lum, float size_mult) {
            // Frequency of dots
            float frequency = 100.0 * scale; 
            
            vec2 nearest = 2.0 * fract(frequency * uv) - 1.0;
            float dist = length(nearest);
            
            // Radius depends on luminance (darker = larger dot or smaller hole)
            // CMYK usually uses larger dots for darker areas (higher K). 
            // Here let's assume black dots on white background: low lum = big dot
            // Or white dots on black background: high lum = big dot.
            // Let's go for standard print look:
            // Input RGB. High Lum = White = Small dot (or no dot). Low Lum = Dark = Big dot.
            
            // Map luminance 0..1 to radius 1..0
            float radius = sqrt(1.0 - lum); 
            
            // Smooth edge a bit
            float astep = fwidth(dist); 
            return 1.0 - smoothstep(radius - astep, radius + astep, dist);
        }
        
        // CMYK approximation (naive)
        /*
        float halftonePattern(vec2 uv, float angle, float val) {
             vec2 rotUV = rotate(uv, radians(angle));
             float s = sin(rotUV.x * resolution.x * dotSize * 0.1) * sin(rotUV.y * resolution.y * dotSize * 0.1);
             return (s * 0.5 + 0.5) < val ? 1.0 : 0.0;
        }
        */

        void main() {
            vec3 color = texture2D(tDiffuse, vUv).rgb;
            
            // CMYK conversion (simple)
            float k = min(1.0 - color.r, min(1.0 - color.g, 1.0 - color.b));
            vec3 cmy = (1.0 - color - k) / (1.0 - k + 0.0001);
            
            float c = cmy.r;
            float m = cmy.g;
            float y = cmy.b;
            
            // Screen angles
            float angleC = 15.0;
            float angleM = 75.0;
            float angleY = 0.0;
            float angleK = 45.0;
            
            // Frequency
            float freq = min(resolution.x, resolution.y) / (8.0 * dotSize);
            
            // We'll produce CMYK values via halftoning
            
            // Cyan
            vec2 uvC = rotate(vUv, radians(angleC));
            vec2 gridC = 2.0 * fract(uvC * freq) - 1.0;
            float distC = length(gridC);
            float radiusC = sqrt(c); // Radius proportional to ink amount
            float outC = smoothstep(radiusC, radiusC + 0.1, distC); // 0 = ink, 1 = paper
            // Actually, we want ink = 1, paper = 0?
            // "Halftone" usually means ink. 
            // If dist < radius, we have ink.
            // smoothstep(radius, radius+eps, dist): returns 0 if dist < radius (INC), 1 if dist > radius (PAPER)
            
            float inkC = 1.0 - smoothstep(radiusC, radiusC + 0.1, distC);
            
            // Magenta
            vec2 uvM = rotate(vUv, radians(angleM));
            vec2 gridM = 2.0 * fract(uvM * freq) - 1.0;
            float radiusM = sqrt(m);
            float inkM = 1.0 - smoothstep(radiusM, radiusM + 0.1, length(gridM));
            
            // Yellow
            vec2 uvY = rotate(vUv, radians(angleY));
            vec2 gridY = 2.0 * fract(uvY * freq) - 1.0;
            float radiusY = sqrt(y);
            float inkY = 1.0 - smoothstep(radiusY, radiusY + 0.1, length(gridY));
            
            // Black
            vec2 uvK = rotate(vUv, radians(angleK));
            vec2 gridK = 2.0 * fract(uvK * freq) - 1.0;
            float radiusK = sqrt(k);
            float inkK = 1.0 - smoothstep(radiusK, radiusK + 0.1, length(gridK));
            
            // Composite CMYK back to RGB
            // Paper is white (1,1,1). Ink subtracts?
            // Multiplicative (Subtractive color mixing)
            
            vec3 result = vec3(1.0);
            
            // Cyan removes Red
            result -= vec3(1.0, 0.0, 0.0) * inkC; // This is wrong. Cyan absorbs Red.
            // C=1 -> R=0. 
            // RGB = (1-C, 1-M, 1-Y) * (1-K) ??
            
            // Let's use standard mixing:
            // C contributes vec3(0,1,1) filter centered? No.
            
            // Simpler: Start white.
            // If inkC, multiply by (0,1,1)
            // If inkM, multiply by (1,0,1)
            // If inkY, multiply by (1,1,0)
            // If inkK, multiply by (0,0,0)
            
            // result = white
            // result *= mix(white, cyan, inkC)
            
            vec3 colC = vec3(0.0, 1.0, 1.0);
            vec3 colM = vec3(1.0, 0.0, 1.0);
            vec3 colY = vec3(1.0, 1.0, 0.0);
            vec3 colK = vec3(0.0, 0.0, 0.0);
            
            result = vec3(1.0);
            result = result * mix(vec3(1.0), colC, inkC);
            result = result * mix(vec3(1.0), colM, inkM);
            result = result * mix(vec3(1.0), colY, inkY);
            result = result * mix(vec3(1.0), colK, inkK);
            
            gl_FragColor = vec4(result, 1.0);
        }
    `
};
