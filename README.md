# Tuner Simulations action

Runs Tuner voice-agent simulations with the Tuner CLI, then reports the result as the job's check, a job summary and one PR comment per agent that is updated on every push.

```yaml
on: pull_request
permissions:
  contents: read
  pull-requests: write # for the PR comment
concurrency:
  group: tuner-${{ vars.TUNER_AGENT_ID }}
jobs:
  simulations:
    runs-on: ubuntu-latest
    timeout-minutes: 70 # above the action's timeout
    if: github.event.pull_request.head.repo.fork == false
    steps:
      - uses: usetuner/tuner-action@v1
        with:
          api-key: ${{ secrets.TUNER_API_KEY }}
          agent: ${{ vars.TUNER_AGENT_ID }}
          tag: smoke
```

Inputs and outputs are listed in `action.yml`.

| CLI exit | Check | PR comment |
| --- | --- | --- |
| 0 | Pass | totals, link to run |
| 1 | Fail | failed scenarios with failed evals, link to run |
| 2 | Fail | the reason and what to fix |
| 3 | Pass with a warning (Fail with `fail-on-tuner-error: true`) | the reason and that the build wasn't blocked |
| 130 / 143 | Cancelled | not updated |

The action fills in run metadata (`commit`, `branch`, `pr_url`, `repo_url`) with `--meta`. On pull requests `commit` is the PR head, not the merge commit.

## Requirements

- Linux or macOS runner with `npm` on the PATH (GitHub-hosted runners have it).
- The action installs `@usetuner.ai/cli` from npm at run time, at the exact version pinned in `src/install.ts` (`CLI_VERSION`). Every step installs the same version.
- `--meta` needs a Tuner CLI release newer than 0.1.0. The pin is 0.1.0 until that release is on npm, so runs fail with "unknown option '--meta'" until the pin is bumped.

The job summary and comment show scenario names, results and failed eval names only. Transcripts, audio and eval reasoning never reach GitHub.
