import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNameScript, connectorApi } from '../src/nameScript';

// A fake Obsidian app exposing one connector plugin's api, like Randomness.
function host(api: unknown, id = 'randomness') {
  return { plugins: { plugins: { [id]: { api } } } };
}

test('connectorApi resolves the named plugin api, undefined otherwise', () => {
  const h = host({ rollUnscoped: () => {} });
  assert.ok(connectorApi(h, 'randomness'));
  assert.equal(connectorApi(h, 'not-installed'), undefined);
  assert.equal(connectorApi(undefined, 'randomness'), undefined);
});

test('runs the Randomness-style call and returns .result', async () => {
  const api = { rollUnscoped: async (t: string) => ({ result: `rolled:${t}` }) };
  const out = await runNameScript(
    'return (await api.rollUnscoped("TF-ThievesGuildName")).result;',
    host(api),
    'randomness',
    'seed-1',
  );
  assert.equal(out, 'rolled:TF-ThievesGuildName');
});

test('supports a synchronous return and trims the result', async () => {
  const out = await runNameScript('return "  House Vance  ";', host(null), 'randomness', 's');
  assert.equal(out, 'House Vance');
});

test('the seed is in scope', async () => {
  const out = await runNameScript('return "Arms of " + seed;', host(null), 'randomness', 'Bramford');
  assert.equal(out, 'Arms of Bramford');
});

test('empty script throws (caller falls back to built-in)', async () => {
  await assert.rejects(() => runNameScript('   ', host(null), 'randomness', 's'));
});

test('empty / null return throws', async () => {
  await assert.rejects(() => runNameScript('return "";', host(null), 'randomness', 's'));
  await assert.rejects(() => runNameScript('return null;', host(null), 'randomness', 's'));
});

test('a throwing script propagates (so resolveName can fall back)', async () => {
  const api = { rollUnscoped: async () => { throw new Error('no such table'); } };
  await assert.rejects(
    () => runNameScript('return (await api.rollUnscoped("x")).result;', host(api), 'randomness', 's'),
    /no such table/,
  );
});

test('missing connector plugin leaves api undefined', async () => {
  // Script that guards for a missing api can still succeed.
  const out = await runNameScript(
    'return api ? "has-api" : "no-api";',
    host({ rollUnscoped: () => {} }, 'obsidian-dice-roller'), // different id than requested
    'randomness',
    's',
  );
  assert.equal(out, 'no-api');
});
