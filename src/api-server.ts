import { ApiServer } from './infrastructure/api/server.js';

/**
 * API Server entry point
 */
async function main(): Promise<void> {
  try {
    // Get port from environment variable or use default
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    
    // Get base path from environment variable or use current directory
    const basePath = process.env.STORAGE_PATH || process.cwd();
    
    // Create and start the API server
    const server = new ApiServer(port, basePath);
    await server.start();
    
    console.log(`IntelliPlan API server started on port ${port}`);
    console.log(`Using storage path: ${basePath}`);
  } catch (error) {
    console.error('Failed to start API server:', error);
    process.exit(1);
  }
}

// Start the API server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 