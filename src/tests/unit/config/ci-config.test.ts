import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const CI_YML_PATH = join(process.cwd(), '.github', 'workflows', 'ci.yml');

describe('CI workflow configuration', () => {
  it('should have ci.yml file', () => {
    expect(existsSync(CI_YML_PATH)).toBe(true);
  });

  describe('when ci.yml exists', () => {
    let content: string;
    let yaml: any;

    beforeAll(() => {
      if (!existsSync(CI_YML_PATH)) return;
      content = readFileSync(CI_YML_PATH, 'utf-8');
      yaml = parseYaml(content);
    });

    it('should have workflow name', () => {
      if (!yaml) return;
      expect(yaml.name).toBeDefined();
    });

    it('should trigger on push to main and develop', () => {
      if (!yaml) return;
      expect(yaml.on?.push?.branches).toContain('main');
      expect(yaml.on?.push?.branches).toContain('develop');
    });

    it('should trigger on pull_request to main and develop', () => {
      if (!yaml) return;
      expect(yaml.on?.pull_request?.branches).toContain('main');
      expect(yaml.on?.pull_request?.branches).toContain('develop');
    });

    it('should contain build step', () => {
      expect(content).toContain('pnpm build');
    });

    it('should contain test:unit step', () => {
      expect(content).toContain('pnpm test:unit');
    });

    it('should use pnpm for package management', () => {
      expect(content).toMatch(/pnpm/);
    });

    it('should use Node.js 20', () => {
      if (!yaml) return;
      const jobs = yaml.jobs;
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
      if (!yaml) return;
      const jobs = yaml.jobs;
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
