import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SERVICES_DIR = path.resolve(__dirname, '../../../services');
const GRPC_DIR = path.join(SERVICES_DIR, 'machine-grpc');

function extractImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports: string[] = [];
  const regex = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"](\.[^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function resolveImport(fromFile: string, importPath: string): string | null {
  const dir = path.dirname(fromFile);
  const resolved = path.resolve(dir, importPath);
  for (const ext of ['.ts', '.js']) {
    const candidate = resolved + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    const indexPath = path.join(resolved, 'index.ts');
    if (fs.existsSync(indexPath)) return indexPath;
  }
  return null;
}

function getServiceFiles(): string[] {
  const files: string[] = [];
  for (const f of fs.readdirSync(SERVICES_DIR)) {
    if (f.endsWith('.ts')) {
      files.push(path.join(SERVICES_DIR, f));
    }
  }
  if (fs.existsSync(GRPC_DIR)) {
    for (const f of fs.readdirSync(GRPC_DIR)) {
      if (f.endsWith('.ts')) {
        files.push(path.join(GRPC_DIR, f));
      }
    }
  }
  return files;
}

function buildAdjacencyList(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const serviceFiles = getServiceFiles();

  for (const file of serviceFiles) {
    const rel = path.relative(SERVICES_DIR, file);
    if (!graph.has(rel)) graph.set(rel, new Set());
    const imports = extractImports(file);
    for (const imp of imports) {
      const resolved = resolveImport(file, imp);
      if (resolved && resolved.startsWith(SERVICES_DIR)) {
        const targetRel = path.relative(SERVICES_DIR, resolved);
        if (targetRel !== rel) {
          graph.get(rel)!.add(targetRel);
        }
      }
    }
  }
  return graph;
}

function detectCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push([...path.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const neighbor of graph.get(node) || []) {
      dfs(neighbor);
    }
    path.pop();
    stack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }
  return cycles;
}

describe('Architecture: No Circular Dependencies in Services', () => {
  it('session.service should not import credits-monitor.service', () => {
    const imports = extractImports(path.join(SERVICES_DIR, 'session.service.ts'));
    const resolved = imports
      .map((imp) => resolveImport(path.join(SERVICES_DIR, 'session.service.ts'), imp))
      .filter(Boolean);
    const hasCreditsMonitor = resolved.some((r) => r && r.includes('credits-monitor.service'));
    expect(hasCreditsMonitor).toBe(false);
  });

  it('credits-monitor.service should not import session.service', () => {
    const imports = extractImports(path.join(SERVICES_DIR, 'credits-monitor.service.ts'));
    const resolved = imports
      .map((imp) => resolveImport(path.join(SERVICES_DIR, 'credits-monitor.service.ts'), imp))
      .filter(Boolean);
    const hasSession = resolved.some((r) => r && r.includes('session.service'));
    expect(hasSession).toBe(false);
  });

  it('no direct or indirect circular dependency exists across all services', () => {
    const graph = buildAdjacencyList();
    const cycles = detectCycles(graph);
    if (cycles.length > 0) {
      const details = cycles.map((c) => c.join(' → ')).join('\n');
      throw new Error(`Circular dependencies found:\n${details}`);
    }
  });
});
