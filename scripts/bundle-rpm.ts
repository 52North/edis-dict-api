const { execSync } = require('child_process');
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
    { cwd: nodelModulesPath, src: '*', dest: `/opt/${targetName}/node_modules` }
  ]
};

console.log(`Build application ${application}`);
execSync(
  `rm -rf ${buildPath} && npm install && npm run build`,
  { stdio: [0, 1, 2] }
);

buildRpm(options, function(err: any, rpm: any) {
  if (err) {
    throw err;
  }
  
  console.log(`RPM file written to ${rpm}`);
  
});
 
