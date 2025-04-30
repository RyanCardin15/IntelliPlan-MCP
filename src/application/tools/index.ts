import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Import schemas used across tools (if needed)
// export { taskIdSchema, ... } from "../schemas/commonSchemas.js";

// Import tool registration functions (updated names & files)
import { registerCreateEpicTool } from "./createEpicTool.js";
import { registerManageItemsTool } from "./manageItemsTool.js";
import { registerExecuteItemTool } from "./executeItemTool.js";
import { registerGetEpicOverviewTool } from "./getEpicOverviewTool.js";
import { registerExpandTaskTool } from "./expandTaskTool.js";
import { registerManageTaskStorageTool } from "./manageTaskStorageTool.js";
import { registerPlanEpicTool } from "./planEpicTool.js";
import { registerBatchEpicTool } from "./batchEpicTool.js";

/**
 * Registers all application tools with the MCP server
 */
export function registerAllTools(server: McpServer): void {
  registerCreateEpicTool(server);
  registerManageItemsTool(server);
  registerExecuteItemTool(server);
  registerGetEpicOverviewTool(server);
  registerExpandTaskTool(server);
  registerManageTaskStorageTool(server);
  registerPlanEpicTool(server);
  registerBatchEpicTool(server);
} 