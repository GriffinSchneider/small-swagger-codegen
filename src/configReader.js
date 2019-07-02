import _ from 'lodash';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import swift from './swift';
import kotlin from './kotlin';
import js from './js';

const languages = { swift, kotlin, js };

function readFromPath(pathArg) {
  if (!pathArg) {
    return {};
  }

  const configPath = path.resolve(pathArg);
  const configDir = path.dirname(configPath);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return {
    apis: _.mapValues(config.specs, specConfig => ({
      ...specConfig,
      spec: path.resolve(path.join(configDir, specConfig.spec)),
    })),
    languageName: config.language,
    output: config.output,
    opts: config.opts,
    configDir,
  };
}

function resolveSpec(fullPath) {
  const ext = (path.extname(fullPath) || '').toLowerCase();
  const data = fs.readFileSync(fullPath, 'utf8');
  if (['.yml', '.yaml'].includes(ext)) {
    return yaml.safeLoad(data);
  }
  return JSON.parse(data);
}

export function readConfig(argv) {
  const { languageName, apis, output, opts, configDir } = readFromPath(argv._?.[0]);

  const language = languages[languageName || argv.language];
  if (!language) {
    const acceptableInputs = Object.keys(languages).map(l => `  "language": "${l}"`).join('\n');
    throw new Error(`Missing or unknown language '${languageName}'. Please add one of the following to the top level of your config file:\n${acceptableInputs}`);
  }

  if (!apis && (!argv.spec || !argv.name)) {
    throw new Error('Missing configuration file or spec/name arguments');
  }

  const rawSpecs = apis || {
    [argv.name]: {
      spec: argv.spec,
      className: argv.className || argv.name,
      basePath: argv.basePath || undefined,
    },
  };

  // If there's an output path in a config file, resolve the path relative to that config file.
  const resolvedOutput = configDir && output && path.resolve(configDir, output);

  const finalConfig = {
    language,
    apis: _.mapValues(rawSpecs, api => ({
      ...api,
      // Load the specs from the file system
      spec: resolveSpec(api.spec),
    })),
    output: argv.output || resolvedOutput || 'client',
    opts: opts || argv,
  };

  return finalConfig;
}
