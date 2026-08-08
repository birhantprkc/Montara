// Load .env before any demo touches a provider. Imported for its side effect.
import { loadDotEnv } from "../../packages/cli/src/dotenv.ts";

loadDotEnv(process.cwd());
