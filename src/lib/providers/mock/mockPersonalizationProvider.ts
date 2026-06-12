/**
 * Bazzi Middleware Platform - Mock Personalization Provider (FuFire API replica)
 */

import { PersonalizationProvider } from '../interfaces';
import { DEFAULT_BIRTH_TIME, DEFAULT_BIRTH_TIME_SOURCE } from '../../domain/defaultBirthTime';

export class MockFuFireProvider implements PersonalizationProvider {
  async calculate(
    name: string,
    birthDate: string,
    birthTime: string,
    birthTimeKnown: boolean,
    birthPlace: string,
    birthTimeFallback: {
      birth_time: string;
      birth_time_known: boolean;
      birth_time_source: string;
    }
  ): Promise<{
    animal: string;
    element: string;
    birth_year: number;
    dominant_element: string;
    resolvedTime: string;
    resolvedTimeSource: string;
  }> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    let resolvedTime = birthTime;
    let resolvedTimeSource = 'user_input';

    if (!birthTimeKnown) {
      resolvedTime = birthTimeFallback.birth_time || DEFAULT_BIRTH_TIME;
      resolvedTimeSource = birthTimeFallback.birth_time_source || DEFAULT_BIRTH_TIME_SOURCE;
    }

    const year = birthDate ? new Date(birthDate).getUTCFullYear() : 2026;
    const elements = ['Metal', 'Water', 'Wood', 'Fire', 'Earth'];
    const animals = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];

    const elementIdx = Math.abs((year - 4) % 10 / 2) % 5;
    const animalIdx = Math.abs((year - 4) % 12);

    const element = elements[Math.floor(elementIdx)];
    const animal = animals[animalIdx];

    const hashSum = (name + birthPlace).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const dominantElements = ['Cosmic-Iron', 'Lunar-Water', 'Forest-Wood', 'Solar-Flare', 'Volcanic-Earth'];
    const dominant_element = dominantElements[hashSum % dominantElements.length];

    return {
      animal,
      element,
      birth_year: year,
      dominant_element,
      resolvedTime,
      resolvedTimeSource
    };
  }
}
export { MockFuFireProvider as MockPersonalizationProvider };
