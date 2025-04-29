import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Import schemas used across tools (if needed)
// export { taskIdSchema, ... } from "../schemas/commonSchemas.js";

// Import tool registration functions
import { registerCreateTaskTool } from "./createTaskTool.js";
import { registerManageTaskTool } from "./manageTaskTool.js";
import { registerExecuteTaskTool } from "./executeTaskTool.js";
import { registerGeneratePlanTool } from "./generatePlanTool.js";
import { registerGetTaskOverviewTool } from "./getTaskOverviewTool.js";
import { registerExpandTaskTool } from "./expandTaskTool.js";
import { registerManageTaskStorageTool } from "./manageTaskStorageTool.js";

/**
 * Registers all application tools with the MCP server
 */
export function registerAllTools(server: McpServer): void {
  registerCreateTaskTool(server);
  registerManageTaskTool(server);
  registerExecuteTaskTool(server);
  registerGeneratePlanTool(server);
  registerGetTaskOverviewTool(server);
  registerExpandTaskTool(server);
  registerManageTaskStorageTool(server);
} 