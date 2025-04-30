import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskIdSchema } from "../schemas/commonSchemas.js"; // Keep generic ID schema for now
import { 
    getEpics, 
    getEpicById, 
    getTaskById, // This now returns { epic, task }
    updateEpicStore, 
    saveEpics,
    configureStorage,
    loadEpics
} from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Status, Priority } from "../../domain/task/entities/Task.js";

// Define IDs more clearly
const epicIdSchema = z.string().uuid().describe("ID of the target Epic");
const taskIdSchemaRevised = z.string().uuid().describe("ID of the target Task within an Epic");

const executeItemSchema = z.object({
    epicId: epicIdSchema.optional().describe("ID of the Epic containing the item to execute."),
    taskId: taskIdSchemaRevised.optional().describe("ID of the Task to execute. If omitted with epicId, suggests next Task in Epic. If both omitted, suggests next ready Epic/Task."),
    executionMode: z.enum(['auto', 'manual', 'subtasks']).optional().default('auto').describe("Execution mode (default: auto)"),
    markInProgress: z.boolean().optional().default(true).describe("Mark item in-progress on start (default: true)"),
    additionalContext: z.string().optional().describe("Additional context for execution"),
    documentFindings: z.boolean().optional().default(true).describe("Whether to document findings during execution (default: true)"),
    basePath: z.string().describe("Base directory path for storage (required)")
});

type ExecuteItemParams = z.infer<typeof executeItemSchema>;

// Renamed registration function
export function registerExecuteItemTool(server: McpServer): void {
    server.tool(
        "executeItem", // Renamed tool
        "Executes or provides guidance for executing an Epic or Task.",
        {
             epicId: epicIdSchema.optional(),
             taskId: taskIdSchemaRevised.optional(),
             executionMode: z.enum(['auto', 'manual', 'subtasks']).optional().default('auto'),
             markInProgress: z.boolean().optional().default(true),
             additionalContext: z.string().optional(),
             documentFindings: z.boolean().optional().default(true),
             basePath: z.string()
        },
        async (params: ExecuteItemParams) => {
            const { 
                epicId, 
                taskId, 
                executionMode, 
                markInProgress, 
                additionalContext, 
                documentFindings = true, 
                basePath 
            } = params;
            
            let targetItemDescription = "";
            let suggestionMessage = "";

            if (!basePath) {
                 return { content: [{ type: "text", text: "Error: 'basePath' parameter is required." }], isError: true };
            }

            // Configure storage and load data
            try {
                configureStorage(basePath);
                await loadEpics();
            } catch (error: any) {
                return { content: [{ type: "text", text: `Error accessing storage: ${error.message}` }], isError: true };
            }

            let targetEpic: Epic | undefined;
            let targetTask: Task | undefined;
            let resolvedEpicId = epicId;
            let resolvedTaskId = taskId;

            // --- Determine Target Item --- 

            if (resolvedEpicId && resolvedTaskId) {
                // Specific Task provided
                const result = getTaskById(resolvedTaskId);
                if (!result || result.epic.id !== resolvedEpicId) {
                     return { content: [{ type: "text", text: `Error: Task ${resolvedTaskId} not found within Epic ${resolvedEpicId}.` }], isError: true };
                }
                targetEpic = result.epic;
                targetTask = result.task;
                targetItemDescription = `Task ${resolvedTaskId.substring(0,8)}`;
            } else if (resolvedEpicId && !resolvedTaskId) {
                // Epic provided, find next Task
                targetEpic = getEpicById(resolvedEpicId);
                if (!targetEpic) {
                    return { content: [{ type: "text", text: `Error: Epic ${resolvedEpicId} not found.` }], isError: true };
                }
                // Find next Task logic (simplified: first in-progress or first todo)
                targetTask = targetEpic.tasks.find(t => t.status === 'in-progress') || targetEpic.tasks.find(t => t.status === 'todo');
                if (!targetTask) {
                    return { content: [{ type: "text", text: `No executable Tasks found in Epic ${resolvedEpicId}.` }] };
                }
                resolvedTaskId = targetTask.id;
                suggestionMessage = `Suggested next Task in Epic ${resolvedEpicId.substring(0,8)}: `; 
                targetItemDescription = `Task ${resolvedTaskId.substring(0,8)}`;
            } else {
                // No IDs provided, suggest next ready Epic or Task
                const allEpics = getEpics();
                if (allEpics.length === 0) {
                    return { content: [{ type: "text", text: "No Epics found to suggest or execute." }] };
                }
                
                // Simplified suggestion: Find first in-progress Task across all Epics, then first ready Task, then first ready Epic.
                let found = false;
                for (const epic of allEpics) {
                    const inProgressTask = epic.tasks.find(t => t.status === 'in-progress');
                    if (inProgressTask) {
                        targetEpic = epic;
                        targetTask = inProgressTask;
                        resolvedEpicId = epic.id;
                        resolvedTaskId = targetTask.id;
                        suggestionMessage = `Suggested item (in-progress Task): `;
                        targetItemDescription = `Task ${resolvedTaskId.substring(0,8)} in Epic ${resolvedEpicId.substring(0,8)}`;
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                     for (const epic of allEpics) {
                        // Simplified ready check: no dependencies or all done
                        const isEpicReady = !epic.dependencies || epic.dependencies.every(depId => getEpicById(depId)?.status === 'done');
                        const readyTask = epic.tasks.find(t => t.status === 'todo' && (!t.dependencies || t.dependencies.every(depId => getTaskById(depId)?.task.status === 'done' || getEpicById(depId)?.status === 'done'))); // Basic dependency check
                        
                        if (readyTask && isEpicReady) {
                            targetEpic = epic;
                            targetTask = readyTask;
                            resolvedEpicId = epic.id;
                            resolvedTaskId = targetTask.id;
                            suggestionMessage = `Suggested item (ready Task): `;
                            targetItemDescription = `Task ${resolvedTaskId.substring(0,8)} in Epic ${resolvedEpicId.substring(0,8)}`;
                            found = true;
                            break;
                        }
                    }
                }

                if (!found) {
                     targetEpic = allEpics.find(e => e.status === 'todo' && (!e.dependencies || e.dependencies.every(depId => getEpicById(depId)?.status === 'done')));
                     if (targetEpic) {
                         resolvedEpicId = targetEpic.id;
                         suggestionMessage = `Suggested item (ready Epic): `;
                         targetItemDescription = `Epic ${resolvedEpicId.substring(0,8)}`;
                         found = true;
                     } else {
                          return { content: [{ type: "text", text: `No ready Epics or Tasks found.` }] };
                     }
                }
            }
            
            // --- Execution Logic --- 

            if (!resolvedEpicId) { // Should have Epic at this point
                return { content: [{ type: "text", text: `Could not determine target Epic.` }], isError: true };
            }
            if (!targetEpic) targetEpic = getEpicById(resolvedEpicId); // Ensure targetEpic is set
            if (!targetEpic) return { content: [{ type: "text", text: `Target Epic ${resolvedEpicId} not found.` }], isError: true };

            let itemToExecute: Epic | Task = targetTask || targetEpic; // Prefer Task if available
            let itemType = targetTask ? "Task" : "Epic";

            // Mark as in-progress
            let markedInProgress = false;
            if (markInProgress && itemToExecute.status === 'todo') {
                itemToExecute.status = 'in-progress';
                itemToExecute.updatedAt = new Date().toISOString();
                if (targetTask && resolvedEpicId) {
                    // Need to update the Task within the Epic
                    const taskIndex = targetEpic.tasks.findIndex(t => t.id === resolvedTaskId);
                    if (taskIndex !== -1) {
                        targetEpic.tasks[taskIndex] = targetTask; // targetTask already has status updated
                        updateEpicStore(resolvedEpicId, targetEpic);
                        markedInProgress = true;
                    } 
                } else {
                     // Update the Epic directly
                     updateEpicStore(resolvedEpicId, targetEpic);
                     markedInProgress = true;
                }
                 if (markedInProgress) await saveEpics();
            }
            
            // Generate response based on execution mode etc.
            let responseText = suggestionMessage + `Executing ${itemType}: ${itemToExecute.id.substring(0,8)}\n\n`;
            responseText += `# ${itemToExecute.description.split('\n')[0]}\n\n`;
            responseText += `Status: ${itemToExecute.status}${markedInProgress ? ' (Marked In Progress)' : ''}\n`;
            if (additionalContext) responseText += `Context: ${additionalContext}\n`;
            
            // Simple guidance based on mode
            if (executionMode === 'auto') {
                responseText += `\nGuidance (auto): Review the details and proceed with implementation.`;
                if (targetTask && targetTask.subtasks.length > 0) {
                    responseText += ` Focus on completing its subtasks: ${targetTask.subtasks.map(s=>s.id.substring(0,4)).join(', ')}.`;
                } else if (itemType === "Epic" && targetEpic.tasks.length > 0) {
                     responseText += ` Focus on completing its Tasks: ${targetEpic.tasks.map(t=>t.id.substring(0,4)).join(', ')}.`;
                }
            } else if (executionMode === 'subtasks') {
                 if (targetTask && targetTask.subtasks.length > 0) {
                    responseText += `\nFocus on Subtasks:\n` + targetTask.subtasks.map(s => `- [${s.status==='done'?'x':' '}] ${s.description}`).join('\n');
                 } else {
                     responseText += `\nNo subtasks found for Task ${resolvedTaskId?.substring(0,8)}. Defaulting to manual guidance.`;
                     responseText += `\nGuidance (manual): Please review the ${itemType} details and proceed with the necessary steps.`;
                 }
            } else { // manual
                 responseText += `\nGuidance (manual): Please review the ${itemType} details and proceed with the necessary steps.`;
            }
            
            if (documentFindings) {
                 responseText += `\n\nRemember to document your findings and progress.`;
            }

            return { content: [{ type: "text", text: responseText }] };
        }
    );
} 