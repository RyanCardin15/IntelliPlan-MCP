import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileTaskRepository } from "../infrastructure/persistence/FileTaskRepository.js";
import { TaskService } from "../domain/task/services/TaskService.js";
import { registerAllTools } from "../application/tools/index.js";

/**
 * Main application class that sets up the MCP server and dependencies
 */
export class IntelliPlanApp {
  private server: McpServer;
  private taskRepository: FileTaskRepository;
  private taskService: TaskService;
  
  constructor() {
    // Create the server
    this.server = new McpServer({
      name: "IntelliPlan",
      version: "1.0.0",
    });
    
    // Set up repositories
    this.taskRepository = new FileTaskRepository();
    
    // Set up services
    this.taskService = new TaskService(this.taskRepository);
  }
  
  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      // Load tasks from storage
      await this.taskRepository.loadTasks();
      
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
        await this.taskRepository.saveTasks();
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