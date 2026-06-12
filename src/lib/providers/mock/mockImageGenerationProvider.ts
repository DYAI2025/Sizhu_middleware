/**
 * Bazzi Middleware Platform - Mock Image Generation Provider
 */

import { ImageGenerationProvider } from '../interfaces';

export function generateSVGArtwork(
  title: string,
  orderNumber: string,
  animal: string,
  element: string,
  dominantElement: string,
  candidateIndex: number,
  iteration: number,
  score: number,
  quality: string,
  isAccepted: boolean
): string {
  const bgTheme = isAccepted ? '#0f172a' : '#1e1b4b'; // Slate vs Dark Indigo
  const strokeTheme = isAccepted ? 'gold' : '#f43f5e'; // Gold accents vs rose warning
  
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
    <rect width="600" height="750" fill="${bgTheme}" />
    
    <!-- Outer starry environment -->
    <g opacity="0.3">
      <circle cx="80" cy="90" r="1.5" fill="white" />
      <circle cx="520" cy="140" r="1.2" fill="white" />
      <circle cx="210" cy="50" r="2" fill="white" />
      <circle cx="480" cy="620" r="1" fill="white" />
      <circle cx="110" cy="550" r="1.3" fill="white" />
      <circle cx="300" cy="710" r="1.5" fill="white" />
    </g>

    <!-- Celestial orbits -->
    <circle cx="300" cy="320" r="190" stroke="${strokeTheme}" stroke-width="1.5" fill="none" opacity="0.4" stroke-dasharray="8,4" />
    <circle cx="300" cy="320" r="140" stroke="${strokeTheme}" stroke-width="0.8" fill="none" opacity="0.6" />
    
    <!-- Central decorative geometric mandala -->
    <path d="M300,100 L300,540 M80,320 L520,320 M144,164 L456,476 M144,476 L456,164" stroke="${strokeTheme}" stroke-opacity="0.15" stroke-width="1" />

    <!-- Personalization features -->
    <circle cx="300" cy="320" r="85" fill="black" opacity="0.9" stroke="${strokeTheme}" stroke-width="2" />
    
    <text x="300" y="295" font-family="'JetBrains Mono', Courier, monospace" font-size="24" fill="${strokeTheme}" font-weight="bold" text-anchor="middle" letter-spacing="4">
      ${animal.toUpperCase()}
    </text>
    <text x="300" y="325" font-family="'Inter', sans-serif" font-size="12" fill="white" font-weight="semibold" opacity="0.8" text-anchor="middle">
      ELEMENT: ${element.toUpperCase()}
    </text>
    <text x="300" y="345" font-family="'Inter', sans-serif" font-size="10" fill="${strokeTheme}" opacity="0.9" text-anchor="middle">
      ${dominantElement.toUpperCase()}
    </text>

    <!-- Compass rose and ticks -->
    <g stroke="${strokeTheme}" stroke-opacity="0.5" stroke-width="1.5">
      <path d="M300,215 L300,230 M300,410 L300,425 M195,320 L210,320 M390,320 L405,320" />
    </g>

    <text x="300" y="210" font-family="monospace" font-size="12" fill="${strokeTheme}" text-anchor="middle">N</text>
    <text x="300" y="440" font-family="monospace" font-size="12" fill="${strokeTheme}" text-anchor="middle">S</text>

    <!-- Bottom border typography for POD print validation -->
    <rect x="50" y="580" width="500" height="110" rx="4" fill="black" fill-opacity="0.5" stroke="${strokeTheme}" stroke-opacity="0.2" />
    
    <text x="300" y="605" font-family="'Inter', sans-serif" font-size="14" fill="white" font-weight="bold" text-anchor="middle">
      ${title}
    </text>
    <text x="300" y="628" font-family="'JetBrains Mono', Courier, monospace" font-size="11" fill="white" fill-opacity="0.6" text-anchor="middle">
      Order Hub Ref: ${orderNumber} | Iteration: ${iteration} | Candidate: ${candidateIndex + 1}
    </text>
    <text x="300" y="650" font-family="'JetBrains Mono', Courier, monospace" font-size="10" fill="${strokeTheme}" font-weight="semibold" text-anchor="middle">
      QA Evaluated Score: ${score}/100 [${quality.toUpperCase()} QUALITY]
    </text>
    <text x="300" y="672" font-family="'Inter', sans-serif" font-size="9" fill="white" fill-opacity="0.4" text-anchor="middle">
      BAZZI MIDDLEWARE ENGINE - DIGITAL CRYP-SIGN
    </text>
  </svg>`;
}

export class MockImageGenerationProvider implements ImageGenerationProvider {
  async generate(
    prompt: string,
    numCandidates: number,
    format: 'png' | 'jpeg',
    quality: 'standard' | 'hd',
    model: string,
    secretRef: string,
    customerData: any
  ): Promise<{
    candidateIndex: number;
    storagePath: string;
    metadata: {
      promptUsed: string;
      model: string;
      provider: string;
      quality: string;
      resolution: string;
    };
  }[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const results = [];

    for (let i = 0; i < numCandidates; i++) {
      const mockScore = 70 + Math.floor(Math.random() * 26); // 70 to 95
      
      const fileContent = generateSVGArtwork(
        customerData.productTitle || 'Custom Graphic Art Map',
        customerData.orderNumber || '0000',
        customerData.animal || 'Dragon',
        customerData.element || 'Fire',
        customerData.dominant_element || 'Solar-Flare',
        i,
        customerData.iteration || 1,
        mockScore,
        quality,
        false
      );

      results.push({
        candidateIndex: i,
        storagePath: fileContent,
        metadata: {
          promptUsed: prompt.substring(0, 100),
          model,
          provider: 'MOCK_GEN',
          quality,
          resolution: quality === 'hd' ? '1792x2304' : '1024x1024'
        }
      });
    }

    return results;
  }
}
