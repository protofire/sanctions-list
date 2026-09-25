import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, decide } from '../build.mjs';

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'B'.repeat(40);
const xml = (...addrs) =>
  `<Sanctions>${addrs.map((a) => `<Feature><FeatureType>Digital Currency Address - USDT</FeatureType><VersionDetail>${a}</VersionDetail></Feature>`).join('')}` +
  `<VersionDetail>bc1qxyz</VersionDetail><VersionDetail>0x${'c'.repeat(64)}</VersionDetail></Sanctions>`;
const T0 = '2026-09-25T00:00:00.000Z';
const T1 = '2026-09-25T01:00:00.000Z'; // +1 h
const T13 = '2026-09-25T13:00:00.000Z'; // +13 h
const many = Array.from({ length: 30 }, (_, i) => '0x' + i.toString(16).padStart(40, '0'));

test('extracts every 0x40-hex token, lower-cased, de-duplicated, not longer hex', () => {
  assert.deepEqual(extract(xml(A, B, A)), [A, B.toLowerCase()]);
});

test('publishes a first version', () => {
  const r = decide({ xml: xml(A), previous: null, sourcePublishDate: 'd', now: T0 });
  assert.equal(r.exitCode, 0);
  assert.equal(r.latest.count, 1);
  assert.equal(r.latest.checkedAt, T0);
  assert.equal(r.proposal, null);
});

test('unchanged source younger than 12 h writes nothing', () => {
  const first = decide({ xml: xml(A), previous: null, sourcePublishDate: 'd', now: T0 }).latest;
  const r = decide({ xml: xml(A), previous: first, sourcePublishDate: 'd', now: T1 });
  assert.equal(r.exitCode, 0);
  assert.equal(r.latest, null);
});

test('unchanged source after 12 h writes a heartbeat only', () => {
  const first = decide({ xml: xml(A), previous: null, sourcePublishDate: 'd', now: T0 }).latest;
  const r = decide({ xml: xml(A), previous: first, sourcePublishDate: 'd', now: T13 });
  assert.equal(r.latest.checkedAt, T13);
  assert.equal(r.latest.generatedAt, T0);
  assert.deepEqual(r.latest.addresses, first.addresses);
});

test('empty extract fails and writes nothing', () => {
  const r = decide({ xml: '<Sanctions/>', previous: null, sourcePublishDate: 'd', now: T0 });
  assert.equal(r.exitCode, 3);
  assert.equal(r.latest, null);
});

test('a large shrink becomes a proposal; main keeps the old list', () => {
  const prev = decide({ xml: xml(...many), previous: null, sourcePublishDate: 'd', now: T0 }).latest;
  const r = decide({ xml: xml(...many.slice(0, 5)), previous: prev, sourcePublishDate: 'd', now: T13 });
  assert.equal(r.exitCode, 0);
  assert.equal(r.proposal.count, 5);
  assert.deepEqual(r.latest.addresses, prev.addresses);
  assert.equal(r.latest.checkedAt, T13);
});

test('a small change publishes directly', () => {
  const prev = decide({ xml: xml(...many), previous: null, sourcePublishDate: 'd', now: T0 }).latest;
  const r = decide({ xml: xml(...many.slice(0, 29), A), previous: prev, sourcePublishDate: 'd', now: T1 });
  assert.equal(r.proposal, null);
  assert.equal(r.latest.count, 30);
  assert.ok(r.latest.addresses.includes(A));
});
