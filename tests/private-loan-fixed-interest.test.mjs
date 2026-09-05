import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'..','index.html'),'utf8');

function declaration(name){
  const start=html.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`missing function ${name}`);
  const next=html.indexOf('\nfunction ',start+10);
  return html.slice(start,next<0?html.length:next);
}

const code=[
  declaration('dateOnly'),
  declaration('parseDateOnly'),
  declaration('loanPayments'),
  declaration('loanInterestReceived'),
  declaration('loanInterestMode'),
  declaration('loanAccruedTotal'),
  declaration('loanAccruedOutstanding'),
  `
    function today(){return '2026-10-05';}

    const existingFixed={
      id:'existing-phone-record',
      principalHKD:10000,
      interestMode:'fixed',
      annualRate:0,
      fixedInterestHKD:1000,
      startDate:'2026-09-04',
      dueDate:'2026-10-05',
      payments:[]
    };
    const paidFixed={...existingFixed,payments:[{date:'2026-10-05',interestHKD:400}]};
    const rateLoan={
      principalHKD:10000,
      interestMode:'rate',
      annualRate:36.5,
      startDate:'2026-09-04',
      dueDate:'2026-10-05',
      payments:[]
    };

    globalThis.result={
      fixedBeforeDue:loanAccruedTotal(existingFixed,'2026-09-05'),
      fixedOnDue:loanAccruedTotal(existingFixed,'2026-10-05'),
      fixedAfterDue:loanAccruedTotal(existingFixed,'2026-10-20'),
      fixedOutstandingAfterReceipt:loanAccruedOutstanding(paidFixed),
      rateOneDay:loanAccruedTotal(rateLoan,'2026-09-05')
    };
  `
].join('\n');

const context={};
vm.createContext(context);
vm.runInContext(code,context);

assert.equal(
  context.result.fixedBeforeDue,
  0,
  'an existing fixed-interest phone record must not accrue before its due date'
);
assert.equal(context.result.fixedOnDue,1000,'the full fixed interest must accrue on the due date');
assert.equal(context.result.fixedAfterDue,1000,'fixed interest must stay capped at the agreed total');
assert.equal(context.result.fixedOutstandingAfterReceipt,600,'received interest must reduce outstanding interest');
assert.equal(context.result.rateOneDay,10,'rate-based loans must retain daily accrual');

console.log('Private-loan fixed-interest due-date tests passed.');
