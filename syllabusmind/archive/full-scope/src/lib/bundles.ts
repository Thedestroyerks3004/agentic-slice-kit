import type { ConceptGraph, Question } from '../engine/types';

/** A syllabus from data/ that was turned into a graph + full question bank by `npm run build:syllabi`. */
export interface Bundle {
  id: string;
  title: string;
  version: number;
  generatedAt: string;
  file: string;
  graph: ConceptGraph;
  questions: Question[];
}

const mods = import.meta.glob('../generated/*.json', { eager: true, import: 'default' }) as Record<string, Bundle>;

export const BUNDLES: Bundle[] = Object.values(mods).sort((a, b) => a.title.localeCompare(b.title));
export const bundleById = (id: string) => BUNDLES.find((b) => b.id === id);
export const topicCount = (b: Bundle) => b.graph.nodes.filter((n) => !n.parentId).length;
