Make a gist secret by creating a new secret gist, and deleting the old one.

![](https://i.imgur.com/VaudKyG.jpg)

<br>


```bash
$ node index.js fetch --github-token <token> --output gists.log
# Fetch all public gists and save to gists.log

$ export GITHUB_TOKEN=<token>
$ node index.js fetch -o gists.log --gist-filename-match /^output-/i
# Fetch all public gists, whose filename starts with "output-"

$ node index.js fetch -o gists.log --gist-description-match /OUTPUT\$/i
# Fetch all public gists, whose description ends with "OUTPUT"

# You can now go ahead and remove the gists you don't want to conceal in gists.log
# Then, run one of the following command to conceal the remaining gists

$ node index.js conceal --input gists.log
# Conceal all gists in gists.log, by creating a new secret gist, and deleting the old one

$ node index.js conceal --input gists.log -o status.log
# Conceal all gists in gists.log, and save status to status.log
```

<br>
<br>


## Usage

```bash
$ script-gist-conceal [options] <command>

# Options:
#   -i, --input <file>               Input file (for conceal).
#   -o, --output <file>              Output file (for fetch/conceal).
#   --github-token <token>           GitHub token.
#   --github-throttle <milliseconds> Throttle time in milliseconds.
#   --gist-description-match <regex> Regex to match gist description.
#   --gist-filename-match <regex>    Regex to match gist filename.

# Commands:
#   fetch                            Fetch gists matching criteria.
#   conceal                          Conceal gists by creating new secret gists.

# Environment Variables:
#   $GITHUB_TOKEN                    GitHub token.
#   $GITHUB_THROTTLE                 Throttle time in milliseconds.
```

<br>
<br>


## References

- [Escape dollar sign in string by shell script](https://stackoverflow.com/a/37876900/1413259)
- [octokit/rest.js](https://octokit.github.io/rest.js/v20#gists)
- [regex101: build, test, and debug regex](https://stackoverflow.com/q/2973436/1413259)

<br>
<br>


[![](https://img.youtube.com/vi/yqO7wVBTuLw/maxresdefault.jpg)](https://www.youtube.com/watch?v=yqO7wVBTuLw)<br>
[![ORG](https://img.shields.io/badge/org-javascriptf-green?logo=Org)](https://javascriptf.github.io)
