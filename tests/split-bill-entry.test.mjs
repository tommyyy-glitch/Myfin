import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');

const paneStart=html.indexOf('<div id="pane-ar"');
const paneEnd=html.indexOf('</div>\n  </div>\n</div>',paneStart);
assert.notEqual(paneStart,-1,'missing R/P pane');
assert.notEqual(paneEnd,-1,'missing end of R/P pane');
const pane=html.slice(paneStart,paneEnd);

assert.match(pane,/id="split-bill-cta"/);
assert.match(pane,/class="add-ar-dashed split-bill-cta"/);
assert.match(pane,/onclick="openGroupModal\(\)"/);
assert.match(pane,/class="split-bill-aa">AA</);
assert.match(pane,/data-i="splitbill"/);
assert.match(pane,/data-i="splitbillhint"/);

const ctaIndex=pane.indexOf('id="split-bill-cta"');
const filtersIndex=pane.indexOf('class="seg-ctrl"');
assert.ok(ctaIndex>=0&&ctaIndex<filtersIndex,'split-bill CTA should appear before R/P filters');

assert.match(html,/if\(pane==='ar'\)\{btn\.style\.display='';btn\.textContent='AA · '\+t\('splitbill'\);btn\.onclick=openGroupModal;\}/);
assert.match(html,/\.split-bill-cta\{/);
assert.match(html,/\.split-bill-ico\{/);

console.log('Split-bill discoverability entry tests passed.');
