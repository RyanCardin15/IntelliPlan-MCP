import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { 
    descriptionSchema, 
    prioritySchema,
    taskIdSchema,
    subtaskIdSchema 
} from "../schemas/commonSchemas.js";
// Import necessary functions/types...
import { getEpics, getEpicById, getTaskById, getSubtaskById, updateEpicStore, saveEpics, configureStorage, loadEpics } from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Subtask } from "../../domain/task/entities/Task.js"; // Assuming types are now here
// Example: import { v4 as uuidv4 } from 'uuid'; // Not needed if only generating prompts

const expandModeSchema = z.enum([
    'expandSpecificTask', 
    'expandSpecificSubtask', 
    'findExpandable'
]);

const epicIdSchema = z.string().uuid().optional().describe("ID of the Epic containing the Task/Subtask (optional, will try to find task otherwise)");
const taskIdSchemaRevised = z.string().uuid().optional().describe("ID of the Task to expand (optional, suggests first expandable)");
const subtaskIdSchemaRevised = z.string().uuid().optional().describe("ID of the Subtask to expand (optional, within the specified task)");

const expandTaskSchema = z.object({
    mode: expandModeSchema.describe("Expansion mode (required)"),
    epicId: epicIdSchema,
    taskId: taskIdSchemaRevised,
    subtaskId: subtaskIdSchemaRevised,
    count: z.number().optional().default(5).describe("Number of subtasks to suggest (for prompts)"),
    minSubtasks: z.number().optional().default(3).describe("Min subtasks threshold (for 'findExpandable')"),
    maxSubtasks: z.number().optional().default(5).describe("Max subtasks threshold (for 'findExpandable')"),
    // Keep batch parameters for expandSpecificTask mode
    batchIndex: z.number().optional().describe("Current task index in a batch expansion"),
    batchSize: z.number().optional().describe("Total number of tasks in the batch"),
    taskIds: z.array(taskIdSchema).optional().describe("List of task IDs in the batch"),
    instructions: z.string().default("Break down the item into smaller, actionable sub-items (subtasks for a task, tasks for an epic).").describe("Specific instructions for expansion"),
    basePath: z.string().describe("FULL directory path for storage (required, e.g., '/path/to/storage')")
});

type ExpandTaskParams = z.infer<typeof expandTaskSchema>;

export function registerExpandTaskTool(server: McpServer): void {
    server.tool(
        "expandItem",
        "Helps break down an Epic, Task, or Subtask into smaller items.",
        {
            mode: expandModeSchema.describe("Expansion mode (required)"),
            epicId: epicIdSchema,
            taskId: taskIdSchemaRevised,
            subtaskId: subtaskIdSchemaRevised,
            count: z.number().optional().default(5).describe("Number of subtasks to suggest (for prompts)"),
            minSubtasks: z.number().optional().default(3).describe("Min subtasks threshold (for 'findExpandable')"),
            maxSubtasks: z.number().optional().default(5).describe("Max subtasks threshold (for 'findExpandable')"),
            batchIndex: z.number().optional().describe("Current task index in a batch expansion"),
            batchSize: z.number().optional().describe("Total number of tasks in the batch"),
            taskIds: z.array(taskIdSchema).optional().describe("List of task IDs in the batch"),
            instructions: z.string(),
            basePath: z.string().describe("FULL directory path for storage (required, e.g., '/path/to/storage')")
        },
        async (params: ExpandTaskParams) => {
            const { 
                mode, 
                epicId, 
                taskId, 
                subtaskId,
                count, 
                minSubtasks, 
                maxSubtasks,
                batchIndex, 
                batchSize, 
                taskIds,
                instructions = "Break down the item into smaller, actionable sub-items (subtasks for a task, tasks for an epic).", 
                basePath 
            } = params;
            
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
            let currentTaskId = taskId; // Keep track of the final target task ID
            let targetItemType: string = "Task"; // Default assumption

            // --- Determine Target Item --- 
            if (currentTaskId) {
                const result = getTaskById(currentTaskId);
                if (result) {
                    targetEpic = result.epic;
                    targetTask = result.task;
                    // If epicId was provided, verify it matches
                    if (epicId && targetEpic.id !== epicId) {
                         return { content: [{ type: "text", text: `Error: Task ${currentTaskId} found, but not within specified Epic ${epicId}.` }], isError: true };
                    }
                } else {
                    // Try finding the epic if only task ID was given but not found directly
                    if (!epicId) {
                         return { content: [{ type: "text", text: `Error: Task ${currentTaskId} not found. Specify epicId if known.` }], isError: true };
                    } 
                }
                // If task wasn't found via getTaskById but epicId *was* provided
                if (!targetTask && epicId) {
                     targetEpic = getEpicById(epicId);
                     if (targetEpic) {
                         targetTask = targetEpic.tasks.find(t => t.id === currentTaskId);
                     }
                }
                 if (!targetEpic || !targetTask) {
                    return { content: [{ type: "text", text: `Error: Could not find Task ${currentTaskId}. Specify epicId if known.` }], isError: true };
                }
                targetItemType = subtaskId ? "Subtask" : "Task"; // Refine type if subtaskId exists

            } else if (epicId && !taskId) {
                 // Expand an Epic
                 targetEpic = getEpicById(epicId);
                 if (!targetEpic) {
                     return { content: [{ type: "text", text: `Error: Epic ${epicId} not found.` }], isError: true };
                 }
                 targetItemType = "Epic";
                 targetTask = undefined; // Explicitly undefined when expanding an Epic

            } else {
                // Find the first expandable task across all epics if no ID provided
                const allEpics = getEpics();
                let found = false;
                for (const epic of allEpics) {
                    // Find a task suitable for expansion
                    const expandableTask = epic.tasks.find(t => 
                        t.status !== 'done' && // Not already done
                        (!t.implementationPlan || t.implementationPlan.length < 50) && // Basic check for missing/short plan
                        (!t.subtasks || t.subtasks.length === 0) // No subtasks yet
                    );
                    if (expandableTask) {
                        targetEpic = epic;
                        targetTask = expandableTask;
                        currentTaskId = targetTask.id; // Set the target ID
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    // If no task, maybe suggest an Epic?
                    targetEpic = allEpics.find(e => 
                        e.status !== 'done' && 
                        (!e.implementationPlan || e.implementationPlan.length < 50) &&
                        (!e.tasks || e.tasks.length === 0)
                    );
                    if (targetEpic) {
                        targetItemType = "Epic";
                        targetTask = undefined; // Explicitly undefined
                        suggestionMessage = `Suggested Epic to expand: ${targetEpic.id.substring(0,8)}. `; 
                        found = true;
                    } else {
                         return { content: [{ type: "text", text: `No suitable Task or Epic found to expand automatically.` }] };
                    }
                } else {
                    suggestionMessage = `Suggested Task to expand: ${currentTaskId?.substring(0,8)} in Epic ${targetEpic?.id.substring(0,8)}. `; 
                    targetItemType = "Task";
                }
            }
            
            if (!targetEpic) {
                 return { content: [{ type: "text", text: `Error: Could not determine target Epic.` }], isError: true };
            }

            // --- Build Prompt --- 
            let prompt = suggestionMessage + `Expand the following ${targetItemType}:\n\n`;
            prompt += `BASE PATH: ${basePath}\n`;
            prompt += `EPIC ID: ${targetEpic.id}\n`;

            if (targetTask) {
                prompt += `TASK ID: ${targetTask.id}\nDESCRIPTION: ${targetTask.description.split('\n')[0]}\n`;
                if (targetTask.description.includes('\n')) prompt += `\nDETAILS:\n${targetTask.description.split('\n').slice(1).join('\n').substring(0, 500)}...\n`;
                if (targetTask.implementationPlan) prompt += `\nCURRENT PLAN:\n${targetTask.implementationPlan}\n`;
                if (targetTask.complexity) prompt += `\nCOMPLEXITY: ${targetTask.complexity}\n`;
                
                // Include Subtask context if expanding a Subtask
                let targetSubtask: Subtask | undefined;
                if (subtaskId && targetTask.subtasks) {
                    targetSubtask = targetTask.subtasks.find(st => st.id === subtaskId);
                    if (targetSubtask) {
                        prompt += `\n-- Expanding Subtask --\nSUBTASK ID: ${targetSubtask.id}\nSUBTASK DESC: ${targetSubtask.description}\n`;
                    } else {
                         prompt += `\nWARNING: Subtask ${subtaskId} not found in Task ${targetTask.id}. Expanding Task instead.\n`;
                    }
                } else if (targetTask.subtasks && targetTask.subtasks.length > 0) {
                     prompt += `\n-- Existing Subtasks --\n` + targetTask.subtasks.map((st, i) => `${i+1}. ${st.description} [${st.status}]`).join('\n') + '\n';
                }
                
            } else { // Expanding an Epic
                prompt += `EPIC DESC: ${targetEpic.description.split('\n')[0]}\n`;
                if (targetEpic.description.includes('\n')) prompt += `\nDETAILS:\n${targetEpic.description.split('\n').slice(1).join('\n').substring(0, 500)}...\n`;
                if (targetEpic.implementationPlan) prompt += `\nCURRENT PLAN:\n${targetEpic.implementationPlan}\n`;
                if (targetEpic.complexity) prompt += `\nCOMPLEXITY: ${targetEpic.complexity}\n`;
                 if (targetEpic.tasks && targetEpic.tasks.length > 0) {
                     prompt += `\n-- Existing Tasks --\n` + targetEpic.tasks.map((t, i) => `${i+1}. ${t.description.split('\n')[0]} [${t.status}]`).join('\n') + '\n';
                }
            }

            prompt += `\nInstructions: ${instructions}`;
            prompt += `\n\nGoal: Generate a list of actionable sub-items (Tasks for an Epic, Subtasks for a Task/Subtask) to achieve the goal described above.`;

            return { 
                content: [{ 
                    type: "text", 
                    text: prompt 
                }],
                // Return metadata about the item being expanded?
                metadata: { 
                    epicId: targetEpic.id,
                    taskId: targetTask?.id,
                    subtaskId: subtaskId, 
                    itemType: targetItemType
                } 
            };
        }
    );
} 