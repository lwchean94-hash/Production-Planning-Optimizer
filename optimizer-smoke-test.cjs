const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createHarness() {
  const storage = {};
  let exportedCsv = '';

  class FakeBlob {
    constructor(parts) {
      exportedCsv = parts.join('');
    }
  }

  const context = {
    console,
    setTimeout,
    clearTimeout,
    Blob: FakeBlob,
    URL: {
      createObjectURL() {
        return 'blob:smoke-test';
      }
    },
    alert(message) {
      throw new Error(`Unexpected alert: ${message}`);
    },
    confirm() {
      return true;
    },
    XLSX: {},
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      },
      removeItem(key) {
        delete storage[key];
      },
      clear() {
        Object.keys(storage).forEach(key => delete storage[key]);
      }
    },
    document: {
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      getElementById() {
        return null;
      },
      createElement(tagName) {
        return {
          tagName,
          style: {},
          classList: { add() {}, remove() {} },
          appendChild() {},
          remove() {},
          click() {},
          set innerHTML(value) {
            this._innerHTML = value;
          },
          get innerHTML() {
            return this._innerHTML || '';
          }
        };
      },
      body: {
        appendChild() {}
      }
    }
  };

  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context, { filename: 'app.js' });

  return {
    context,
    storage,
    getExportedCsv: () => exportedCsv,
    setJson(key, value) {
      storage[key] = JSON.stringify(value);
    },
    resetData() {
      Object.keys(storage).forEach(key => delete storage[key]);
      exportedCsv = '';
      context.window.cancelOptimization = false;
      context.window.lastGeneratedSchedules = null;
    }
  };
}

const harness = createHarness();
const { context, setJson, resetData, getExportedCsv } = harness;

function iso(date) {
  return date.toISOString();
}

function minutesBetween(start, end) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function order(overrides = {}) {
  return {
    id: overrides.id || `order-${Math.random().toString(36).slice(2)}`,
    orderNumber: overrides.orderNumber || 'SO-TEST',
    product: overrides.product || 'LATEX',
    size: overrides.size || 'M',
    quantity: overrides.quantity ?? 48000,
    targetConstraint: overrides.targetConstraint || ['Line 1'],
    entryTime: overrides.entryTime || new Date().toISOString(),
    ...overrides
  };
}

function activity(overrides = {}) {
  return {
    id: overrides.id || `act-${Math.random().toString(36).slice(2)}`,
    type: 'activity',
    activityType: overrides.activityType || 'Maintenance',
    line: overrides.line || 'Line 1',
    start: overrides.start,
    end: overrides.end,
    entryTime: overrides.entryTime || new Date().toISOString(),
    ...overrides
  };
}

function productionItems(schedule, line = 'Line 1') {
  return schedule[line].filter(item => !item.activityType);
}

function setupItems(schedule, line = 'Line 1') {
  return schedule[line].filter(item => ['CF + CP', 'CF', 'CP', 'SETUP'].includes(item.activityType));
}

async function withInitialStates(states, fn) {
  resetData();
  setJson('factoryInitialLineStates', states || {});
  return fn();
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('single order on empty factory has no setup and runs for 60 minutes', async () => {
  await withInitialStates({}, async () => {
    const schedule = await context.optimizeScheduleData([order({ id: 'single', quantity: 48000 })], []);
    assert.equal(setupItems(schedule).length, 0);
    const [item] = productionItems(schedule);
    assert.equal(item.id, 'single');
    assert.equal(minutesBetween(item.startTime, item.endTime), 60);
  });
});

test('product change creates a CP setup', async () => {
  await withInitialStates({
    'Line 1': { product: 'LATEX', tiers: { LB: 'M', LT: 'M', RB: 'M', RT: 'M' } }
  }, async () => {
    const schedule = await context.optimizeScheduleData([
      order({ id: 'cp', product: 'NITRILE', size: 'M', quantity: 48000 })
    ], []);
    const [setup] = setupItems(schedule);
    assert.equal(setup.activityType, 'CP');
    assert.equal(minutesBetween(setup.start, setup.end), 120);
  });
});

test('former change creates a CF setup', async () => {
  await withInitialStates({
    'Line 1': { product: 'LATEX', tiers: { LB: 'S', LT: 'S', RB: 'S', RT: 'S' } }
  }, async () => {
    const schedule = await context.optimizeScheduleData([
      order({ id: 'cf', product: 'LATEX', size: 'M', quantity: 48000 })
    ], []);
    const [setup] = setupItems(schedule);
    assert.equal(setup.activityType, 'CF');
    assert.equal(minutesBetween(setup.start, setup.end), 1800);
  });
});

test('manual tier duration uses total line speed across four tiers', async () => {
  await withInitialStates({}, async () => {
    const schedule = await context.optimizeScheduleData([
      order({
        id: 'manual-tiers',
        size: 'M',
        quantity: 48000,
        manualTiers: { LB: 'M', LT: 'M', RB: 'S', RT: 'S' }
      })
    ], []);
    const [item] = productionItems(schedule);
    assert.equal(minutesBetween(item.startTime, item.endTime), 120);
    assert.equal(item.costDetails.activeCount, 2);
  });
});

test('fixed activity conflict pushes production after activity ends', async () => {
  await withInitialStates({}, async () => {
    const now = new Date();
    const actEnd = new Date(now.getTime() + 60 * 60000);
    const schedule = await context.optimizeScheduleData([
      order({ id: 'after-maintenance', quantity: 48000 })
    ], [
      activity({
        id: 'maintenance',
        start: iso(new Date(now.getTime() - 5 * 60000)),
        end: iso(actEnd)
      })
    ]);
    const [item] = productionItems(schedule);
    assert.ok(new Date(item.startTime).getTime() >= actEnd.getTime());
  });
});

test('compatible different-size orders can combine on one line', async () => {
  await withInitialStates({}, async () => {
    const schedule = await context.optimizeScheduleData([
      order({ id: 'comb-s', orderNumber: 'SO-S', size: 'S', quantity: 24000 }),
      order({ id: 'comb-m', orderNumber: 'SO-M', size: 'M', quantity: 24000 })
    ], []);
    const [item] = productionItems(schedule);
    assert.equal(item.isCombined, true);
    assert.deepEqual(Array.from(item.combinedOrders, o => o.id).sort(), ['comb-m', 'comb-s']);
  });
});

test('target completion dates prioritize urgent or late orders', async () => {
  await withInitialStates({}, async () => {
    const now = Date.now();
    const schedule = await context.optimizeScheduleData([
      order({
        id: 'normal',
        orderNumber: 'SO-NORMAL',
        quantity: 48000,
        targetConstraint: ['Line 1']
      }),
      order({
        id: 'urgent',
        orderNumber: 'SO-URGENT',
        quantity: 48000,
        targetConstraint: ['Line 2'],
        enforceCompletionDate: true,
        targetCompletionDate: iso(new Date(now + 30 * 60000))
      })
    ], []);
    const urgent = productionItems(schedule, 'Line 2').find(item => item.id === 'urgent');
    const normal = productionItems(schedule, 'Line 1').find(item => item.id === 'normal');
    assert.ok(new Date(urgent.startTime).getTime() <= new Date(normal.startTime).getTime());
  });
});

test('CSV status includes delayed status when scheduled end misses target date', async () => {
  await withInitialStates({}, async () => {
    const schedule = await context.optimizeScheduleData([
      order({
        id: 'delayed',
        quantity: 48000,
        enforceCompletionDate: true,
        targetCompletionDate: iso(new Date(Date.now() - 60 * 60000))
      })
    ], []);
    context.window.lastGeneratedSchedules = schedule;
    context.window.exportMasterScheduleToCSV();
    assert.match(getExportedCsv(), /Automatic \(Delayed\)/);
  });
});

test('specific former matrix overrides changed-tier-count lookup', async () => {
  await withInitialStates({
    'Line 1': { product: 'LATEX', tiers: { LB: 'S', LT: 'M', RB: 'M', RT: 'M' } }
  }, async () => {
    setJson('factoryMatrices', {
      former: [0, 600, 1080, 1440, 1800],
      formerSpecific: { LB: 45 },
      productChange: {},
      defaultProductChange: 180
    });
    vm.runInContext('MATRICES = JSON.parse(localStorage.getItem("factoryMatrices"));', context);

    const schedule = await context.optimizeScheduleData([
      order({ id: 'specific-former', product: 'LATEX', size: 'M', quantity: 48000 })
    ], []);
    const [setup] = setupItems(schedule);
    assert.equal(setup.activityType, 'CF');
    assert.equal(minutesBetween(setup.start, setup.end), 45);
  });
});

(async () => {
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(error.stack || error.message);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} smoke test(s) failed.`);
    process.exit(1);
  }

  console.log(`\n${tests.length} smoke test(s) passed.`);
})();
