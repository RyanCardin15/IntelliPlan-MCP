import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { descriptionSchema, prioritySchema } from "../schemas/commonSchemas.js";
// Import necessary functions/types...
import { 
    addTask, 
    saveTasks, 
    configureStorage,
    loadTasks
} from "../../infrastructure/storage/TaskStorageService.js";
import { v4 as uuidv4 } from 'uuid';
import type { Task, Subtask } from "../../types/TaskTypes.js";

const createTaskSchema = z.object({
    description: descriptionSchema.describe("High-level description of the task (required)"),
    goal: z.string().optional().describe("Specific goal or objective"),
    steps: z.array(z.string()).optional().describe("Steps (become subtasks if createSubtasks=true)"),
    acceptanceCriteria: z.array(z.string()).optional().describe("Acceptance criteria"),
    estimatedEffort: z.string().optional().describe("Estimated effort (e.g., S, M, L)"),
    priority: prioritySchema,
    testStrategy: z.string().optional().describe("Testing strategy"),
    createSubtasks: z.boolean().optional().default(true).describe("Create subtasks from steps (default: true)"),
    autoExpandSubtasks: z.boolean().optional().default(false).describe("Attempt to auto-expand complex subtasks after creation (experimental)"),
    basePath: z.string().describe("Base directory path where task storage will be created (required)")
});

type CreateTaskParams = z.infer<typeof createTaskSchema>;

export function registerCreateTaskTool(server: McpServer): void {
    server.tool(
        "createTask",
        "Creates a new task with planning details and optional subtask creation/expansion.",
        {
            description: descriptionSchema.describe("High-level description of the task (required)"),
            goal: z.string().optional().describe("Specific goal or objective"),
            steps: z.array(z.string()).optional().describe("Steps (become subtasks if createSubtasks=true)"),
            acceptanceCriteria: z.array(z.string()).optional().describe("Acceptance criteria"),
            estimatedEffort: z.string().optional().describe("Estimated effort (e.g., S, M, L)"),
            priority: prioritySchema,
            testStrategy: z.string().optional().describe("Testing strategy"),
            createSubtasks: z.boolean().optional().default(true).describe("Create subtasks from steps (default: true)"),
            autoExpandSubtasks: z.boolean().optional().default(false).describe("Attempt to auto-expand complex subtasks after creation (experimental)"),
            basePath: z.string().describe("Base directory path where task storage will be created (required)")
        },
        async (params: CreateTaskParams) => {
            // Validate and get parameters using the inferred type
            const { 
                description, 
                goal, 
                steps, 
                acceptanceCriteria, 
                estimatedEffort, 
                priority, 
                testStrategy,
                createSubtasks = steps ? true : false, // Default based on steps
                autoExpandSubtasks,
                basePath
            } = params;

            // Require basePath parameter
            if (!basePath) {
                return { 
                    content: [{ 
                        type: "text", 
                        text: "Error: 'basePath' parameter is required for all task operations." 
                    }], 
                    isError: true 
                };
            }

            // Configure task storage with the provided path
            try {
                // Configure storage with the provided basePath
                configureStorage(basePath);
                // Load existing tasks if any
                await loadTasks();
            } catch (error: any) {
                return { 
                    content: [{ 
                        type: "text", 
                        text: `Error configuring task storage: ${error.message}` 
                    }], 
                    isError: true 
                };
            }

            const taskId = uuidv4();
            const now = new Date().toISOString();
            
            // Format description (same as old createTask)
            let finalDescription = description;
            if (goal || steps || acceptanceCriteria || estimatedEffort || testStrategy) {
                const sections = [
                    `# ${description}`,
                    goal ? `## Goal\n${goal}` : null, 
                    steps ? `## Steps\n${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}` : null,
                    acceptanceCriteria ? `## Acceptance Criteria\n${acceptanceCriteria.map((c) => `- ${c}`).join('\n')}` : null,
                    estimatedEffort ? `## Estimated Effort\n${estimatedEffort}` : null,
                    testStrategy ? `## Test Strategy\n${testStrategy}` : null
                ].filter(Boolean);
                finalDescription = sections.join('\n\n');
            }
            
            // Create subtasks if steps are provided and createSubtasks is true
            let initialSubtasks: Subtask[] = [];
            if (createSubtasks && steps && steps.length > 0) { 
                initialSubtasks = steps.map(step => ({
                    id: uuidv4(),
                    description: step,
                    status: 'todo', 
                    createdAt: now
                }));
            }
            
            const newTask: Task = {
                id: taskId,
                description: finalDescription,
                status: 'todo',
                createdAt: now,
                updatedAt: now,
                files: [],
                subtasks: initialSubtasks, // Start with initial subtasks
                priority: priority,
                testStrategy: testStrategy,
                // implementationPlan: undefined, // Assuming not set at creation
                // complexity: undefined, // Assuming not set at creation
                // dependencies: [], // Assuming not set at creation
            };
            
            // Auto-expand complex subtasks if requested
            if (autoExpandSubtasks && newTask.subtasks.length > 0) {
                // Not implemented yet - future feature
            }

            // Add task to store
            const added = addTask(newTask);
            if (!added) {
                return { 
                    content: [{ type: "text", text: `Error creating task in memory. Please try again.` }],
                    isError: true
                };
            }
            
            // Save tasks to persistent storage
            try {
                await saveTasks();
                
                let responseText = `Task created with ID: ${taskId}`; 
                if (newTask.subtasks.length > 0) {
                    responseText += `\n${newTask.subtasks.length} subtasks added.`;
                    if (autoExpandSubtasks) {
                         responseText += ` (Auto-expansion requested but not yet fully implemented).`;
                    }
                } 
                if (priority) responseText += ` Priority: ${priority}.`;
                
                return { content: [{ type: "text", text: responseText }] };

            } catch (error: any) {
                 return { 
                    content: [{ type: "text", text: `Task created (ID: ${taskId}) but could not be saved permanently: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
} 