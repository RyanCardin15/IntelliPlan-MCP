import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskIdSchema } from "../schemas/commonSchemas.js";
// Import necessary functions/types...
import { 
    getTasks, 
    getTaskById, 
    updateTaskStore, 
    saveTasks 
} from "../../infrastructure/storage/TaskStorageService.js";
import type { Task } from "../../types/TaskTypes.js";

const executeTaskSchema = z.object({
    taskId: taskIdSchema.optional().describe("ID of the task to execute. If omitted, suggests the next task."),
    executionMode: z.enum(['auto', 'manual', 'subtasks']).optional().default('auto').describe("Execution mode (default: auto)"),
    markInProgress: z.boolean().optional().default(true).describe("Mark task in-progress on start (default: true)"),
    additionalContext: z.string().optional().describe("Additional context for execution")
});

type ExecuteTaskParams = z.infer<typeof executeTaskSchema>;

export function registerExecuteTaskTool(server: McpServer): void {
    server.tool(
        "executeTask",
        "Initiates or provides guidance for task execution.",
        {
            taskId: taskIdSchema.optional().describe("ID of the task to execute. If omitted, suggests the next task."),
            executionMode: z.enum(['auto', 'manual', 'subtasks']).optional().default('auto').describe("Execution mode (default: auto)"),
            markInProgress: z.boolean().optional().default(true).describe("Mark task in-progress on start (default: true)"),
            additionalContext: z.string().optional().describe("Additional context for execution")
        },
        async (params: ExecuteTaskParams) => {
            const { taskId, executionMode, markInProgress, additionalContext } = params;
            let resolvedTaskId = taskId;
            let suggestionMessage = "";

            // If taskId is not provided, find the next suitable task
            if (!resolvedTaskId) {
                const tasks = getTasks();
                if (tasks.length === 0) {
                    return { content: [{ type: "text", text: "No tasks found to suggest or execute." }] };
                }
                
                // Logic adapted from old suggestNextTask
                const inProgressTasks = tasks.filter(task => task.status === 'in-progress');
                const todoTasks = tasks.filter(task => task.status === 'todo');
                let nextTask: Task | undefined = undefined;
                
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                const sortTasks = (a: Task, b: Task) => {
                    const aPriority = a.priority ? priorityOrder[a.priority as keyof typeof priorityOrder] : 0;
                    const bPriority = b.priority ? priorityOrder[b.priority as keyof typeof priorityOrder] : 0;
                    if (aPriority !== bPriority) return bPriority - aPriority;
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                };

                if (inProgressTasks.length > 0) {
                    nextTask = [...inProgressTasks].sort(sortTasks)[0];
                    suggestionMessage = `Suggested task (in-progress): ${nextTask.id.substring(0, 8)}. `; 
                } else {
                    const availableTasks = todoTasks.filter(task => {
                        if (!task.dependencies || task.dependencies.length === 0) return true;
                        return task.dependencies.every(depId => {
                            const depTask = tasks.find(t => t.id === depId);
                            return depTask && depTask.status === 'done';
                        });
                    });
                    
                    if (availableTasks.length > 0) {
                        nextTask = [...availableTasks].sort(sortTasks)[0];
                        suggestionMessage = `Suggested next task (ready): ${nextTask.id.substring(0, 8)}. `; 
                    } else {
                        return { content: [{ type: "text", text: todoTasks.length > 0 ? "No tasks ready. All 'todo' tasks have unmet dependencies." : "No 'todo' tasks found." }] };
                    }
                }
                
                if (!nextTask) { // Should be caught above, but safety check
                     return { content: [{ type: "text", text: "Could not determine the next task to execute." }], isError: true };
                }
                resolvedTaskId = nextTask.id;
            }

            // --- Core execution logic (using resolvedTaskId) --- 
            const task = getTaskById(resolvedTaskId);
            if (!task) {
                return { content: [{ type: "text", text: `Error: Task ${resolvedTaskId} not found.` }], isError: true };
            }
            
            // Automatically mark as in-progress if requested
            let markedInProgress = false;
            if (markInProgress && task.status === 'todo') {
                const updatedTask = { 
                    ...task, 
                    status: 'in-progress' as 'todo' | 'in-progress' | 'done',
                    updatedAt: new Date().toISOString()
                };
                if (updateTaskStore(resolvedTaskId, updatedTask)) {
                     try {
                        await saveTasks();
                        markedInProgress = true;
                     } catch (saveError) {
                        // Removed console.error statement
                     }
                }
            }
            
            let guidanceText = suggestionMessage; // Start with suggestion message if any
            if (markedInProgress) {
                guidanceText += `Marked task ${resolvedTaskId.substring(0, 8)} as in-progress. `;
            }
            guidanceText += '\n\n';

            // For subtasks execution mode
            if (executionMode === 'subtasks') {
                if (task.subtasks.length === 0) {
                    guidanceText += `Task ${resolvedTaskId.substring(0, 8)} has no subtasks to execute.`;
                } else {
                    const pendingSubtasks = task.subtasks.filter(subtask => subtask.status === 'todo');
                    if (pendingSubtasks.length === 0) {
                         guidanceText += `All subtasks for task ${resolvedTaskId.substring(0, 8)} are already completed.`;
                    } else {
                        const subtaskList = pendingSubtasks.map((subtask, index) => 
                            `${index + 1}. [${subtask.id.substring(0, 8)}] ${subtask.description}`
                        ).join('\n');
                        guidanceText += `Ready to execute ${pendingSubtasks.length} subtasks for task ${resolvedTaskId.substring(0, 8)}:\n${subtaskList}\n\nTo mark a subtask as done, use: \`manageTask\` with action=updateSubtask, parentTaskId=${resolvedTaskId}, subtaskId=[ID], and subtaskStatus=done`;
                    }
                }
            }
            // For manual mode, provide step-by-step instructions
            else if (executionMode === 'manual') {
                guidanceText += `# Manual Execution Plan for Task ${resolvedTaskId.substring(0, 8)}\n`;
                guidanceText += `**Task:** ${task.description.split('\n')[0]}\n`;
                if (task.implementationPlan) guidanceText += `\n## Implementation Plan\n${task.implementationPlan}\n`;
                
                if (task.subtasks.length > 0) {
                    guidanceText += `\n## Execution Steps\n`;
                    task.subtasks.forEach((subtask, index) => {
                        guidanceText += `${index + 1}. ${subtask.description} [${subtask.status}]\n`;
                        guidanceText += `   - Update status: \`manageTask\` action=updateSubtask, parentTaskId=${resolvedTaskId}, subtaskId=${subtask.id}, subtaskStatus=done\n\n`;
                    });
                } else {
                    guidanceText += `\nNo detailed steps available. Please execute the task according to its description.\n`;
                }
                guidanceText += `\nWhen execution is complete, mark the task as done: \`manageTask\` action=update, taskId=${resolvedTaskId}, status=done\n`;
            }
            // For auto mode (default)
            else { 
                guidanceText += `Starting execution of task ${resolvedTaskId.substring(0, 8)}: ${task.description.split('\n')[0]}\n`;
                if (additionalContext) guidanceText += `\nContext: ${additionalContext}\n`;
                
                if (task.subtasks.length > 0) {
                    const todoSubtasks = task.subtasks.filter(st => st.status === 'todo');
                    if (todoSubtasks.length > 0) {
                        guidanceText += `\nExecution steps (${todoSubtasks.length}):\n`;
                        todoSubtasks.forEach((subtask, index) => { guidanceText += `${index + 1}. ${subtask.description}\n`; });
                        guidanceText += `\nExecute each step and mark as complete using \`manageTask\` action=updateSubtask.\n`;
                    } else {
                        guidanceText += `\nAll subtasks are already completed. You can now mark the task as done.\n`;
                    }
                } else {
                    guidanceText += `\nThis task has no predefined subtasks. Execute according to task description.\n`;
                }
                guidanceText += `\nWhen all steps are complete, mark task as done: \`manageTask\` action=update, taskId=${resolvedTaskId}, status=done\n`;
            }
            
            return { content: [{ type: "text", text: guidanceText.trim() }] };
        }
    );
} 