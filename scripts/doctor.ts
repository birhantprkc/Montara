// `montara doctor` - pre-flight environment check.

import { runDoctor } from "../packages/cli/src/doctor";

process.exit(runDoctor(process.argv.slice(2)));
