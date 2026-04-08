import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAppTaskHref,
  getShellNavItems,
  getTaskPanelMeta
} from '../lib/v3-ui';

test('signed-in shell only keeps the operator entry in main navigation', () => {
  assert.deepEqual(getShellNavItems({ hasToken: true, publicMode: false }), [
    { href: '/app', label: '生成器' }
  ]);
});

test('public shell no longer exposes pricing as primary navigation', () => {
  assert.deepEqual(getShellNavItems({ hasToken: false, publicMode: true }), []);
});

test('task actions stay inside /app as nextAction deep links', () => {
  assert.equal(
    buildAppTaskHref('open_queue', { highlight: 'run_123', published: 'run_123' }),
    '/app?nextAction=open_queue&highlight=run_123&published=run_123'
  );
  assert.equal(
    buildAppTaskHref('connect_x_self', { xbind: 'success' }),
    '/app?nextAction=connect_x_self&xbind=success'
  );
});

test('task panel metadata uses action-focused copy instead of backend page labels', () => {
  assert.deepEqual(getTaskPanelMeta('connect_x_self'), {
    title: '先连接你的 X 账号',
    description: '连上后就能直接生成，并准备正式发出。',
    primaryLabel: '连接 X 账号',
    tone: 'connect'
  });

  assert.deepEqual(getTaskPanelMeta('confirm_publish'), {
    title: '确认这条内容是否发出',
    description: '快速看一眼文案和风险，再决定是否发出。',
    primaryLabel: '查看待确认内容',
    tone: 'queue'
  });

  assert.equal(getTaskPanelMeta('watch_generation'), null);
});
