/**
 * Build-time generator: reads every syllabus in data/ (.md, .txt, .pdf) and writes
 * src/generated/<name>.json containing the concept graph (topics, prerequisite edges, sub-topics)
 * and the full question bank (levels 1-3, contrast pairs, misconception-tagged distractors).
 * The app loads these files directly, so bundled syllabi need no model calls at runtime.
 *
 *   npm run build:syllabi                 build any syllabus without a generated file
 *   npm run build:syllabi -- --force      rebuild everything
 *   npm run build:syllabi -- os           only data/os.*
 *   npm run build:syllabi -- --crosscheck also have a second model check every answer key
 *
 * Reads VITE_OPENAI_API_KEY from .env.local. sk-or-... keys go to OpenRouter, sk-... keys to OpenAI.
 * Progress is cached in data/.cache so a rerun after a failure does not repeat finished calls.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ConceptGraph, Question } from '../src/engine/types';
import {
  BANK_PROMPT, CROSSCHECK_PROMPT, EDGES_PROMPT, GRAPH_PROMPT, SUB_PROMPT, applyCrosscheck, chunk, cleanSyllabus, normalizeBank, normalizeSubQuestions, repairGraph, slug, validateBank, validateEdges, tolerantParse, validateCrosscheck, validateGraph, validateSubs,
} from '../src/lib/bank';
import type { SubResult } from '../src/lib/bank';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'src', 'generated');
const CACHE = path.join(DATA, '.cache');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const CROSSCHECK = args.includes('--crosscheck');
const only = args.filter((a) => !a.startsWith('--'));

function loadEnv() {
  const f = path.join(ROOT, '.env.local');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnv();
const KEY = (process.env.VITE_OPENAI_API_KEY ?? '').trim();
if (!/^sk-/.test(KEY)) {
  console.error('No API key. Put VITE_OPENAI_API_KEY=sk-... in .env.local first.');
  process.exit(1);
}
const OR = KEY.startsWith('sk-or-');
const MODELS = OR
  ? { main: process.env.SM_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b:free', retry: 'deepseek/deepseek-v4-flash-0731:free', check: process.env.SM_CHECK_MODEL ?? 'openai/gpt-4o-mini' }
  : { main: process.env.SM_MODEL ?? 'gpt-4.1-mini', retry: 'gpt-4.1-mini', check: 'gpt-4o-mini' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
let tokens = 0;

async function ask<T>(label: string, prompt: string, validate: (x: unknown) => T | null, maxTokens: number, models = [MODELS.main, MODELS.main, MODELS.main, MODELS.retry]): Promise<T> {
  let lastErr = '';
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      calls++;
      const res = await fetch(OR ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...(OR ? { 'X-Title': 'SyllabusMind build' } : {}) },
        body: JSON.stringify({
          model, temperature: 0.3, max_tokens: maxTokens, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: 'Reply with a single JSON object only. No prose, no markdown fences.' }, { role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(300000),
      });
      if (!res.ok) {
        lastErr = `${res.status} ${(await res.text()).slice(0, 160)}`;
        if (res.status === 429) await sleep(10000);
        console.log(`   ${label}: ${model} -> ${lastErr}`);
        continue;
      }
      const data = (await res.json()) as { usage?: { total_tokens?: number }; choices?: { message?: { content?: string } }[] };
      tokens += data.usage?.total_tokens ?? 0;
      const content = data.choices?.[0]?.message?.content ?? '';
      let parsed: unknown;
      try {
        parsed = tolerantParse(content);
      } catch (e) {
        mkdirSync(CACHE, { recursive: true });
        writeFileSync(path.join(CACHE, `bad-${label.replace(/\W+/g, '_')}.txt`), content);
        throw e;
      }
      const v = validate(parsed);
      if (v) return v;
      lastErr = 'reply failed validation';
      console.log(`   ${label}: ${model} -> ${lastErr}`);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.log(`   ${label}: ${model} -> ${lastErr}`);
    }
  }
  throw new Error(`${label} failed: ${lastErr}`);
}

async function readSyllabus(file: string): Promise<string> {
  if (/\.pdf$/i.test(file)) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)) }).promise;
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      let last: number | null = null;
      let line = '';
      for (const it of content.items as { str: string; transform: number[] }[]) {
        if (last !== null && Math.abs(it.transform[5] - last) > 2) { lines.push(line.trim()); line = ''; }
        line += it.str + ' ';
        last = it.transform[5];
      }
      lines.push(line.trim());
    }
    return lines.filter(Boolean).join('\n');
  }
  return readFileSync(file, 'utf8');
}

type Cache = { edgesDone?: boolean; graph?: ConceptGraph; bank?: Record<string, Question[]>; subs?: Record<string, SubResult>; batches?: Record<string, unknown> };

const nodesHave = (c: Cache, id: string) => Object.values(c.subs ?? {}).some((s) => s.nodes.some((n) => n.id === id));

async function build(file: string) {
  const name = slug(path.basename(file, path.extname(file)));
  const outFile = path.join(OUT, `${name}.json`);
  if (existsSync(outFile) && !FORCE) {
    console.log(`- ${name}: already built (use --force to rebuild)`);
    return;
  }
  console.log(`\n== ${name} (${path.basename(file)})`);
  let raw = await readSyllabus(file);
  let title = '';
  const h = raw.match(/^\s*#\s+(.+)\n/);
  if (h) { title = h[1].trim(); raw = raw.replace(h[0], ''); }
  const text = cleanSyllabus(raw);
  console.log(`   ${raw.length} chars read, ${text.length} after removing practicals/activities/references`);

  mkdirSync(CACHE, { recursive: true });
  const cacheFile = path.join(CACHE, `${name}.json`);
  const cache: Cache = existsSync(cacheFile) && !FORCE ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const save = () => writeFileSync(cacheFile, JSON.stringify(cache));

  if (!cache.graph) {
    console.log('   1/3 extracting concept graph…');
    cache.graph = await ask('graph', GRAPH_PROMPT(text), validateGraph, 12000);
    save();
  }
  if (!cache.edgesDone) {
    console.log('   1b/3 refining prerequisite links…');
    const tops = cache.graph.nodes.filter((n) => !n.parentId);
    try {
      cache.graph.edges = await ask('edges', EDGES_PROMPT(tops), validateEdges(cache.graph), 10000);
    } catch (e) {
      console.log(`   keeping the first-pass links (${e instanceof Error ? e.message : e})`);
    }
    cache.edgesDone = true;
    save();
  }
  const graph = repairGraph(cache.graph);
  cache.graph = graph;
  graph.title = title || graph.title.replace(/\s*(concept )?graph\s*$/i, '').replace(/\s*syllabus\s*$/i, '').trim() || name;
  const topics = graph.nodes.filter((n) => !n.parentId);
  const orphans = topics.filter((n) => !graph.edges.some((e) => e.from === n.id || e.to === n.id));
  console.log(`   graph: ${topics.length} topics, ${graph.edges.length} edges, ${new Set(topics.map((n) => n.unit)).size} units${orphans.length ? `, ${orphans.length} unconnected` : ''}`);

  cache.bank ??= {};
  const bankBatches = chunk(topics, 5);
  for (let i = 0; i < bankBatches.length; i++) {
    const batch = bankBatches[i];
    if (batch.every((t) => cache.bank![t.id])) continue;
    console.log(`   2/3 question bank ${i + 1}/${bankBatches.length}: ${batch.map((t) => t.label).join(', ')}`);
    const got = await ask(`bank ${i + 1}`, BANK_PROMPT(batch), validateBank(batch.map((t) => t.id)), 12000);
    Object.assign(cache.bank, got);
    save();
  }

  cache.subs ??= {};
  const subBatches = chunk(topics, 5);
  for (let i = 0; i < subBatches.length; i++) {
    const batch = subBatches[i];
    if (batch.every((t) => cache.subs![t.id])) continue;
    console.log(`   3/3 sub-topics ${i + 1}/${subBatches.length}`);
    const got = await ask(`subs ${i + 1}`, SUB_PROMPT(batch), validateSubs(batch), 12000);
    Object.assign(cache.subs, got);
    save();
  }

  let questions: Question[] = [
    ...Object.entries(cache.bank).flatMap(([id, qs]) => normalizeBank(id, qs)),
    ...Object.values(cache.subs).flatMap((s) => {
      const byNode: Record<string, Question[]> = {};
      s.questions.forEach((q) => (byNode[q.nodeId] ??= []).push(q));
      return Object.values(byNode).flatMap(normalizeSubQuestions);
    }),
  ].filter((q) => topics.some((t) => t.id === q.nodeId) || nodesHave(cache, q.nodeId));
  if (CROSSCHECK) {
    console.log('   cross-checking answer keys with a second model…');
    const kept: Question[] = [];
    for (const part of chunk(questions, 30)) {
      try {
        const ans = await ask('crosscheck', CROSSCHECK_PROMPT(part), validateCrosscheck, 1500, [MODELS.check]);
        kept.push(...applyCrosscheck(part, ans));
      } catch { kept.push(...part); }
    }
    console.log(`   dropped ${questions.length - kept.length} questions the checker disagreed with`);
    questions = kept;
  }

  const nodes = [...topics, ...topics.flatMap((t) => cache.subs![t.id]?.nodes ?? [])];
  const missing = topics.filter((t) => !questions.some((q) => q.nodeId === t.id));
  const bundle = {
    id: name,
    title: graph.title,
    version: 1,
    generatedAt: new Date().toISOString(),
    file: path.relative(ROOT, file).replace(/\\/g, '/'),
    graph: { id: `bundle-${name}`, title: graph.title, source: 'bundle', nodes, edges: graph.edges },
    questions,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(outFile, JSON.stringify(bundle, null, 1));
  const byLevel = [1, 2, 3].map((l) => `L${l}:${questions.filter((q) => q.level === l).length}`).join(' ');
  console.log(`   wrote ${path.relative(ROOT, outFile)}: ${nodes.length} nodes (${nodes.length - topics.length} sub-topics), ${questions.length} questions (${byLevel})${missing.length ? `, WARNING no questions for ${missing.map((m) => m.label).join(', ')}` : ''}`);
}

const files = readdirSync(DATA)
  .filter((f) => /\.(md|txt|pdf)$/i.test(f))
  .filter((f) => !only.length || only.includes(path.basename(f, path.extname(f))))
  .map((f) => path.join(DATA, f));
if (!files.length) {
  console.error('No syllabus files found in data/.');
  process.exit(1);
}
console.log(`Provider: ${OR ? 'OpenRouter' : 'OpenAI'}, main model ${MODELS.main}`);
for (const f of files) await build(f);
console.log(`\nDone. ${calls} model calls, ${tokens} tokens.`);
