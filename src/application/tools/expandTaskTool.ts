import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { 
    descriptionSchema, 
    prioritySchema,
    taskIdSchema,
    subtaskIdSchema 
} from "../schemas/commonSchemas.js";
// Import necessary functions/types...
import { getTasks, getTaskById } from "../../infrastructure/storage/TaskStorageService.js";
import type { Task } from "../../types/TaskTypes.js";
// Example: import { v4 as uuidv4 } from 'uuid'; // Not needed if only generating prompts

const expandModeSchema = z.enum([
    'expandSpecificTask', 
    'expandSpecificSubtask', 
    'findExpandable'
]);

const expandTaskSchema = z.object({
    mode: expandModeSchema.describe("Expansion mode (required)"),
    taskId: taskIdSchema.optional().describe("Task ID (required for 'expandSpecificTask')"),
    subtaskId: subtaskIdSchema.optional().describe("Subtask ID (required for 'expandSpecificSubtask')"),
    count: z.number().optional().default(5).describe("Number of subtasks to suggest (for prompts)"),
    minSubtasks: z.number().optional().default(3).describe("Min subtasks threshold (for 'findExpandable')"),
    maxSubtasks: z.number().optional().default(5).describe("Max subtasks threshold (for 'findExpandable')"),
    // Keep batch parameters for expandSpecificTask mode
    batchIndex: z.number().optional().describe("Current task index in a batch expansion"),
    batchSize: z.number().optional().describe("Total number of tasks in the batch"),
    taskIds: z.array(taskIdSchema).optional().describe("List of task IDs in the batch")
});

type ExpandTaskParams = z.infer<typeof expandTaskSchema>;

export function registerExpandTaskTool(server: McpServer): void {
    server.tool(
        "expandTask",
        "Guides breakdown of tasks/subtasks or finds candidates for breakdown.",
        {
            mode: expandModeSchema.describe("Expansion mode (required)"),
            taskId: taskIdSchema.optional().describe("Task ID (for 'expandSpecificTask')"),
            subtaskId: subtaskIdSchema.optional().describe("Subtask ID (for 'expandSpecificSubtask')"),
            count: z.number().optional().default(5).describe("Number of subtasks to suggest (for prompts)"),
            minSubtasks: z.number().optional().default(3).describe("Min subtasks threshold (for 'findExpandable')"),
            maxSubtasks: z.number().optional().default(5).describe("Max subtasks threshold (for 'findExpandable')"),
            batchIndex: z.number().optional().describe("Current task index in a batch expansion"),
            batchSize: z.number().optional().describe("Total number of tasks in the batch"),
            taskIds: z.array(taskIdSchema).optional().describe("List of task IDs in the batch")
        },
        async (params: ExpandTaskParams) => {
            const { mode, taskId, subtaskId, count, minSubtasks, maxSubtasks, batchIndex, batchSize, taskIds } = params;

            try {
                switch (mode) {
                    case 'findExpandable': {
                        // Logic from old findExpandableTasks
                        const tasks = getTasks();
                        
                        // Filter tasks that are not done and meet subtask count criteria
                        const expandableTasks = tasks.filter(task => 
                            task.status !== 'done' &&
                            task.subtasks.length >= (minSubtasks ?? 3) && 
                            task.subtasks.length < (maxSubtasks ?? 5) // Use defaults if null
                        );
                        
                        if (expandableTasks.length === 0) {
                            return { content: [{ type: "text", text: `No tasks found that are not 'done' and have between ${minSubtasks ?? 3} and ${maxSubtasks ?? 5} subtasks.` }] };
                        }
                        
                        // Sort potentially by complexity or priority if desired, otherwise by creation date
                        const sortedTasks = [...expandableTasks].sort((a, b) => { 
                            const priorityOrder = { high: 3, medium: 2, low: 1 };
                            const aP = a.priority ? priorityOrder[a.priority as keyof typeof priorityOrder] : 0;
                            const bP = b.priority ? priorityOrder[b.priority as keyof typeof priorityOrder] : 0;
                            if(aP !== bP) return bP - aP;
                            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); 
                        });
                        
                        let response = `Found ${sortedTasks.length} tasks that could potentially benefit from further breakdown:
\n`;
                        sortedTasks.forEach((task, index) => {
                            response += `${index + 1}. Task ${task.id.substring(0, 8)}: (${task.status}, ${task.subtasks.length} subtasks${task.priority ? ", P:"+task.priority : ''})
`;
                            response += `   ${task.description.split('\n')[0]}\n\n`;
                        });
                        response += `To break down a task, use \`expandTask\` with mode=expandSpecificTask and the taskId.`;
                        return { content: [{ type: "text", text: response }] };
                    } // End case 'findExpandable'

                    case 'expandSpecificTask': {
                        // Handle batch processing first
                        if (taskIds && taskIds.length > 0 && batchIndex !== undefined && batchSize !== undefined) {
                             if (batchIndex < 0 || batchIndex >= taskIds.length) {
                                return { content: [{ type: "text", text: `Error: Invalid batch index ${batchIndex}. Must be between 0 and ${taskIds.length - 1}.` }], isError: true };
                            }
                            const currentTaskId = taskIds[batchIndex];
                            const task = getTaskById(currentTaskId);
                            if (!task) return { content: [{ type: "text", text: `Error: Task ${currentTaskId} (Batch ${batchIndex + 1}/${batchSize}) not found.` }], isError: true };
                            
                            let prompt = `Processing Batch Task ${batchIndex + 1} of ${batchSize}:
TASK ID: ${currentTaskId}\nDESCRIPTION: ${task.description.split('\n')[0]}\n`;
                            if (task.description.includes('\n')) prompt += `\nDETAILS:\n${task.description.split('\n').slice(1).join('\n').substring(0, 500)}...\n`;
                            prompt += `\nPlease break this task down into ${count ?? 5} specific, actionable subtasks. Format each as a single statement starting with an action verb.\n\n`;
                            prompt += `When ready, use \`manageTask\` action=createSubtask with parentTaskId=${currentTaskId} and subtasks=[...]\n\n`;
                            if (batchIndex < taskIds.length - 1) {
                                prompt += `Then, continue with the next task using:\n`;
                                prompt += `\`expandTask\` mode=expandSpecificTask, batchIndex=${batchIndex + 1}, batchSize=${batchSize}, taskIds=${JSON.stringify(taskIds)}`;
                            } else {
                                prompt += "This is the final task in the batch.";
                            }
                            return { content: [{ type: "text", text: prompt }] };
                        }
                        
                        // Handle single task expansion
                        if (!taskId) {
                            return { content: [{ type: "text", text: `Error: taskId is required for mode '${mode}' when not batch processing.` }], isError: true };
                        }
                        const task = getTaskById(taskId);
                        if (!task) return { content: [{ type: "text", text: `Error: Task ${taskId} not found.` }], isError: true };
                        
                        let prompt = `Please break down this task into ${count ?? 5} specific subtasks:\n\n`;
                        prompt += `TASK: ${task.description.split('\n')[0]}\n`;
                        if (task.description.includes('\n')) prompt += `\nDETAILS:\n${task.description.split('\n').slice(1).join('\n').substring(0, 500)}...\n`;
                        prompt += `\nProvide ${count ?? 5} specific, actionable subtasks that cover the scope. Format each as a single statement starting with an action verb.\n\n`;
                        prompt += `When ready, use \`manageTask\` action=createSubtask with parentTaskId=${taskId} and subtasks=[...] containing your list.`;
                        return { content: [{ type: "text", text: prompt }] };
                    } // End case 'expandSpecificTask'

                    case 'expandSpecificSubtask': {
                        if (!taskId || !subtaskId) {
                             return { content: [{ type: "text", text: `Error: taskId and subtaskId are required for mode '${mode}'.` }], isError: true };
                        }
                        const task = getTaskById(taskId);
                        if (!task) return { content: [{ type: "text", text: `Error: Parent Task ${taskId} not found.` }], isError: true };
                        
                        const subtaskToExpand = task.subtasks.find(st => st.id === subtaskId);
                        if (!subtaskToExpand) return { content: [{ type: "text", text: `Error: Subtask ${subtaskId} not found in task ${taskId}.` }], isError: true };
                        
                        let prompt = `Please break down this subtask into ${count ?? 5} smaller, more specific subtasks:\n\n`;
                        prompt += `PARENT TASK: ${task.description.split('\n')[0]}\n`;
                        prompt += `SUBTASK TO EXPAND: ${subtaskToExpand.description}\n\n`;
                        prompt += `Provide ${count ?? 5} specific, actionable subtasks.\n\n`;
                        prompt += `When ready, replace the old subtask with the new ones. You can do this by first deleting the old one:\n`;
                        prompt += `\`manageTask\` action=deleteSubtask, parentTaskId=${taskId}, subtaskId=${subtaskId}\n`;
                        prompt += `Then, add the new ones:\n`;
                        prompt += `\`manageTask\` action=createSubtask, parentTaskId=${taskId}, subtasks=[...]`;
                        return { content: [{ type: "text", text: prompt }] };
                    } // End case 'expandSpecificSubtask'

                    default:
                        return { content: [{ type: "text", text: `Error: Unknown mode '${mode}'.` }], isError: true };
                }
            } catch (error: any) {
                 return { 
                    content: [{ type: "text", text: `Error performing action '${mode}': ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
} 