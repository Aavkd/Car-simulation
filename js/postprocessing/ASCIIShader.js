/**
 * ASCII Shade for Three.js
 * Ported from AcerolaFX_ASCII.fx
 */
import * as THREE from 'three';

export const ASCIIShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tFill': { value: null }, // fillASCII.png
        'tEdges': { value: null }, // edgesASCII.png (optional if we want edge detection)
        'resolution': { value: new THREE.Vector2() },
        'fontCharCount': { value: 10.0 }, // 10 chars in fillASCII
        'zoom': { value: 1.0 },
        'fillColor': { value: new THREE.Color(0xffffff) },
        'backgroundColor': { value: new THREE.Color(0x000000) },
        'colorChar': { value: false }, // If true, tints character with image color
        'invert': { value: false }
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
        uniform sampler2D tFill;
        uniform vec2 resolution;
        uniform float fontCharCount;
        uniform float zoom;
        uniform vec3 fillColor;
        uniform vec3 backgroundColor;
        uniform bool colorChar;
        uniform bool invert;
        
        varying vec2 vUv;

        // Standard luminance weights
        float getLuminance(vec3 color) {
            return dot(color, vec3(0.2126, 0.7152, 0.0722));
        }

        void main() {
             // 1. Pixelate UVs
             // Determine grid size (8x8 pixels per char typically)
             float charSize = 8.0 / zoom; 
             vec2 grid = resolution / charSize;
             
             vec2 pixelUV = floor(vUv * grid) / grid;
             
             // 2. Fetch Scene Color at pixelated coordinate
             vec4 sceneColor = texture2D(tDiffuse, pixelUV);
             float lum = getLuminance(sceneColor.rgb);
             
             if (invert) lum = 1.0 - lum;
             
             // 3. Map Luminance to Character
             // Quantize luminance to character index (0 to 9)
             float charIndex = floor(saturate(lum) * (fontCharCount - 0.01)); // 0..9
             
             // 4. Sample Font Texture
             // tFill is 80x8 texture (10 chars of 8x8)
             // We need to map local UV within the grid cell to the texture
             
             vec2 localUV = fract(vUv * grid);
             // Flip Y if needed (Three.js UVs vs Texture) - depends on texture layout
             // Usually textures are top-down or bottom-up. Let's assume standard.
             
             // Calculate UV in the font strip
             // X: (charIndex * 8 + localX * 8) / 80 = (charIndex + localX) / 10
             // Y: localY (since it's a strip of height 8)
             
             vec2 fontUV = vec2(
                (charIndex + localUV.x) / fontCharCount,
                localUV.y
             );
             
             float charMask = texture2D(tFill, fontUV).r;
             
             // 5. Compose Output
             vec3 finalColor = backgroundColor;
             vec3 fg = colorChar ? sceneColor.rgb : fillColor;
             
             finalColor = mix(backgroundColor, fg, charMask);
             
             gl_FragColor = vec4(finalColor, 1.0);
        }
    `
};
