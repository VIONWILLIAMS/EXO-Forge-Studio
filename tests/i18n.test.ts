import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getLocale, LANGUAGE_KEY, setLocale, translate } from '../src/i18n';
import en from '../src/i18n/en.json';
import zh from '../src/i18n/zh.json';
import { AtlasWorkbench } from '../src/components/AtlasWorkbench';
import { Workbench } from '../src/components/Workbench';
import { AtlasMotionWorkbench } from '../src/components/AtlasMotionWorkbench';
import { AtlasMotionPanel, AtlasScenarioInspector, AtlasScenarioOverlay } from '../src/components/AtlasMotionPanel';
import { AtlasArmInspector } from '../src/components/AtlasArmInspector';
import { AtlasGaitInspector } from '../src/components/AtlasGaitReference';
import { AtlasVideoLibrary } from '../src/components/AtlasVideoLibrary';
import { useAtlasMotion } from '../src/state/atlasMotionStore';
import { BASE_CONFIG, useExoStore } from '../src/lib/store';
import { calculateAnalysis } from '../src/lib/analysis';
import { SCENARIOS, sampleScenario, INTRO_CHAPTERS } from '../src/domain/atlasScenario';

const cjk = /[\u3400-\u9fff]/u;
// Text rendering can be checked without a WebGL context; the live models are checked in the browser.
vi.mock('../src/components/AtlasScene', () => ({ AtlasScene: () => null }));
vi.mock('../src/components/ExoScene', () => ({ ExoScene: () => null }));
const initialMotion = useAtlasMotion.getState();
afterEach(() => {
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  setLocale('zh'); useAtlasMotion.setState(initialMotion, true);
});

describe('Bilingual product surfaces', () => {
  it('covers all source messages and Chinese asset descriptions without changing canonical data', () => {
    const messages = new Set<string>();
    for (const dir of ['src/components', 'src/domain', 'src/lib']) {
      for (const name of readdirSync(dir).filter(n => /\.tsx?$/.test(n))) {
        const file = ts.createSourceFile(name, readFileSync(`${dir}/${name}`, 'utf8'), ts.ScriptTarget.Latest, true, name.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const visit = (node: ts.Node) => {
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
            if (cjk.test(node.text)) messages.add(node.text.trim());
          }
          if (ts.isTemplateExpression(node)) {
            const text = node.head.text + node.templateSpans.map((s, i) => `{${i}}${s.literal.text}`).join('');
            if (cjk.test(text)) messages.add(text);
          }
          ts.forEachChild(node, visit);
        };
        visit(file);
      }
    }
    const collect = (value: unknown) => {
      if (typeof value === 'string' && cjk.test(value)) messages.add(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    for (const file of ['public/assets/v04/assembly.json', 'public/assets/exo-design-config.v0.1.json']) collect(JSON.parse(readFileSync(file, 'utf8')));
    const missing = [...messages].filter(s => s !== '中文' && cjk.test(translate(s, 'en')));
    expect(missing).toEqual([]);
    expect(messages.size).toBeGreaterThan(500);
  });

  it('retains all interpolation slots, with no empty translations', () => {
    const slots = (s: string) => [...new Set(s.match(/\{\d+\}/g) ?? [])].sort();
    for (const [source, target] of [...Object.entries(en), ...Object.entries(zh)]) {
      expect(target.trim(), source).not.toBe('');
      expect(slots(target), source).toEqual(slots(source));
    }
  });

  it('renders main, legacy, motion, arm, gait and video controls in English', () => {
    setLocale('en');
    const surfaces = [
      createElement(AtlasWorkbench), createElement(Workbench), createElement(AtlasMotionWorkbench),
      createElement(AtlasMotionPanel, { onClose: () => {} }), createElement(AtlasScenarioInspector),
      createElement(AtlasArmInspector, { onFocus: () => {} }),
      createElement(AtlasGaitInspector, { onHuman: () => {}, onAssembly: () => {} }), createElement(AtlasVideoLibrary),
    ];
    for (const surface of surfaces) {
      const html = renderToStaticMarkup(surface).replace(/data-testid="[^"]*"/g, '').replaceAll('中文', '');
      expect(html.match(/[^<>]*[\u3400-\u9fff][^<>]*/gu), (surface.type as { name?: string }).name).toBeNull();
    }
  });

  it('translates every scenario step and introduction chapter throughout its timeline', () => {
    setLocale('en');
    vi.spyOn(useAtlasMotion, 'getInitialState').mockImplementation(useAtlasMotion.getState);
    for (const [id, duration] of [...SCENARIOS.map(s => [s.id, s.duration] as const), ['intro', 50] as const]) {
      for (let time = 0; time <= duration; time += .1) {
        const frame = sampleScenario(id, time);
        expect(translate(frame.action, 'en'), `${id} ${time}`).not.toMatch(cjk);
      }
      useAtlasMotion.getState().chooseSequence(id);
      const html = renderToStaticMarkup(createElement(AtlasScenarioOverlay));
      expect(html).not.toMatch(cjk);
    }
    for (const chapter of INTRO_CHAPTERS) for (const key of ['label', 'title', 'subtitle'] as const) expect(translate(chapter[key], 'en')).not.toMatch(cjk);
  });

  it('translates computed warnings and nested parameters without losing measurements', () => {
    const config = structuredClone(BASE_CONFIG);
    config.loadCase.massKg = 80; config.loadCase.reachMm = 900;
    config.machine.pelvisRingMm = 460; config.human.hipWidthMm = 440;
    config.joints.elbowDeg = 160;
    const warnings = calculateAnalysis(config).warnings;
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    for (const warning of warnings) {
      const result = translate(warning.message, 'en');
      expect(result).not.toMatch(cjk);
      expect(result.match(/-?\d+(?:\.\d+)?/g)).toEqual(warning.message.match(/-?\d+(?:\.\d+)?/g));
    }
    expect(translate('隐藏 {0}', 'en', ['H01'])).toBe('Hide H01');
    expect(translate('查看{0} {1}%', 'en', ['脚跟着地', 10])).toContain('10%');
    expect(translate('查看{0} {1}%', 'en', ['脚跟着地', 10])).not.toMatch(cjk);
  });

  it('switches display text without changing paused motion, manual joints or saved geometry', () => {
    const motion = useAtlasMotion.getState();
    motion.choose('singleLeg'); motion.seek(2.37); motion.setArmJoint('grip', 40);
    const beforeMotion = useAtlasMotion.getState(), beforeConfig = useExoStore.getState().config;
    setLocale('en'); setLocale('zh');
    expect(useAtlasMotion.getState()).toBe(beforeMotion);
    expect(useExoStore.getState().config).toBe(beforeConfig);
    expect(getLocale()).toBe('zh');
  });

  it('stores the preference and changes only lang in a deep link', () => {
    const setItem = vi.fn(), replaceState = vi.fn();
    const state = { active: 'singleLeg' };
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:4177/?demo=singleLeg&view=legacy#details' }, localStorage: { setItem }, history: { state, replaceState } });
    setLocale('en');
    expect(setItem).toHaveBeenCalledWith(LANGUAGE_KEY, 'en');
    expect(String(replaceState.mock.calls[0][2])).toBe('http://127.0.0.1:4177/?demo=singleLeg&view=legacy&lang=en#details');
    expect(replaceState.mock.calls[0][0]).toBe(state);
  });

  it('keeps the language switch usable when local storage is unavailable', () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:4177/' }, localStorage: { setItem: () => { throw new Error('Blocked storage'); } }, history: { state: null, replaceState: vi.fn() } });
    expect(() => setLocale('en')).not.toThrow();
    expect(getLocale()).toBe('en');
  });

  it('restores the saved language on a new page visit without a language query', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { location: { search: '?demo=carry' }, localStorage: { getItem: () => 'en', setItem: vi.fn() } });
    const fresh = await import('../src/i18n');
    expect(fresh.getLocale()).toBe('en');
  });

  it('lets an explicit language link override and update the previous preference', async () => {
    vi.resetModules();
    const setItem = vi.fn();
    vi.stubGlobal('window', { location: { search: '?demo=carry&lang=zh' }, localStorage: { getItem: () => 'en', setItem } });
    const fresh = await import('../src/i18n');
    expect(fresh.getLocale()).toBe('zh');
    expect(setItem).toHaveBeenCalledWith(LANGUAGE_KEY, 'zh');
  });
});
