#!/usr/bin/env node

import minimist from 'minimist';
import { readConfig } from './configReader';
import { render } from './renderer';

// Process command line args.
const argv = minimist(process.argv.slice(2));

// eslint-disable-next-line consistent-return
function safeConfigRead() {
  try {
    return readConfig(argv);
  } catch (error) {
    console.error(error.message);
    process.exit(-1);
  }
}

const { language, apis, output, opts } = safeConfigRead();
render(language, apis, opts, output);
