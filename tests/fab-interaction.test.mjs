import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');
const block=html.match(/\(function initDraggableFab\(\)\{[\s\S]*?\n\}\)\(\);/);
assert.ok(block,'missing draggable FAB setup');

const start=block[0].match(/function start\(e\)\{[\s\S]*?\n  \}/);
const move=block[0].match(/function move\(e\)\{[\s\S]*?\n  \}/);
assert.ok(start,'missing FAB start handler');
assert.ok(move,'missing FAB move handler');
assert.doesNotMatch(start[0],/preventDefault\(/,'a tap must not cancel its synthetic click');
assert.match(move[0],/if\(moved&&e\.cancelable\)e\.preventDefault\(\)/,'only a real drag should cancel pointer movement');
assert.match(block[0],/if\(clickBlock\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);clickBlock=false;\}/,'drag completion must still block the follow-up click');

assert.match(
  html,
  /createCryptoEstimateBatch\(\)[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="modal-wrap" id="m-profiles"/,
  'the crypto estimate modal must close before the profile and transaction modals'
);
