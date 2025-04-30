import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { descriptionSchema, prioritySchema } from "../schemas/commonSchemas.js";
import { EpicService } from "../../domain/task/services/EpicService.js";
import { FileEpicRepository } from "../../infrastructure/persistence/FileEpicRepository.js";
import { configureStorage, saveEpics, loadEpics } from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Priority, Status } from "../../domain/task/entities/Task.js";

const createEpicSchema = z.object({
    description: descriptionSchema.describe("High-level description of the Epic (required)"),
    goal: z.string().optional().describe("Specific goal or objective for the Epic"),
    tasks: z.array(z.string()).optional().describe("Initial high-level tasks (become Task items)"),
    acceptanceCriteria: z.array(z.string()).optional().describe("Acceptance criteria for the Epic"),
    estimatedEffort: z.string().optional().describe("Estimated effort for the Epic (e.g., S, M, L)"),
    priority: prioritySchema.optional(), // Make priority optional for Epic creation
    testStrategy: z.string().optional().describe("Overall testing strategy for the Epic"),
    createTasksFromSteps: z.boolean().optional().default(true).describe("Create Tasks from the 'tasks' list (default: true)"),
    basePath: z.string().describe("Base directory path where Epic storage will be created (required)"),
    complexity: z.string().optional().describe("Complexity of the Epic"),
});

type CreateEpicParams = z.infer<typeof createEpicSchema>;

export function registerCreateEpicTool(server: McpServer): void {
    server.tool(
        "createEpic", // Renamed tool
        "Creates a new Epic (top-level task) with planning details and optional initial Task creation.",
        {
            // Updated schema fields
            description: descriptionSchema.describe("High-level description of the Epic (required)"),
            goal: z.string().optional().describe("Specific goal or objective for the Epic"),
            tasks: z.array(z.string()).optional().describe("Initial high-level tasks (become Task items)"),
            acceptanceCriteria: z.array(z.string()).optional().describe("Acceptance criteria for the Epic"),
            estimatedEffort: z.string().optional().describe("Estimated effort for the Epic (e.g., S, M, L)"),
            priority: prioritySchema.optional(),
            testStrategy: z.string().optional().describe("Overall testing strategy for the Epic"),
            createTasksFromSteps: z.boolean().optional().default(true).describe("Create Tasks from the 'tasks' list (default: true)"),
            basePath: z.string().describe("Base directory path where Epic storage will be created (required)"),
            complexity: z.string().optional().describe("Complexity of the Epic"),
        },
        async (params: CreateEpicParams) => {
            const { 
                description, 
                goal, 
                tasks: taskDescriptions, // Renamed from steps
                acceptanceCriteria, 
                estimatedEffort, 
                priority, 
                testStrategy,
                createTasksFromSteps = taskDescriptions ? true : false, // Default based on tasks
                basePath,
                complexity,
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
                // Load epics directly from the repository first
                await repo.loadEpics();
                // Now create the service with the loaded repository
                const service = new EpicService(repo);
                
                // Use EpicService to create the Epic
                const newEpic = service.createEpic({
                    description,
                    priority,
                    // Complexity is not part of the service createEpic method
                    // complexity,
                    // Add any other relevant fields from params here
                });
                
                if (!newEpic) {
                    throw new Error("Failed to create epic using service.");
                }

                // Save changes via the service
                await service.saveAll();

                return { content: [{ type: "text", text: `✅ Epic created with ID: ${newEpic.id}` }] };
            } catch (error: any) {
                return { content: [{ type: "text", text: `Error creating Epic: ${error.message}` }], isError: true };
            }
        }
    );
} 