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

Set exactly one of `tag`, `scenario` or `suite`. A suite is a saved list of scenarios with its own run settings, so `suite` can't be combined with `language`, `profile`, `noise` or `noise-intensity`:

```yaml
        with:
          api-key: ${{ secrets.TUNER_API_KEY }}
          agent: ${{ vars.TUNER_AGENT_ID }}
          suite: smoke
```

A suite run reports pass or fail the same way as a tag run.

Set `max-concurrent-calls` (1 to 10) to cap how many simulation calls run at once for the agent. When it's unset, the agent's saved value is used.

| CLI exit | Check | PR comment |
| --- | --- | --- |
| 0 | Pass | totals, link to run |
| 1 | Fail | every scenario with its result; failed ones with failed evals and a call link; link to run |
| 2 | Fail | the reason and what to fix |
| 3 | Pass with a warning (Fail with `fail-on-tuner-error: true`) | the reason and that the build wasn't blocked |
| 130 / 143 | Cancelled | not updated |

The action fills in run metadata (`commit`, `branch`, `pr_url`, `repo_url`) with `--meta`. On pull requests `commit` is the PR head, not the merge commit.

## Requirements

- Linux or macOS runner with `npm` on the PATH (GitHub-hosted runners have it).
- The action installs `@usetuner.ai/cli` from npm at run time, at the exact version pinned in `src/install.ts` (`CLI_VERSION`). Every step installs the same version.

The job summary and comment show scenario names, results and failed eval names only. Transcripts, audio and eval reasoning never reach GitHub.
