const os   = require('os');
const cp   = require('child_process');
const path = require('path');
const {Octokit} = require('@octokit/rest');
const {sleep}   = require('extra-sleep')
const fs        = require('extra-fs');




//#region CONSTANTS
//=================

/** Default options for fetching/concealing gists. */
const OPTIONS = {
  gistDescriptionMatch: /.*/,
  gistFilenameMatch:    /.*/,
  githubThrottle:       4000,
};

const HELP = '' +
`Usage:
$ script-gist-conceal [options] <command>

Options:
  -i, --input <file>               Input file (for conceal).
  -o, --output <file>              Output file (for fetch/conceal).
  --github-token <token>           GitHub token.
  --github-throttle <milliseconds> Throttle time in milliseconds.
  --gist-description-match <regex> Regex to match gist description.
  --gist-filename-match <regex>    Regex to match gist filename.

Commands:
  fetch                            Fetch gists matching criteria.
  conceal                          Conceal gists by creating new secret gists.

Environment Variables:
  $GITHUB_TOKEN                    GitHub token.
  $GITHUB_THROTTLE                 Throttle time in milliseconds.
`;
//#endregion




//#region METHODS
//===============

//#region REGEXP OPERATIONS
//-------------------------

/**
 * Parse text into a regular expression.
 * @param {string} text text to parse
 * @returns {RegExp} regular expression
 */
function parseRegexp(text) {
  var m = text.match(/^\/(.*)\/([gimuy]*)$/);
  return m? new RegExp(m[1], m[2]) : new RegExp(text);
}
//#endregion




//#region GIST OPERATIONS
//-----------------------

/**
 * Get details of a gist, as a string.
 * @param {object} gist gist to get details of
 * @returns {string} details of gist
 */
function gistDetails(gist) {
  var a = '';
  a += `# URL: ${gist.html_url}\n`;
  a += `# Description: ${gist.description}\n`;
  a += `# Files: ${Object.keys(gist.files).join(', ')}\n`;
  return a;
}


/**
 * Fetch user's public gists, and filter by filename and description (regex).
 * @param {Octokit} octokit github api client
 * @param {object} options options {gistFilenameMatch, gistDescriptionMatch, githubThrottle}
 * @param {Function?} onGist called on each gist (gist)
 * @returns {Promise<object[]>} array of matching gists
 */
async function fetchGists(octokit, options, onGist) {
  var gists = [], per_page = 100;
  var o = Object.assign({}, OPTIONS, options);
  for (var page=0;; ++page) {
    // Fetch a page of gists for user.
    var res = await octokit.gists.list({per_page, page});
    // Filter gists by filename and description.
    var someGists = res.data.filter(gist => {
      if (!gist.public) return false;
      if (!o.gistDescriptionMatch.test(gist.description)) return false;
      for (var file in gist.files)
        if (o.gistFilenameMatch.test(file)) return true;
      return false;
    });
    // Invoke callback on each gist.
    if (onGist) for (var gist of someGists)
      onGist(gist);
    // Accumulate gists.
    gists.push(...someGists);
    console.error(`Found ${gists.length} matching gists...`);
    // Stop if less than a page of gists was returned.
    if (res.data.length < per_page) break;
    // Throttle requests.
    await sleep(o.githubThrottle);
  }
  console.error(`Found a total of ${gists.length} matching gists.`);
  return gists;
}


/**
 * Make each gist secret by creating a new secret gist, and deleting the old one.
 * @param {Octokit} octokit github api client
 * @param {object[]} gists array of gists to conceal
 * @param {object} options options {githubThrottle}
 * @returns {Promise<[object, object][]>} array of pairs of gists [sourceGist, targetGist]
 */
async function concealGists(octokit, gists, options) {
  var o = Object.assign({}, OPTIONS, options);
  var gistPairs = [];
  // Create a temporary directory to clone gists into.
  var tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '/script-gist-conceal-'));
  // For each gist, clone it, copy files to a new gist, and delete the old gist.
  for (var sourceGist of gists) {
    var isPartial = !sourceGist.html_url;
    // Fetch the gist if it is not fully populated.
    if (isPartial) {
      var res = await octokit.gists.get({gist_id: sourceGist.id});
      sourceGist = res.data;
    }
    console.error(`Concealing gist ${sourceGist.id} ...`);
    console.error(gistDetails(sourceGist));
    // Create a new gist with the same files as the source gist, but empty.
    var files = {};
    for (var file in sourceGist.files)
      files[file] = {content: 'EMPTY'};
    // Create a new gist with the same description as the source gist.
    var {description} = sourceGist;
    if (isPartial) await sleep(o.githubThrottle);
    var res = await octokit.gists.create({public: false, description, files});
    var targetGist = res.data;
    // Clone the source gist, copy files to the target gist, and push.
    cp.execSync(`git clone ${sourceGist.git_pull_url} source_gist`, {cwd: tempDir});
    cp.execSync(`git clone ${targetGist.git_pull_url} target_gist`, {cwd: tempDir});
    cp.execSync(`cp -r source_gist/* target_gist/`, {cwd: tempDir});
    cp.execSync(`cd target_gist && git add . && git commit -m "conceal gist" && git push`, {cwd: tempDir});
    cp.execSync(`rm -rf source_gist target_gist`, {cwd: tempDir});
    console.error();
    // Delete the source gist.
    await octokit.gists.delete({gist_id: sourceGist.id});
    await sleep(o.githubThrottle);
    // Add the pair of gists to the list.
    gistPairs.push([sourceGist, targetGist]);
    // Share details of the target gist.
    console.error(`Concealed gist ${sourceGist.id} as ${targetGist.id}.`);
    console.error(gistDetails(targetGist));
    console.error();
  }
  // Remove the temporary directory.
  fs.rmdirSync(tempDir);
  return gistPairs;
}
//#endregion




//#region MAIN
//------------

/**
 * Parse command line arguments into options.
 * @param {object} options options to parse into
 * @param {string[]} argv command line arguments
 * @param {number} i index of argument to parse
 * @returns {number} index of next argument to parse
 */
function parseArguments(options, argv, i) {
  var o = options, a = argv;
  if (a[i]==='--help') o.help = true;
  else if (a[i]==='-i' || a[i]==='--input')  o.input  = a[++i];
  else if (a[i]==='-o' || a[i]==='--output') o.output = a[++i];
  else if (a[i]==='--github-token')    o.githubToken    = a[++i];
  else if (a[i]==='--github-throttle') o.githubThrottle = parseFloat(a[++i]);
  else if (a[i]==='--gist-description-match') o.gistDescriptionMatch = parseRegexp(a[++i]);
  else if (a[i]==='--gist-filename-match')    o.gistFilenameMatch    = parseRegexp(a[++i]);
  else if (a[i].startsWith('--')) o.error = `Unknown option: ${a[i]}`;
  else o.command = a[i];
  return ++i;
}


/**
 * Parse environment variables into options.
 * @param {object} options options to parse into
 * @param {object} env environment variables
 */
function parseEnvironment(options, env) {
  var o = options, e = env;
  if (e.GITHUB_TOKEN)    o.githubToken    = e.GITHUB_TOKEN;
  if (e.GITHUB_THROTTLE) o.githubThrottle = parseFloat(e.GITHUB_THROTTLE);
}


/**
 * Validate options, and set error if invalid.
 * @param {object} options options to validate
 */
function validateOptions(options) {
  var o = options;
  if (!o.command)     o.error = 'Missing command!';
  if (!o.githubToken) o.error = 'Missing GitHub token!';
  if (o.githubThrottle < 0) o.error = 'GitHub throttle must be >= 0!';
}


/**
 * Fetch user's public gists matchig specified criteria, and write to output file.
 * @param {Octokit} octokit github api client
 * @param {object} options fetch options
 */
async function performFetch(octokit, options) {
  var o = options, text = '';
  var gists = await fetchGists(octokit, o);
  for (var gist of gists)
    text += `${gist.id}\n${gistDetails(gist)}\n`;
  if (o.output) fs.writeFileTextSync(o.output, text);
  else console.log(text);
}


/**
 * Conceal gists specified in input file, or all matching gists.
 * @param {Octokit} octokit github api client
 * @param {object} options conceal options
 */
async function performConceal(octokit, options) {
  var o = options, gists = null;
  if (o.input) {
    var text  = fs.readFileTextSync(o.input);
    var ids   = text.replace(/^\#[^\n]*/gm, '').trim().split(/\s+/);
    gists = ids.map(id => ({id}));
  }
  else gists = await fetchGists(octokit, o);
  var gistPairs = await concealGists(octokit, gists, o);
  if (!o.output) return;
  var text = '';
  for (var [sourceGist, targetGist] of gistPairs) {
    text += `${sourceGist.id} -> ${targetGist.id}\n`;
    text += `${gistDetails(targetGist)}\n`;
  }
  fs.writeFileTextSync(o.output, text);
}


/**
 * Make each gist secret by creating a new secret gist, and deleting the old one.
 */
async function main() {
  const E = process.env;
  const A = process.argv;
  var o = Object.assign({}, OPTIONS);
  for (var i=2; i<A.length;)
    i = parseArguments(o, A, i);
  parseEnvironment(o, E);
  validateOptions(o);
  if (o.help)  { console.log(HELP);      return; }
  if (o.error) { console.error(o.error); return; }
  var octokit = new Octokit({auth: o.githubToken});
  switch (o.command) {
    case 'fetch':   await performFetch(octokit, o);   break;
    case 'conceal': await performConceal(octokit, o); break;
    default:        console.error(`Unknown command: ${o.command}`);
  }
}
main();
//#endregion
//#endregion
