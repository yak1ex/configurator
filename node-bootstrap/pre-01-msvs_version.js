const candidates = Object.keys(process.env).filter(name => name.match(/^VS\d+COMNTOOLS$/)).sort();
if(candidates.length === 0) {
  console.error('No VS installed?');
  process.exit(1);
}
const key = candidates[candidates.length-1].match(/^VS(\d+)COMNTOOLS$/)[1];
const versions = {
  '100': '2010',
  '110': '2012',
  '120': '2013',
  '140': '2015',
  '150': '2017',
  '160': '2019',
  '170': '2022'
};
if(!(key in versions)) {
  console.error(`Unknown version identifier ${key}`);
  process.exit(1);
}
process.env['npm_config_msvs_version'] = versions[key];
console.log(`env:npm_config_msvs_version=${versions[key]}`)