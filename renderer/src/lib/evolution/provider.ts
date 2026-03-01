import type { EvolutionAPI } from './types';
import { MockEvolutionProvider } from './mock-provider';

// ┌─────────────────────────────────────────────────────┐
// │ Flip to `false` when backend API is ready.          │
// │ Components consume hooks, never import this directly │
// └─────────────────────────────────────────────────────┘
const USE_MOCK = true;

// Singleton provider instance
export const evolutionProvider: EvolutionAPI = USE_MOCK
  ? new MockEvolutionProvider()
  : new MockEvolutionProvider(); // TODO: replace with RealEvolutionProvider
