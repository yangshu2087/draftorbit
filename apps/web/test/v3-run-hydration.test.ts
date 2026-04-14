import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateRunDetailUntilReady, shouldHydrateRunDetail } from '../lib/v3-run-hydration';

test('shouldHydrateRunDetail becomes true when package or publish-prep reaches done', () => {
  assert.equal(
    shouldHydrateRunDetail({ stage: 'publish_prep', status: 'done', label: '正在准备可发布结果' }),
    true
  );
  assert.equal(
    shouldHydrateRunDetail({ stage: 'package', status: 'done', label: '结果已整理', summary: '结果已准备好 · 质量 81.2' }),
    true
  );
  assert.equal(
    shouldHydrateRunDetail({ stage: 'voice', status: 'running', label: '正在匹配你的文风' }),
    false
  );
});

test('hydrateRunDetailUntilReady returns result before the stream would need to close', async () => {
  let calls = 0;
  const detail = await hydrateRunDetailUntilReady(
    async () => {
      calls += 1;
      if (calls < 3) {
        return {
          runId: 'run_123',
          status: 'RUNNING',
          format: 'tweet',
          result: null,
          publish: [],
          stages: []
        };
      }

      return {
        runId: 'run_123',
        status: 'DONE',
        format: 'tweet',
        result: {
          text: '最终结果',
          variants: [],
          imageKeywords: [],
          qualityScore: 81,
          riskFlags: [],
          requestCostUsd: null,
          whySummary: [],
          evidenceSummary: []
        },
        publish: [],
        stages: []
      };
    },
    'run_123',
    { timeoutMs: 50, intervalsMs: [0, 0, 0] }
  );

  assert.equal(detail?.result?.text, '最终结果');
  assert.equal(calls, 3);
});
