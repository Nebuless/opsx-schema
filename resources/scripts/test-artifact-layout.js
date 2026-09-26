'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const schemas = fs.readdirSync(path.join(root, 'openspec/schemas'))
  .filter(name => fs.existsSync(path.join(root, 'openspec/schemas', name, 'schema.yaml')));
assert.equal(schemas.length, 9);
const required = ['changeRoot', 'artifactPaths', 'resolvedOutputPath', 'non-empty', '<changeRoot>/specs/<capability>/spec.md'];
function check(file) {
  const text = read(file);
  for (const phrase of required) assert(text.includes(phrase), `${file}: missing ${phrase}`);
  assert.doesNotMatch(text, /openspec\/changes\/<change>\/adr\.md/, file);
  return text;
}
for (const name of schemas) {
  const base = `openspec/schemas/${name}`;
  const yaml = check(`${base}/schema.yaml`);
  const specs = yaml.split('  - id: specs\n')[1].split('\n  - id: ')[0];
  for (const phrase of [...required, 'existingOutputPaths', 'specs/**/*.md', 'empty directory']) {
    assert(specs.includes(phrase), `${name} specs instruction: missing ${phrase}`);
  }
  check(`${base}/README.md`);
}
const designSchemaRoot = process.env.INTENT_DRIVEN_DESIGN_SCHEMA_ROOT
  || path.join(root, 'openspec/schemas/intent-driven-design');
const designSchema = fs.readFileSync(path.join(designSchemaRoot, 'schema.yaml'), 'utf8');
const expectedArtifacts = [
  ['journey', 'journey.md', 'journey.md', []],
  ['proposal', 'proposal.md', 'proposal.md', ['journey']],
  ['specs', 'specs/**/*.md', 'spec.md', ['proposal']],
  ['design', 'design.md', 'design.md', ['proposal']],
  ['adr', 'adr.md', 'adr.md', ['design']],
  ['tasks', 'tasks.md', 'tasks.md', ['specs', 'adr']],
];
const artifactIds = [...designSchema.matchAll(/^  - id: (\S+)$/gm)].map(match => match[1]);
assert.deepEqual(artifactIds, expectedArtifacts.map(([id]) => id));
for (const [id, generates, template, requires] of expectedArtifacts) {
  const block = designSchema.split(`  - id: ${id}\n`)[1].split(/\n  - id: |\napply:/)[0];
  assert.match(block, new RegExp(`^    generates: ${generates.replaceAll('*', '\\*')}$`, 'm'), `${id}: wrong generates`);
  assert.match(block, new RegExp(`^    template: ${template}$`, 'm'), `${id}: wrong template`);
  const actualRequires = [...block.matchAll(/^      - (\S+)$/gm)].map(match => match[1]);
  assert.deepEqual(actualRequires, requires, `${id}: wrong requires`);
  assert(fs.existsSync(path.join(designSchemaRoot, 'templates', template)), `${id}: missing template ${template}`);
}
assert.match(designSchema, /^apply:\n  requires:\n    - tasks\n  tracks: tasks\.md$/m);
const journey = fs.readFileSync(path.join(designSchemaRoot, 'templates/journey.md'), 'utf8');
for (const heading of ['Material Decisions', 'Grilling Receipt', 'Route Selection', 'Approval Receipts', 'MCP Receipt', 'Loopback History', 'Sibling Changes', 'Reconciliation Receipts']) {
  assert(journey.includes(`## ${heading}`), `journey.md: missing ${heading}`);
}
assert.doesNotMatch(journey, /^\s*- \[[ x]\]/m, 'journey.md must not track implementation tasks');
for (const host of ['.opencode', '.claude', '.codex', '.omp']) {
  for (const name of fs.readdirSync(path.join(root, host, 'skills')).filter(name => name.startsWith('openspec-') && name !== 'openspec-linearized')) {
    check(`${host}/skills/${name}/SKILL.md`);
  }
}
for (const directory of ['.opencode/commands', '.claude/commands/opsx']) {
  for (const name of fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith('.md') && !name.startsWith('opsx-ce-'))) {
    check(`${directory}/${name}`);
  }
}
for (const name of ['define', 'plan', 'work', 'debug', 'review', 'validate', 'compound', 'continue', 'bulk-continue']) {
  const file = `opsx-ce-${name}.md`;
  const body = read(`openspec/schemas/compound-intent-driven/adapters/shared/${file}`);
  for (const phrase of ['artifactPaths', 'resolvedOutputPath', 'existingOutputPaths', 'non-empty']) {
    assert(body.includes(phrase), `${file}: missing ${phrase}`);
  }
  if (name === 'plan') check(`openspec/schemas/compound-intent-driven/adapters/shared/${file}`);
  for (const host of ['.senpi', '.pi', '.atomic']) assert.equal(read(`${host}/prompts/${file}`), body);
  assert.equal(read(`.opencode/commands/${file}`).replace(/^---\n[^\n]+\n---\n/, ''), body);
}
console.log('test-artifact-layout: 9 schemas, all OpenSpec skills/commands, 36 adapter projections passed');
