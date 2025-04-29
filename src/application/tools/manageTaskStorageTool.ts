import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import necessary functions/types...
import {
    getStoragePath,
    getTasksDir,
    getTaskDir,
    getTaskFilePath,
    saveTasks,
    getTasks
} from "../../infrastructure/storage/TaskStorageService.js";
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Task } from "../../types/TaskTypes.js";

const manageStorageActionSchema = z.enum([
    'getInfo', 
    'generateFiles'
]);

const manageStorageSchema = z.object({
    action: manageStorageActionSchema,
    outputDirectory: z.string().optional().default("tasks")
});

export function registerManageTaskStorageTool(server: McpServer): void {
    server.tool(
        "manageTaskStorage",
        "Manages task storage configuration and task file generation.",
        {
            action: manageStorageActionSchema.describe("Storage management action to perform (required)"),
            outputDirectory: z.string().optional().default("tasks").describe("Output directory for 'generateFiles'")
        },
        async (params: { action: string, [key: string]: any }) => {
            // Infer the correct type based on the known schema
            const safeParams = manageStorageSchema.parse(params);
            const { action, outputDirectory } = safeParams;

            try {
                switch (action) {
                    case 'getInfo':
                        const tasksDir = getTasksDir();
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Current task storage directory: ${tasksDir}`
                                }
                            ]
                        };

                    case 'generateFiles':
                        // Ensure outputDirectory is defined (it has a default)
                        const outDir = outputDirectory || "tasks"; 
                        
                        // Create the output directory if it doesn't exist
                        try {
                            await fs.mkdir(outDir, { recursive: true });
                        } catch (error: any) {
                            // Ignore if directory already exists (code EEXIST)
                            if (error.code !== 'EEXIST') {
                                throw error;
                            }
                        }

                        const tasks = getTasks();
                        if (tasks.length === 0) {
                            return { 
                                content: [{ type: "text", text: "No tasks found to generate files for." }]
                            };
                        }

                        // Write each task to its own file in the output directory
                        for (const task of tasks) {
                            const taskDir = path.join(outDir, task.id);
                            
                            // Create task directory
                            await fs.mkdir(taskDir, { recursive: true });
                            
                            // Write task data
                            await fs.writeFile(
                                path.join(taskDir, 'task.json'),
                                JSON.stringify(task, null, 2),
                                'utf-8'
                            );
                        }

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Generated task files for ${tasks.length} tasks in ${outDir}/`
                                }
                            ]
                        };

                    default:
                        return { 
                            content: [{ type: "text", text: `Unknown action: ${action}` }],
                            isError: true 
                        };
                }
            } catch (error: any) {
                return { 
                    content: [{ type: "text", text: `Error: ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
} 