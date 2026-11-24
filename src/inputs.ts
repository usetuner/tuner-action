import type { Metadata } from "./metadata.js";

export interface Inputs {
  apiKey: string;
  agent: string;
  tag: string;
  scenario: string;
  suite: string;
  language: string;
  profile: string;
  noise: string;
  noiseIntensity: string;
  timeout: string;
  failOnTunerError: boolean;
  meta: string;
  comment: boolean;
  githubToken: string;
  baseUrl: string;
  cliPackage: string;
}

export const DEFAULT_TIMEOUT = "60m";

export const MISSING_KEY = "No Tuner API key provided. Add it as a repository secret.";
export const UNSUPPORTED_OS = "Tuner CLI supports Linux and macOS runners.";

export type GetInput = (name: string) => string;

export function readInputs(get: GetInput, env: NodeJS.ProcessEnv): Inputs {
  const bool = (name: string, fallback: boolean) => {
    const v = get(name).trim().toLowerCase();
    if (!v) return fallback;
    if (v === "true") return true;
    if (v === "false") return false;
    throw new Error(`Input '${name}' must be true or false.`);
  };
  return {
    apiKey: get("api-key").trim(),
    agent: get("agent").trim() || (env.TUNER_AGENT_ID ?? "").trim(),
    tag: get("tag").trim(),
    scenario: get("scenario").trim(),
    suite: get("suite").trim(),
    language: get("language").trim(),
    profile: get("profile").trim(),
    noise: get("noise").trim(),
    noiseIntensity: get("noise-intensity").trim(),
    timeout: get("timeout").trim() || DEFAULT_TIMEOUT,
    failOnTunerError: bool("fail-on-tuner-error", false),
    meta: get("meta"),
    comment: bool("comment", true),
    githubToken: get("github-token").trim(),
    baseUrl: get("base-url").trim(),
    cliPackage: get("cli-package").trim(),
  };
}

/** `tuner sim run` arguments. The API key goes in the environment, never in argv. */
export function cliArgs(inputs: Inputs, meta: Metadata): string[] {
  const args: string[] = [];
  if (inputs.baseUrl) args.push("--base-url", inputs.baseUrl);
  args.push("sim", "run");
  const flags: [string, string][] = [
    ["--agent", inputs.agent],
    ["--tag", inputs.tag],
    ["--scenario", inputs.scenario],
    ["--suite", inputs.suite],
    ["--language", inputs.language],
    ["--profile", inputs.profile],
    ["--noise", inputs.noise],
    ["--noise-intensity", inputs.noiseIntensity],
    ["--timeout", inputs.timeout],
  ];
  for (const [flag, value] of flags) if (value) args.push(flag, value);
  for (const [key, value] of Object.entries(meta)) args.push("--meta", `${key}=${value}`);
  args.push("--output", "json");
  return args;
}
