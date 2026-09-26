'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const schemaRoot = path.join(root, 'openspec/schemas/intent-driven-design');
const readme = fs.readFileSync(path.join(schemaRoot, 'README.md'), 'utf8');
const schema = fs.readFileSync(path.join(schemaRoot, 'schema.yaml'), 'utf8');

function section(name) {
  const heading = `## ${name}\n`;
  const start = readme.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${name}`);
  const bodyStart = start + heading.length;
  const next = readme.indexOf('\n## ', bodyStart);
  return readme.slice(bodyStart, next === -1 ? readme.length : next);
}

function route(name) {
  const row = section('Toolkit Routing Matrix').split('\n')
    .find(line => line.startsWith(`| ${name} |`));
  assert(row, `missing route: ${name}`);
  return row;
}

function protocolComplete(fixture) {
  return fixture.receipts.every(receipt => fixture.recorded.has(receipt))
    && fixture.reconciliation.every(step => fixture.recorded.has(step));
}

function planEvidenceResult(fixture) {
  return fixture.acceptedAdrMutation ? 'refusal' : protocolComplete(fixture);
}

const uiRoute = route('Impeccable');
assert.match(uiRoute, /UI or product surface/);
assert.match(uiRoute, /backend-only, infrastructure-only/);
assert.match(uiRoute, /skill_invocation_unavailable/);
assert.match(uiRoute, /block UI direction unless user approves evidence-based manual fallback/);

const specialist = route('Emil Kowalski');
assert.match(specialist, /motion, animation feel, or transition craft/);
assert.match(specialist, /static surface or motion forbidden/);
assert.match(specialist, /continue with Impeccable constraints or block if motion is core/);

const nonUiFixture = {
  recorded: new Set(['not_applicable']),
  receipts: ['not_applicable'],
  reconciliation: [],
};
assert.equal(protocolComplete(nonUiFixture), true);

const acceptedLoopback = {
  recorded: new Set(['pause_loopback_acceptance', 'proposal owns intent or scope changes']),
  receipts: ['pause_loopback_acceptance'],
  reconciliation: ['proposal owns intent or scope changes'],
};
assert.equal(protocolComplete(acceptedLoopback), true);

const reconciliation = section('Sibling Sync And Archive Reconciliation');
let cursor = -1;
for (const step of ['sibling change IDs', 'sync or archive', 'openspec/specs/', 'existingOutputPaths', 'refresh status', 'validate', 'reconciliation receipt']) {
  const next = reconciliation.indexOf(step);
  assert(next > cursor, `reconciliation step missing or out of order: ${step}`);
  cursor = next;
}

const loopbacks = section('Loopbacks');
assert.match(loopbacks, /accepted ADRs are immutable/);
assert.match(loopbacks, /Supersede one with a\s+new ADR rather than editing history/);

const incompleteFixture = {
  recorded: new Set(['pause_discovery', 'pause_route_selection']),
  receipts: ['pause_discovery', 'pause_route_selection', 'pause_direction_selection', 'pause_pre_task_handoff'],
  reconciliation: ['canonical_specs_reread', 'reconciliation_receipt'],
};
assert.equal(protocolComplete(incompleteFixture), false);

const negativeScenarios = [
  {
    name: 'missing journey approval',
    expected: false,
    actual: planEvidenceResult({
      recorded: new Set(['pause_route_selection', 'pause_direction_selection', 'pause_pre_task_handoff']),
      receipts: ['pause_discovery', 'pause_route_selection', 'pause_direction_selection', 'pause_pre_task_handoff'],
      reconciliation: [],
    }),
  },
  {
    name: 'missing specialist fallback',
    expected: false,
    actual: planEvidenceResult({
      recorded: new Set(['pause_discovery', 'pause_route_selection']),
      receipts: ['pause_discovery', 'pause_route_selection', 'specialist_fallback'],
      reconciliation: [],
    }),
  },
  {
    name: 'stale sibling reconciliation',
    expected: false,
    actual: planEvidenceResult({
      recorded: new Set(['pause_pre_task_handoff', 'sibling_change_ids', 'status_refreshed']),
      receipts: ['pause_pre_task_handoff'],
      reconciliation: ['sibling_change_ids', 'canonical_specs_reread', 'status_refreshed', 'reconciliation_receipt'],
    }),
  },
  {
    name: 'attempted accepted-ADR mutation',
    expected: 'refusal',
    actual: planEvidenceResult({
      acceptedAdrMutation: true,
      recorded: new Set(),
      receipts: [],
      reconciliation: [],
    }),
  },
];

for (const scenario of negativeScenarios) {
  assert.equal(scenario.actual, scenario.expected, scenario.name);
}

for (const text of [readme, schema]) {
  assert.match(text, /OpenSpec 1\.13\.1/);
  assert.match(text, /literal `?specs\/\*\*\/\*\.md`?/);
  assert.match(text, /MUST reject/);
  assert.match(text, /non-empty <changeRoot>\/specs\/<capability>\/spec\.md/);
  assert.match(text, /protocol failure/);
}

console.log(JSON.stringify({ negativeScenarios }));
console.log('test-intent-driven-design-lifecycle: engine boundary and protocol fixtures passed');
