import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import { descriptionSchema, prioritySchema } from "../schemas/commonSchemas.js";
import { configureStorage, saveEpics, loadEpics } from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Subtask, Priority, Status } from "../../domain/task/entities/Task.js";
import { FileEpicRepository } from "../../infrastructure/persistence/FileEpicRepository.js";
import { EpicService } from "../../domain/task/services/EpicService.js";

// Schema for a subtask in the request
const batchSubtaskSchema = z.object({
    description: descriptionSchema.describe("Description of the subtask"),
});

// Schema for a task in the request
const batchTaskSchema = z.object({
    description: descriptionSchema.describe("Description of the task"),
    priority: prioritySchema.optional().describe("Priority of the task (optional)"),
    complexity: z.number().min(1).max(10).optional().describe("Complexity score from 1-10 (optional)"),
    testStrategy: z.string().optional().describe("Test strategy for this task (optional)"),
    implementationPlan: z.string().optional().describe("Implementation plan for this task (optional)"),
    subtasks: z.array(batchSubtaskSchema).optional().describe("List of subtasks for this task (optional)"),
    dependencies: z.array(z.string()).optional().describe("IDs of other tasks this task depends on (optional)"),
});

// Schema for the epic creation request
const batchEpicSchema = z.object({
    description: descriptionSchema.describe("High-level description of the Epic"),
    priority: prioritySchema.optional().describe("Priority of the Epic (optional)"),
    complexity: z.number().min(1).max(10).optional().describe("Complexity score from 1-10 (optional)"),
    testStrategy: z.string().optional().describe("Overall test strategy for the Epic (optional)"),
    implementationPlan: z.string().optional().describe("Overall implementation plan for the Epic (optional)"),
    tasks: z.array(batchTaskSchema).describe("List of tasks for this Epic"),
    basePath: z.string().describe("Base directory path where Epic storage will be created (required)"),
});

type BatchEpicParams = z.infer<typeof batchEpicSchema>;

export function registerBatchEpicTool(server: McpServer): void {
    server.tool(
        "batchEpic",
        "Creates a complete Epic with multiple tasks, each potentially having multiple subtasks, in a single operation.",
        {
            description: descriptionSchema.describe("High-level description of the Epic"),
            priority: prioritySchema.optional().describe("Priority of the Epic (optional)"),
            complexity: z.number().min(1).max(10).optional().describe("Complexity score from 1-10 (optional)"),
            testStrategy: z.string().optional().describe("Overall test strategy for the Epic (optional)"),
            implementationPlan: z.string().optional().describe("Overall implementation plan for the Epic (optional)"),
            tasks: z.array(batchTaskSchema).describe("List of tasks for this Epic"),
            basePath: z.string().describe("Base directory path where Epic storage will be created (required)"),
        },
        async (params: BatchEpicParams) => {
            const {
                description,
                priority,
                complexity,
                testStrategy,
                implementationPlan,
                tasks,
                basePath,
            } = params;

            if (!basePath) {
                return {
                    content: [{ type: "text", text: "Error: 'basePath' parameter is required." }],
                    isError: true
                };
            }

            try {
                // Configure storage and load existing data
                const repo = new FileEpicRepository(basePath);
                await repo.loadEpics();
                const service = new EpicService(repo);

                // Create Epic
                const now = new Date().toISOString();
                
                // Create base epic object
                const newEpic: Epic = {
                    id: uuidv4(),
                    description,
                    status: 'todo',
                    priority,
                    complexity,
                    createdAt: now,
                    updatedAt: now,
                    testStrategy,
                    implementationPlan,
                    files: [],
                    tasks: [],
                    dependencies: []
                };

                // Create all tasks with their subtasks
                for (const taskData of tasks) {
                    const newTask: Task = {
                        id: uuidv4(),
                        description: taskData.description,
                        status: 'todo',
                        priority: taskData.priority,
                        complexity: taskData.complexity,
                        createdAt: now,
                        updatedAt: now,
                        testStrategy: taskData.testStrategy,
                        implementationPlan: taskData.implementationPlan,
                        files: [],
                        subtasks: [],
                        dependencies: taskData.dependencies || []
                    };

                    // Create subtasks if provided
                    if (taskData.subtasks && taskData.subtasks.length > 0) {
                        for (const subtaskData of taskData.subtasks) {
                            const newSubtask: Subtask = {
                                id: uuidv4(),
                                description: subtaskData.description,
                                status: 'todo',
                                createdAt: now
                            };
                            newTask.subtasks.push(newSubtask);
                        }
                    }

                    // Add task to epic
                    newEpic.tasks.push(newTask);
                }

                // Save the epic to repository
                repo.addEpic(newEpic);
                await service.saveAll();

                // Prepare summary of what was created
                const taskCount = newEpic.tasks.length;
                const subtaskCount = newEpic.tasks.reduce(
                    (total, task) => total + (task.subtasks ? task.subtasks.length : 0), 0
                );

                return {
                    content: [{ 
                        type: "text", 
                        text: `✅ Epic created with ID: ${newEpic.id}\n${taskCount} tasks and ${subtaskCount} subtasks created.`
                    }],
                    metadata: {
                        epicId: newEpic.id,
                        taskCount,
                        subtaskCount
                    }
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error creating Epic: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
} 