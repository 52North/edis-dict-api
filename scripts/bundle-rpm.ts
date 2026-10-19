const { execFileSync, execSync } = require('child_process');
const buildRpm = require('rpm-builder');
const versionInfo = require('../versions').versions

// BUILD_NUMBER provided by Jenkins
// Override BUILD_NUMBER by setting a RELEASE_VERSION
const releaseVersion = process.env['RELEASE_VERSION'] 
    || process.env['BUILD_NUMBER']
    || "1";

console.log(`rpm version: ${versionInfo.version}`)
console.log(`rpm release version: ${releaseVersion}`)

const application = process.argv[2] !== undefined ? process.argv[2] : "pegelonline-dict-api";
const targetName = process.argv[3] !== undefined ?process.argv[3] : application;
const rootPath = `./`;
const buildPath = `./dist/`;
const nodelModulesPath = `./node_modules/`;

console.log(`build application ${application} into ${buildPath}`)

const options = {
  name: 'pegelonline-dict-api',
  version: versionInfo.version,
  release: releaseVersion,
  description: "The PEGELONLINE Dict API built for EDIS",
  group: "Applications/Internet",
  buildArch: 'noarch',
  keepTemp: false,
  rpmDest: './dist/',
  files: [
    { cwd: buildPath, src: '*', dest: `/opt/${targetName}` },
    { cwd: nodelModulesPath, src: '*', dest: `/opt/${targetName}/node_modules` },
    { cwd: buildPath, src: 'pegelonline-dict-api-sbom.json', dest: `/opt/${targetName}` }
  ]
};

console.log(`Cleaning output directory ${buildPath}`);
execSync(
  `rimraf -rf ${buildPath}`,
  { stdio: [0, 1, 2] }
);

console.log(`Build application ${application}`);
execSync(
  `npm install && npm run build`,
  { stdio: [0, 1, 2] }
);

console.log(`Creating SBOM for application ${application}`);
execFileSync(process.execPath, [
  './node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js',
  '--output-format', 'JSON',
  '--omit', 'dev',
  '--flatten-components',
  '--output-reproducible',
  '--output-file', `${buildPath}pegelonline-dict-api-sbom.json`
]);

buildRpm(options, function(err: any, rpm: any) {
  if (err) {
    throw err;
  }
  
  console.log(`RPM file written to ${rpm}`);
  
});
 
