import { IntelliPlanApp } from "./core/app.js";
import type { IntelliPlanConfig } from "./core/app.js";

/**
 * Application entry point
 */
async function main(): Promise<void> {
  // Get configuration from environment variables
  const config: Partial<IntelliPlanConfig> = {
    storageMode: (process.env.STORAGE_MODE === 'remote') ? 'remote' : 'local',
    localBasePath: process.env.LOCAL_STORAGE_PATH,
    remoteApiUrl: process.env.REMOTE_API_URL,
    remoteApiKey: process.env.REMOTE_API_KEY
  };
  
  // Log the configuration
  console.log(`Storage mode: ${config.storageMode}`);
  if (config.storageMode === 'local' && config.localBasePath) {
    console.log(`Local storage path: ${config.localBasePath}`);
  } else if (config.storageMode === 'remote') {
    const apiUrl = config.remoteApiUrl || 'http://localhost:4007';
    console.log(`Remote API URL: ${apiUrl} (default: http://localhost:4007)`);
  }
  
  // Create and initialize the app with the configuration
  const app = new IntelliPlanApp(config);
  await app.initialize();
}

// Start the application
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
}); 