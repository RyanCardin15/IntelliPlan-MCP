import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileEpicRepository } from "../infrastructure/persistence/FileEpicRepository.js";
import { EpicService } from "../domain/task/services/EpicService.js";
import { registerAllTools } from "../application/tools/index.js";

/**
 * Main application class that sets up the MCP server and dependencies
 */
export class IntelliPlanApp {
  private server: McpServer;
  private epicRepository: FileEpicRepository;
  private epicService: EpicService;
  
  constructor() {
    // Create the server
    this.server = new McpServer({
      name: "IntelliPlan",
      version: "1.0.0",
    });
    
    // Set up repositories with a default location that will be overridden by user choices
    this.epicRepository = new FileEpicRepository(process.cwd());
    
    // Set up services
    this.epicService = new EpicService(this.epicRepository);
  }
  
  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      // No pre-initialization of storage - let the agent tools handle it
      
      // Try to load epics from repository if storage was previously configured
      try {
        await this.epicRepository.loadEpics();
      } catch (error) {
        // It's okay if this fails - storage might not be configured yet
        console.log("Note: Epic storage not initialized yet. Use manageItems tool (action: configure) to configure.");
      }
      
      // Register tools and resources
      registerAllTools(this.server);
      
      // Set up graceful shutdown
      this.setupShutdownHandlers();
      
      // Connect the transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      console.log("IntelliPlan server started.");
    } catch (error) {
      console.error("Failed to start IntelliPlan server:", error);
      process.exit(1);
    }
  }
  
  /**
   * Set up handlers for shutdown signals
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string): Promise<void> => {
      try {
        await this.epicRepository.saveEpics();
        console.log(`Shutting down gracefully (${signal}).`);
        process.exit(0);
      } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
      }
    };
    
    // Handle termination signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
} 