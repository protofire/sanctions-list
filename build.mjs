import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// ponytail: regex over the whole SDN file instead of an XML parse; over-inclusion only over-blocks
const EVM_ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const MAX_SHRINK_RATIO = 0.1;
const MAX_SHRINK_COUNT = 20;
// Gateway fails closed after 48 h without a fresh checkedAt; 12 h leaves room for GitHub outages
const HEARTBEAT_MS = 12 * 60 * 60 * 1000;

export function extract(xml) {
  return [...new Set((xml.match(EVM_ADDRESS) ?? []).map((a) => a.toLowerCase()))].sort();
}

export function decide({ xml, previous, sourcePublishDate, now }) {
  const heartbeat = () =>
    previous && Date.parse(now) - Date.parse(previous.checkedAt) >= HEARTBEAT_MS
      ? { ...previous, checkedAt: now }
      : null;
  const sourceSha256 = createHash('sha256').update(xml).digest('hex');
  if (previous && previous.sourceSha256 === sourceSha256) {
    return { exitCode: 0, latest: heartbeat(), proposal: null };
  }
  const addresses = extract(xml);
  if (addresses.length === 0) {
    return { exitCode: 3, latest: null, proposal: null };
  }
  const next = {
    schema: 1, sourceSha256, sourcePublishDate, generatedAt: now, checkedAt: now,
    count: addresses.length, addresses,
  };
  const drop = previous ? previous.count - addresses.length : 0;
  if (previous && (drop > MAX_SHRINK_COUNT || drop > previous.count * MAX_SHRINK_RATIO)) {
    // Bulk delisting: a person reviews the PR; the old list (over-blocking, safe) stays live
    return { exitCode: 0, latest: heartbeat(), proposal: next };
  }
  return { exitCode: 0, latest: next, proposal: null };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [xmlPath, latestPath, sourcePublishDate = ''] = process.argv.slice(2);
  const result = decide({
    xml: readFileSync(xmlPath, 'utf8'),
    previous: existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, 'utf8')) : null,
    sourcePublishDate,
    now: new Date().toISOString(),
  });
  if (result.latest) {
    mkdirSync(dirname(latestPath), { recursive: true });
    writeFileSync(latestPath, JSON.stringify(result.latest) + '\n');
  }
  if (result.proposal) writeFileSync('proposal.json', JSON.stringify(result.proposal) + '\n');
  console.log(JSON.stringify({ exitCode: result.exitCode, wrote: !!result.latest, proposal: result.proposal?.count }));
  process.exit(result.exitCode);
}
