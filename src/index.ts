import { IntelliPlanApp } from "./core/app.js";

/**
 * Application entry point
 */
async function main(): Promise<void> {
  const app = new IntelliPlanApp();
  await app.initialize();
}

// Start the application
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
}); 