import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const WORKFLOWS_DIR = join(process.cwd(), '.github', 'workflows');
const CODE_QUALITY_PATH = join(WORKFLOWS_DIR, 'code-quality.yml');

function readYaml(filePath: string) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf-8');
  return { content, yaml: parseYaml(content) };
}

describe('CI workflow configuration', () => {
  it('should have code-quality.yml file', () => {
    expect(existsSync(CODE_QUALITY_PATH)).toBe(true);
  });

  it('should have at least 3 workflow files', () => {
    const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml'));
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  describe('code-quality.yml', () => {
    let data: ReturnType<typeof readYaml>;

    beforeAll(() => {
      data = readYaml(CODE_QUALITY_PATH);
    });

    it('should have workflow name', () => {
      if (!data?.yaml) return;
      expect(data.yaml.name).toBeDefined();
    });

    it('should trigger on push to main and develop', () => {
      if (!data?.yaml) return;
      expect(data.yaml.on?.push?.branches).toContain('main');
      expect(data.yaml.on?.push?.branches).toContain('develop');
    });

    it('should trigger on pull_request to main and develop', () => {
      if (!data?.yaml) return;
      expect(data.yaml.on?.pull_request?.branches).toContain('main');
      expect(data.yaml.on?.pull_request?.branches).toContain('develop');
    });

    it('should contain build step', () => {
      if (!data?.content) return;
      expect(data.content).toContain('pnpm build');
    });

    it('should contain test:unit step', () => {
      if (!data?.content) return;
      expect(data.content).toContain('pnpm test:unit');
    });

    it('should use pnpm for package management', () => {
      if (!data?.content) return;
      expect(data.content).toMatch(/pnpm/);
    });

    it('should use Node.js 20', () => {
      if (!data?.yaml) return;
      const jobs = data.yaml.jobs;
      for (const job of Object.values(jobs)) {
        const strategy = (job as any).strategy;
        if (strategy?.matrix?.['node-version']) {
          expect(strategy.matrix['node-version']).toContain(20);
        }
        const steps = (job as any).steps || [];
        const nodeStep = steps.find((s: any) => s.uses?.includes('actions/setup-node'));
        if (nodeStep) {
          const nv = nodeStep.with?.['node-version'];
          expect(nv === 20 || nv === '20' || String(nv).includes('matrix')).toBe(true);
        }
      }
    });

    it('should use actions/checkout@v4', () => {
      if (!data?.yaml) return;
      const jobs = data.yaml.jobs;
      for (const job of Object.values(jobs)) {
        const steps = (job as any).steps || [];
        const checkoutStep = steps.find((s: any) => s.uses?.includes('actions/checkout'));
        if (checkoutStep) {
          expect(checkoutStep.uses).toContain('v4');
        }
      }
    });
  });
});
