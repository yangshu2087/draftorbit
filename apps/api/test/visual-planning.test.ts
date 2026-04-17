import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualPlanningService } from '../src/modules/generate/visual-planning.service';
import { DerivativeGuidanceService } from '../src/modules/generate/derivative-guidance.service';

test('VisualPlanningService prefers cover, illustrations and infographic for article content', () => {
  const service = new VisualPlanningService();

  const plan = service.buildPlan({
    format: 'article',
    focus: 'AI 产品冷启动',
    text: '多数团队第一篇长文的问题，不是观点不够，而是每一节都没有真实场景。比如第一节写判断，第二节补 before/after，第三节给具体动作，读者才更容易继续读。',
    outline: {
      title: 'AI 产品冷启动，不要把第一篇写成产品说明书',
      hook: '先给判断，再给例子，长文才会有人读完。',
      body: ['先把判断讲清楚', '再补一个真实例子', '最后把动作讲明白']
    }
  });

  assert.equal(plan.primaryAsset, 'cover');
  assert.ok(plan.items.some((item) => item.kind === 'cover'));
  assert.ok(plan.items.some((item) => item.kind === 'illustration'));
  assert.ok(plan.items.some((item) => item.kind === 'infographic'));
  assert.ok(plan.visualizablePoints.length >= 2);
  assert.ok(plan.items.every((item) => typeof item.palette === 'string' && item.palette.length > 0));
  assert.ok(plan.items.every((item) => typeof item.reason === 'string' && item.reason.length > 0));
});

test('VisualPlanningService does not use prompt-wrapper instructions as visual cues', () => {
  const service = new VisualPlanningService();

  const plan = service.buildPlan({
    format: 'tweet',
    focus: '推文写作冷启动',
    text: '内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。你会先固定哪一步？',
    outline: {
      title: '别再靠灵感写推文，给我一条更像真人的冷启动判断句。',
      hook: '给我一条更像真人的冷启动判断句。',
      body: ['给我一条更像真人的冷启动判断句。', '周一谁都在等灵感，周三还没发。']
    }
  });

  assert.ok(plan.items.length > 0);
  assert.ok(plan.items.every((item) => !/给我一条|更像真人|写推文/u.test(item.cue)));
  assert.ok(plan.visualizablePoints.every((item) => !/给我一条|更像真人|写推文/u.test(item)));
  assert.ok(plan.keywords.every((item) => !/给我一条|更像真人|写推文|多数人把|写得没反应/u.test(item)));
  assert.ok(plan.items.some((item) => /周一|周三|判断→例子→问题/u.test(item.cue)));
});

test('DerivativeGuidanceService marks structured article output as ready for html and slide-style export', () => {
  const visualPlanning = new VisualPlanningService();
  const derivativeGuidance = new DerivativeGuidanceService();
  const visualPlan = visualPlanning.buildPlan({
    format: 'article',
    focus: 'AI 产品冷启动',
    text: '导语。第一节讲判断。第二节讲真实例子。第三节讲下一步动作。结尾用问题收束。',
    outline: {
      title: 'AI 产品冷启动：先让读者愿意读完',
      hook: '如果第一段没有判断，长文很难被读完。',
      body: ['先给判断', '再给例子', '最后给动作']
    }
  });

  const readiness = derivativeGuidance.buildReadiness({
    format: 'article',
    text: 'AI 产品冷启动：先让读者愿意读完\n\n导语\n如果第一段没有判断，长文很难被读完。\n\n一、先给判断\n先把立场讲清楚。\n\n二、再给例子\n补一个真实场景。\n\n三、最后给动作\n告诉读者下一步。\n\n结尾\n你最想先改哪一步？',
    visualPlan
  });

  assert.equal(readiness.html.ready, true);
  assert.equal(readiness.cards.ready, true);
  assert.equal(readiness.infographic.ready, true);
  assert.equal(readiness.markdown.ready, true);
  assert.equal(readiness.slideSummary.ready, true);
  assert.match(readiness.html.reason, /结构完整/u);
});
