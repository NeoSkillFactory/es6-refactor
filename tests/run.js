#!/usr/bin/env node
/**
 * Test runner for es6-refactor
 * Runs all test cases and reports results
 */

const { refactorCode } = require('../scripts/refactor');
const { refactorTypeScript } = require('../scripts/types');
const { refactor } = require('../scripts/index');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertIncludes(output, expected, message) {
  const clean = output.replace(/\s+/g, ' ').trim();
  const cleanExpected = expected.replace(/\s+/g, ' ').trim();
  assert(clean.includes(cleanExpected), message);
}

function assertNotIncludes(output, notExpected, message) {
  assert(!output.includes(notExpected), message);
}

async function runTests() {
  console.log('\n=== es6-refactor Test Suite ===\n');

  // ---- var to const/let ----
  console.log('Variable Declarations:');

  let out = await refactorCode('var x = 1;', { format: false });
  assertIncludes(out, 'const x = 1', 'var to const (no reassignment)');

  out = await refactorCode('var x = 1; x = 2;', { format: false });
  assertIncludes(out, 'let x = 1', 'var to let (reassigned)');

  out = await refactorCode('var a = 1;\nvar b = 2;\nvar c = 3;', { format: false });
  assertNotIncludes(out, 'var ', 'no var remaining after conversion');

  out = await refactorCode('let y = 5; const z = 10;', { format: false });
  assertIncludes(out, 'let y = 5', 'let preserved as-is');
  assertIncludes(out, 'const z = 10', 'const preserved as-is');

  // ---- Function to arrow ----
  console.log('\nArrow Functions:');

  out = await refactorCode('var add = function(a, b) { return a + b; };', { format: false });
  assertIncludes(out, '=>', 'function expression to arrow');

  out = await refactorCode('var obj = { method: function() { return this.x; } };', { format: false });
  assertNotIncludes(out, '=>', 'method with this NOT converted to arrow');

  out = await refactorCode('var gen = function*() { yield 1; };', { format: false });
  assertNotIncludes(out, '=>', 'generator NOT converted to arrow');

  out = await refactorCode('var f = function() { return arguments[0]; };', { format: false });
  assertNotIncludes(out, '=>', 'function using arguments NOT converted to arrow');

  out = await refactorCode('var f = async function(x) { return await x; };', { format: false });
  assertIncludes(out, 'async', 'async function preserves async keyword');
  assertIncludes(out, '=>', 'async function expression to async arrow');

  // ---- Template literals ----
  console.log('\nTemplate Literals:');

  out = await refactorCode("var msg = 'Hello ' + name + '!';", { format: false });
  assertIncludes(out, '`Hello ${name}!`', 'string concat to template literal');

  out = await refactorCode("var x = a + b;", { format: false });
  assertNotIncludes(out, '`', 'numeric addition NOT converted to template');

  out = await refactorCode("var msg = 'Hello ' + name + ' you are ' + age + ' old';", { format: false });
  assertIncludes(out, '${name}', 'multiple interpolations');
  assertIncludes(out, '${age}', 'multiple interpolations (age)');

  // ---- Object shorthand ----
  console.log('\nObject Shorthand:');

  out = await refactorCode('var obj = {name: name, age: age};', { format: false });
  // After shorthand, Babel generates {name, age}
  assert(out.includes('{name,') || out.includes('{ name,') || out.includes('{name }') || out.includes('{\n  name,') || out.includes('{\n  name\n'), 'object property shorthand');

  out = await refactorCode('var obj = {name: otherName, age: age};', { format: false });
  assertIncludes(out, 'name: otherName', 'non-matching key/value NOT shorthanded');

  // ---- Rule filtering ----
  console.log('\nRule Filtering:');

  out = await refactorCode("var x = 'a' + b;", { format: false, rules: ['varToConstLet'] });
  assertIncludes(out, 'const x', 'only varToConstLet rule applied');
  assertNotIncludes(out, '`', 'templateLiteral rule NOT applied when filtered out');

  out = await refactorCode('var x = 1;', { format: false, rules: ['templateLiteral'] });
  assertIncludes(out, 'var x', 'var NOT changed when varToConstLet not in rules');

  // ---- TypeScript ----
  console.log('\nTypeScript:');

  out = await refactorTypeScript('interface Foo { x: number; y: string; }', { format: false });
  assertIncludes(out, 'type Foo', 'simple interface converted to type alias');

  out = await refactorTypeScript('interface Bar extends Foo { z: boolean; }', { format: false });
  assertIncludes(out, 'interface Bar', 'interface with extends NOT converted');

  out = await refactorTypeScript('interface Baz { doStuff(): void; }', { format: false });
  assertIncludes(out, 'interface Baz', 'interface with methods NOT converted');

  out = await refactorTypeScript('var x: number = 1;', { format: false });
  assertIncludes(out, 'const x: number = 1', 'TS var to const with type annotation');

  // ---- API (index.js) ----
  console.log('\nAPI (index.js):');

  out = await refactor({ code: 'var x = 1;', language: 'javascript', options: { format: false } });
  assertIncludes(out, 'const x = 1', 'refactor() API works for JS');

  out = await refactor({ code: 'interface F { a: number; }', language: 'typescript', options: { format: false } });
  assertIncludes(out, 'type F', 'refactor() API works for TS');

  // ---- Prettier formatting ----
  console.log('\nFormatting:');

  out = await refactorCode('var x=1;var y=2;', { format: true });
  assert(out.includes('const x = 1'), 'Prettier formats output');

  out = await refactorCode('var x=1;', { format: false });
  assert(!out.includes('\n\n'), 'format: false skips Prettier');

  // ---- Error handling ----
  console.log('\nError Handling:');

  try {
    await refactorCode('function {{{', { format: false });
    assert(false, 'should throw on invalid syntax');
  } catch (e) {
    assert(e.message.includes('Unexpected'), 'throws parse error on invalid syntax');
  }

  // ---- Edge cases ----
  console.log('\nEdge Cases:');

  out = await refactorCode('', { format: false });
  assert(out.trim() === '', 'empty input returns empty output');

  out = await refactorCode('// just a comment', { format: false });
  assertIncludes(out, '// just a comment', 'comments preserved');

  out = await refactorCode('const already = "modern";', { format: false });
  assertIncludes(out, 'const already = "modern"', 'already-modern code unchanged');

  // ---- Summary ----
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
