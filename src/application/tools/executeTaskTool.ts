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
    additionalContext: z.string().optional().describe("Additional context for execution"),
    documentFindings: z.boolean().optional().default(true).describe("Whether to document findings during execution (default: true)")
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
            additionalContext: z.string().optional().describe("Additional context for execution"),
            documentFindings: z.boolean().optional().default(true).describe("Whether to document findings during execution (default: true)")
        },
        async (params: ExecuteTaskParams) => {
            const { taskId, executionMode, markInProgress, additionalContext, documentFindings = true } = params;
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

            // Documentation framework section - applies to all execution modes
            const documentationGuidance = documentFindings ? `
## Documentation Framework

As you work through this task, document your findings, implementation details, and key decisions. This helps build knowledge for future tasks.

1. **Analysis & Exploration**
   - Note any files you explore and their purpose
   - Document key components or patterns discovered
   - Capture architectural insights 
   - Record any dependencies or integrations identified

2. **Implementation Details**
   - Document all files modified/created with rationale
   - Explain key implementation decisions
   - Note any patterns or techniques applied
   - Record any third-party libraries or tools used

3. **References & Code Integration**
   - Track file paths and relationships
   - Document how new code integrates with existing systems
   - Note any important code patterns to follow in future tasks

4. **Knowledge Transfer**
   - Summarize what you've learned that might help with future tasks
   - Highlight any challenging areas or lessons learned
   - Identify potential improvements for future work

Use the \`manageTask\` tool with action=update, taskId=${resolvedTaskId}, and details=[your documentation] to update the task with your findings.

` : '';

            // For subtasks execution mode
            if (executionMode === 'subtasks') {
                guidanceText += `# Subtask Execution for Task ${resolvedTaskId.substring(0, 8)}\n`;
                guidanceText += `**Task:** ${task.description.split('\n')[0]}\n\n`;
                
                if (documentFindings) {
                    guidanceText += documentationGuidance;
                }
                
                if (task.subtasks.length === 0) {
                    guidanceText += `Task ${resolvedTaskId.substring(0, 8)} has no subtasks to execute.`;
                } else {
                    const pendingSubtasks = task.subtasks.filter(subtask => subtask.status === 'todo');
                    if (pendingSubtasks.length === 0) {
                         guidanceText += `All subtasks for task ${resolvedTaskId.substring(0, 8)} are already completed.`;
                    } else {
                        guidanceText += `## Available Subtasks\n\n`;
                        const subtaskList = pendingSubtasks.map((subtask, index) => 
                            `${index + 1}. [${subtask.id.substring(0, 8)}] ${subtask.description}`
                        ).join('\n');
                        guidanceText += `${subtaskList}\n\n`;
                        guidanceText += `### Execution Workflow\n\n`;
                        guidanceText += `1. Review each subtask thoroughly\n`;
                        guidanceText += `2. For each subtask:\n`;
                        guidanceText += `   - Document your approach and findings\n`;
                        guidanceText += `   - Implement the required changes with careful documentation\n`;
                        guidanceText += `   - Document file paths and key code insights\n`;
                        guidanceText += `   - Mark complete with \`manageTask\` with action=updateSubtask, parentTaskId=${resolvedTaskId}, subtaskId=[ID], subtaskStatus=done\n\n`;
                        guidanceText += `3. After completing all subtasks:\n`;
                        guidanceText += `   - Compile a summary of implementation details and knowledge gained\n`;
                        guidanceText += `   - Update the task with these findings\n`;
                        guidanceText += `   - Mark the main task as complete\n\n`;
                    }
                }
            }
            // For manual mode, provide step-by-step instructions
            else if (executionMode === 'manual') {
                guidanceText += `# Manual Execution Plan for Task ${resolvedTaskId.substring(0, 8)}\n`;
                guidanceText += `**Task:** ${task.description.split('\n')[0]}\n\n`;
                
                if (documentFindings) {
                    guidanceText += documentationGuidance;
                }
                
                if (task.implementationPlan) guidanceText += `\n## Implementation Plan\n${task.implementationPlan}\n\n`;
                
                if (task.subtasks.length > 0) {
                    guidanceText += `## Execution Steps\n\n`;
                    task.subtasks.forEach((subtask, index) => {
                        guidanceText += `${index + 1}. ${subtask.description} [${subtask.status}]\n`;
                        if (subtask.status !== 'done') {
                            guidanceText += `   - **Approach**: Document your approach and key findings\n`;
                            guidanceText += `   - **Implementation**: Detail your implementation and file changes\n`;
                            guidanceText += `   - **References**: Note any important file paths or code references\n`;
                        }
                        guidanceText += `   - Update status: \`manageTask\` action=updateSubtask, parentTaskId=${resolvedTaskId}, subtaskId=${subtask.id}, subtaskStatus=done\n\n`;
                    });
                } else {
                    guidanceText += `\n## Execution Steps\n\n`;
                    guidanceText += `1. **Analyze the requirements**\n`;
                    guidanceText += `   - Thoroughly understand the task requirements\n`;
                    guidanceText += `   - Identify relevant files and code areas\n`;
                    guidanceText += `   - Document your initial analysis\n\n`;
                    guidanceText += `2. **Plan your implementation**\n`;
                    guidanceText += `   - Create a step-by-step implementation plan\n`;
                    guidanceText += `   - Identify potential challenges and solutions\n`;
                    guidanceText += `   - Document your implementation strategy\n\n`;
                    guidanceText += `3. **Execute the implementation**\n`;
                    guidanceText += `   - Make necessary code changes\n`;
                    guidanceText += `   - Document all files modified/created\n`;
                    guidanceText += `   - Record key implementation decisions\n\n`;
                }
                guidanceText += `When execution is complete, update the task with detailed documentation: \`manageTask\` action=update, taskId=${resolvedTaskId}, details=[your documentation]\n\n`;
                guidanceText += `Then mark the task as done: \`manageTask\` action=update, taskId=${resolvedTaskId}, status=done\n`;
            }
            // For auto mode (default)
            else { 
                guidanceText += `# Task Execution: ${task.description.split('\n')[0]}\n\n`;
                
                if (documentFindings) {
                    guidanceText += documentationGuidance;
                }
                
                if (additionalContext) {
                    guidanceText += `## Context\n\n${additionalContext}\n\n`;
                }
                
                guidanceText += `## Execution Workflow\n\n`;
                
                if (task.subtasks.length > 0) {
                    const todoSubtasks = task.subtasks.filter(st => st.status === 'todo');
                    if (todoSubtasks.length > 0) {
                        guidanceText += `### Execution Steps (${todoSubtasks.length})\n\n`;
                        todoSubtasks.forEach((subtask, index) => { 
                            guidanceText += `${index + 1}. ${subtask.description}\n`;
                            guidanceText += `   - Document your approach and findings\n`;
                            guidanceText += `   - Track all file paths and code references\n`;
                            guidanceText += `   - Mark complete with \`manageTask\` action=updateSubtask\n\n`;
                        });
                        
                        guidanceText += `### Completion Checklist\n\n`;
                        guidanceText += `1. **Subtask Completion**\n`;
                        guidanceText += `   - Complete each subtask, documenting as you go\n`;
                        guidanceText += `   - Mark each subtask done using \`manageTask\` action=updateSubtask\n\n`;
                        guidanceText += `2. **Documentation**\n`;
                        guidanceText += `   - Compile a comprehensive summary of all implementation details\n`;
                        guidanceText += `   - Document all files modified/created with explanation\n`;
                        guidanceText += `   - Note knowledge gained that will help with future tasks\n\n`;
                        guidanceText += `3. **Knowledge Transfer**\n`;
                        guidanceText += `   - Update the task with detailed documentation: \`manageTask\` action=update, taskId=${resolvedTaskId}, details=[your documentation]\n`;
                        guidanceText += `   - Highlight any insights that might help with dependent tasks\n\n`;
                    } else {
                        guidanceText += `All subtasks are already completed. You can now document your findings and mark the task as done.\n\n`;
                    }
                } else {
                    guidanceText += `1. **Analyze Requirements**\n`;
                    guidanceText += `   - Thoroughly understand the task requirements\n`;
                    guidanceText += `   - Identify relevant files and code areas\n`;
                    guidanceText += `   - Document your initial analysis\n\n`;
                    guidanceText += `2. **Explore and Document**\n`;
                    guidanceText += `   - Explore the codebase to understand relevant components\n`;
                    guidanceText += `   - Document your findings and key insights\n`;
                    guidanceText += `   - Identify patterns and architectural elements\n\n`;
                    guidanceText += `3. **Implement with Documentation**\n`;
                    guidanceText += `   - Make necessary code changes\n`;
                    guidanceText += `   - Document every file you modify or create\n`;
                    guidanceText += `   - Explain key implementation decisions\n\n`;
                    guidanceText += `4. **Comprehensive Documentation**\n`;
                    guidanceText += `   - Create a summary of all implementation details\n`;
                    guidanceText += `   - Document code patterns and file relationships\n`;
                    guidanceText += `   - Note knowledge that will help with future tasks\n\n`;
                }
                
                guidanceText += `When all steps are complete:\n`;
                guidanceText += `1. Update the task with detailed documentation: \`manageTask\` action=update, taskId=${resolvedTaskId}, details=[your documentation]\n`;
                guidanceText += `2. Mark the task as done: \`manageTask\` action=update, taskId=${resolvedTaskId}, status=done\n`;
            }
            
            return { content: [{ type: "text", text: guidanceText.trim() }] };
        }
    );
} 