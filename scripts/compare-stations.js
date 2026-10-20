// compares the addresses of two station files, e.g. before and after a harvest
// usage: npm run compare-stations -- [before] [after]
const { readFileSync } = require('fs');

const FIELDS = ['country', 'land', 'kreis', 'city'];

const [beforePath = 'stations.before.json', afterPath = 'stations.json'] =
  process.argv.slice(2);

function load(path) {
  const stations = JSON.parse(readFileSync(path, 'utf8'));
  return new Map(stations.map((st) => [st.uuid, st]));
}

function label(st) {
  return `${st.longname} (${st.uuid})`;
}

function address(st) {
  return FIELDS.map((field) => st[field] ?? '-').join(' / ');
}

// the harvest geocodes only stations with coordinates
function hasCoordinates(st) {
  return !!(st.latitude && st.longitude);
}

function show(value) {
  return value === undefined ? '-' : `'${value}'`;
}

function diffAlternatives(before = [], after = []) {
  return [
    ...after.filter((a) => !before.includes(a)).map((a) => `+'${a}'`),
    ...before.filter((b) => !after.includes(b)).map((b) => `-'${b}'`),
  ].join(' ');
}

// the names first, the alternatives change more often and are less important
function changes(before, after) {
  const lines = FIELDS.filter((field) => before[field] !== after[field]).map(
    (field) => `${field}: ${show(before[field])} → ${show(after[field])}`,
  );
  FIELDS.forEach((field) => {
    const key = `${field}_alternatives`;
    const diff = diffAlternatives(before[key], after[key]);
    if (diff) {
      lines.push(`${key}: ${diff}`);
    }
  });
  return lines;
}

function printSection(title, lines) {
  if (lines.length) {
    console.log(`\n${title}:`);
    lines.forEach((line) => console.log(`  ${line}`));
  }
}

const before = load(beforePath);
const after = load(afterPath);
const afterStations = [...after.values()];

const removed = [...before.values()].filter((st) => !after.has(st.uuid));
const added = afterStations.filter((st) => !before.has(st.uuid));
const changed = afterStations
  .filter((st) => before.has(st.uuid))
  .map((st) => ({ st, lines: changes(before.get(st.uuid), st) }))
  .filter(({ lines }) => lines.length);
const withoutCoordinates = afterStations.filter((st) => !hasCoordinates(st));
const withoutAddress = afterStations.filter(
  (st) => hasCoordinates(st) && !st.country,
);

console.log(
  `${before.size} stations in ${beforePath}, ${after.size} in ${afterPath}`,
);
printSection(`only in ${beforePath} (${removed.length})`, removed.map(label));
printSection(
  `only in ${afterPath} (${added.length})`,
  added.map((st) => `${label(st)}: ${address(st)}`),
);
printSection(
  `changed (${changed.length})`,
  changed.flatMap(({ st, lines }) => [
    label(st),
    ...lines.map((line) => `  ${line}`),
  ]),
);
printSection(
  `without address in ${afterPath} (${withoutAddress.length})`,
  withoutAddress.map(label),
);
printSection(
  `without coordinates in ${afterPath} (${withoutCoordinates.length})`,
  withoutCoordinates.map(label),
);
console.log(
  `\n${after.size - added.length - changed.length} stations unchanged`,
);
