import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { V3RunChatDto } from '../src/modules/v3/v3.dto';

test('V3RunChatDto accepts product visualRequest controls', () => {
  const dto = plainToInstance(V3RunChatDto, {
    intent: '做一篇带 diagram 的长文',
    format: 'article',
    withImage: true,
    visualRequest: {
      mode: 'diagram',
      style: 'blueprint',
      layout: 'flow',
      palette: 'draftorbit',
      aspect: '16:9',
      exportHtml: true
    }
  });

  assert.deepEqual(validateSync(dto), []);
});

test('V3RunChatDto rejects invalid visualRequest style/layout/aspect', () => {
  const dto = plainToInstance(V3RunChatDto, {
    intent: '做一篇长文',
    format: 'article',
    withImage: true,
    visualRequest: {
      mode: 'photorealistic',
      style: 'dribbble-clone',
      layout: 'random',
      aspect: '9:99',
      exportHtml: true
    }
  });

  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: false });
  assert.ok(errors.some((error) => error.property === 'visualRequest'));
});
