/* istanbul ignore file */
import App from "./app";
import HealthCheckController from "./utils/healthCheck/healthCheck.controller";
import AuthenticationController from "./components/Authentication/authentication.controller";
import { logger as winston } from "./config/winston";


async function main(): Promise<void> {
  try {
    // prettier-ignore
    const app = new App([
        new HealthCheckController(),
        new AuthenticationController(),
        // new InstitutionController(),
    ]);
    app.listen();
  } catch (error) {
    winston.log("error", "Server initiation failed: %s ", error.message);
  }
}

main();
