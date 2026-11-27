# Tuner Simulations

[![Version](https://img.shields.io/github/v/tag/usetuner/tuner-action?label=version)](https://github.com/usetuner/tuner-action/tags)
[![CI](https://github.com/usetuner/tuner-action/actions/workflows/ci.yml/badge.svg)](https://github.com/usetuner/tuner-action/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/usetuner/tuner-action)](LICENSE)

Run [Tuner](https://usetuner.ai) voice-agent simulations in GitHub Actions and get the result as a pass/fail check, a job summary and a pull request comment.

The action installs the [Tuner CLI](https://www.npmjs.com/package/@usetuner.ai/cli) (`@usetuner.ai/cli`, pinned to 0.3.0), runs `tuner sim run` for your agent, and turns the CLI's exit code into the check.

## Quickstart

You need a Tuner agent with simulation set up and some Scenarios that share a tag, such as `smoke`. See the [GitHub Actions guide](https://docs.usetuner.ai/docs/simulation/ci/github-actions) for the full setup.

1. **Get an API key.** In the [Tuner app](https://app.usetuner.ai), open **API Keys** in the **Workspace** section of the sidebar and click **Create API Key**. See [API keys and IDs](https://docs.usetuner.ai/docs/getting-started/api-keys).
2. **Add it to your repository.** Go to **Settings > Secrets and variables > Actions**. Add a secret named `TUNER_API_KEY` with the key, and a variable named `TUNER_AGENT_ID` with the agent's Agent Remote ID (on **Agent Settings > Agent Setup** in Tuner).
3. **Add a workflow**, for example `.github/workflows/tuner.yml`:

```yaml
name: voice-agent-tests
on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: tuner-${{ vars.TUNER_AGENT_ID }} # one run per agent at a time

jobs:
  simulations:
    runs-on: ubuntu-latest
    timeout-minutes: 70 # keep above the action's timeout (60m)
    steps:
      - uses: usetuner/tuner-action@v1
        with:
          api-key: ${{ secrets.TUNER_API_KEY }}
          agent: ${{ vars.TUNER_AGENT_ID }}
          tag: smoke
```

A simulation calls your agent as it is deployed right now. If the workflow also deploys the agent, add `needs: <deploy job>` so the simulations wait for it.

## Examples

### Comment on pull requests

On `pull_request` events the action posts one comment per agent and updates it on every push. It needs `pull-requests: write`. Forks get no secrets, so skip them.

```yaml
on: pull_request

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: tuner-${{ vars.TUNER_AGENT_ID }}

jobs:
  simulations:
    if: github.event.pull_request.head.repo.fork == false
    runs-on: ubuntu-latest
    timeout-minutes: 70
    steps:
      - uses: usetuner/tuner-action@v1
        with:
          api-key: ${{ secrets.TUNER_API_KEY }}
          agent: ${{ vars.TUNER_AGENT_ID }}
          tag: smoke
```

### Run a suite, fail on any error and use the outputs

A [suite](https://docs.usetuner.ai/docs/simulation/suites) carries its own Scenarios and run settings, so don't set `language`, `profile`, `noise` or `noise-intensity` with it.

```yaml
    steps:
      - id: tuner
        uses: usetuner/tuner-action@v1
        with:
          api-key: ${{ secrets.TUNER_API_KEY }}
          agent: ${{ vars.TUNER_AGENT_ID }}
          suite: regression
          timeout: 30m
          fail-on-tuner-error: true # fail even when Tuner couldn't finish the run
          meta: |
            env=staging
      - if: always()
        env:
          PASSED: ${{ steps.tuner.outputs.passed }}
          TOTAL: ${{ steps.tuner.outputs.total }}
          RUN_URL: ${{ steps.tuner.outputs.run-url }}
        run: echo "$PASSED/$TOTAL passed: $RUN_URL"
```

## Inputs

Set exactly one of `tag`, `scenario` or `suite`.

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api-key` | yes | | Tuner API key. Store it as a repository secret. The step fails without it. |
| `agent` | no | `TUNER_AGENT_ID` env | Agent to test (its Agent Remote ID). Falls back to the `TUNER_AGENT_ID` environment variable. |
| `tag` | one of three | | Run the agent's Scenarios with this tag. |
| `scenario` | one of three | | Scenario IDs to run, comma-separated. |
| `suite` | one of three | | Run this suite by name, with its own Scenarios and settings. Don't set `language`, `profile`, `noise` or `noise-intensity` with it. |
| `language` | no | | Caller language, a code (`en-US`) or full name. |
| `profile` | no | | Test profile name. |
| `noise` | no | | Background noise slug. |
| `noise-intensity` | no | | Noise level: `low`, `medium` or `high`. |
| `max-concurrent-calls` | no | agent's current limit (10 unless changed) | Most simulation calls in progress at once, 1 to 10. Saved on the agent, so later runs without it use the same value. |
| `timeout` | no | `60m` | Cancel the run after this long, e.g. `30m`. Keep the job's `timeout-minutes` above it. |
| `fail-on-tuner-error` | no | `false` | Fail the check when Tuner couldn't finish the run. By default it passes with a warning. |
| `meta` | no | | Extra run metadata, one `key=value` per line. A key here overrides the one the action fills in. |
| `comment` | no | `true` | Post or update a comment on the pull request. |
| `github-token` | no | `${{ github.token }}` | Token used only for the pull request comment. |
| `base-url` | no | | Tuner API base URL. Advanced. |
| `cli-package` | no | `@usetuner.ai/cli@0.3.0` | npm package spec for the Tuner CLI, e.g. a tarball path. Advanced, for testing. |

## Outputs

Give the step an `id` to read them, e.g. `steps.tuner.outputs.run-url`. `exit-code` is always set; the others are set when the CLI returned a result.

| Output | Description |
| --- | --- |
| `run-id` | Tuner run ID. |
| `run-url` | Link to the run in Tuner. |
| `result` | Run result, e.g. `passed` or `failed`. |
| `reason` | Why the run didn't pass, e.g. `agent_failed`, `timeout` or an error code. |
| `exit-code` | Tuner CLI exit code. |
| `total` | Number of Scenarios. |
| `passed` | Scenarios that passed. |
| `failed` | Scenarios that failed. |

## Pass, fail and exit codes

The [CLI's exit code](https://docs.usetuner.ai/docs/simulation/cli#exit-codes) decides the check:

| CLI exit | Meaning | Check | PR comment |
| --- | --- | --- | --- |
| `0` | Every Scenario passed | Pass | Totals and a link to the run |
| `1` | A Scenario failed its evals | Fail | Every Scenario with its result; failed ones with failed evals and a call link |
| `2` | Setup problem (bad input, unknown agent or tag, no credits, run already in progress...) | Fail | The CLI's error message, saying what to fix |
| `3` | Tuner couldn't finish the run (timeout, Tuner error) | Pass with a warning, or Fail with `fail-on-tuner-error: true` | The reason and whether the build was blocked |
| `130` / `143` | The job was stopped; the run is canceled | Fail (job shows as cancelled) | Not updated |
| other | No result from the CLI | Fail | Not updated |

The PR comment is skipped, with a warning, when the workflow lacks `pull-requests: write` or the PR comes from a fork, and with a notice when the PR has a newer commit than the one tested. The check and job summary still appear.

## Good to know

- **Runners:** Linux or macOS with `npm` on the PATH (GitHub-hosted runners have it). Windows runners fail.
- **One run per agent:** an agent runs one simulation at a time, so use a `concurrency` group per agent as above.
- **Run metadata:** the action sends `commit`, `branch`, `pr_url` and `repo_url` with the run. On pull requests `commit` is the PR head, not the merge commit.
- **Privacy:** the job summary and comment show Scenario names, results and failed eval names only. Transcripts, audio and eval reasoning never reach GitHub. The API key is masked in logs and passed to the CLI through the environment, never as an argument.

## Related

- [Tuner docs: GitHub Actions](https://docs.usetuner.ai/docs/simulation/ci/github-actions)
- [Tuner CLI](https://github.com/usetuner/tuner-cli) ([npm](https://www.npmjs.com/package/@usetuner.ai/cli)), for GitLab CI, CircleCI, Jenkins or your terminal

## Support

- Questions and setup: [docs.usetuner.ai](https://docs.usetuner.ai)
- Bugs and feature requests: [open an issue](https://github.com/usetuner/tuner-action/issues)
- Security problems: report privately, see [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)
