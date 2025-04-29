import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import necessary functions/types...
import {
    configureStorage,
    toggleStorageVisibility,
    getStoragePath,
    isStorageHidden,
    saveTasks,
    getTasks
} from "../../infrastructure/storage/TaskStorageService.js";
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Task } from "../../types/TaskTypes.js";


const manageStorageActionSchema = z.enum([
    'configure', 
    'toggle', 
    'getInfo', 
    'generateFiles'
]);

export function registerManageTaskStorageTool(server: McpServer): void {
    server.tool(
        "manageTaskStorage",
        "Manages task storage configuration and task file generation.",
        {
            action: manageStorageActionSchema.describe("Storage management action to perform (required)"),
            hidden: z.boolean().optional().describe("Whether to use hidden storage (for 'configure')"),
            outputDirectory: z.string().optional().default("tasks").describe("Output directory for 'generateFiles'")
        },
        async (params: { action: string, [key: string]: any }) => {
            // Infer the correct type based on the known schema
            const safeParams = manageTaskStorageSchema.parse(params);
            const { action, hidden, outputDirectory } = safeParams;

            try {
                switch (action) {
                    case 'configure':
                        if (hidden === undefined) {
                            return { content: [{ type: "text", text: `Error: 'hidden' parameter (boolean) is required for action '${action}'.` }], isError: true };
                        }
                        const storagePath = configureStorage(hidden);
                        await saveTasks(); // Save tasks to the new location
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Task storage ${hidden ? 'hidden' : 'visible'} at ${storagePath}`
                                }
                            ]
                        };

                    case 'toggle':
                        const wasHidden = isStorageHidden();
                        const newPath = await toggleStorageVisibility(); // This implicitly saves
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Task storage changed from ${wasHidden ? 'hidden' : 'visible'} to ${!wasHidden ? 'hidden' : 'visible'} at ${newPath}`
                                }
                            ]
                        };

                    case 'getInfo':
                        const currentPath = getStoragePath();
                        const currentHidden = isStorageHidden();
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Current task storage: ${currentHidden ? 'Hidden' : 'Visible'} at ${currentPath}`
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

                        // Generate task files (logic from old generateTaskFiles tool)
                        const filePromises = tasks.map(async (task: Task) => {
                            const fileName = `task_${task.id.substring(0, 8)}.md`;
                            const filePath = path.join(outDir, fileName);
                            
                            let content = `# Task: ${task.description.split('\n')[0]}\n\n`;
                            content += `- ID: ${task.id}\n`;
                            content += `- Status: ${task.status}\n`;
                            content += `- Created: ${new Date(task.createdAt).toLocaleString()}\n`;
                            
                            if (task.priority) content += `- Priority: ${task.priority}\n`;
                            if (task.dependencies && task.dependencies.length > 0) content += `- Dependencies: ${task.dependencies.join(', ')}\n`;
                            if (task.complexity) content += `- Complexity: ${task.complexity}/10\n`;
                            
                            content += '\n## Details\n\n';
                            const descLines = task.description.split('\n');
                            if (descLines.length > 1) content += descLines.slice(1).join('\n').trim() + '\n\n';
                            
                            if (task.testStrategy) content += `## Test Strategy\n\n${task.testStrategy}\n\n`;
                            
                            if (task.subtasks && task.subtasks.length > 0) {
                                content += '## Subtasks\n\n';
                                task.subtasks.forEach(subtask => { content += `- [${subtask.status === 'done' ? 'x' : ' '}] ${subtask.description}\n`; });
                                content += '\n';
                            }
                            
                            if (task.files && task.files.length > 0) {
                                content += '## Related Files\n\n';
                                task.files.forEach(file => { content += `- ${file.filePath}${file.description ? `: ${file.description}` : ''}\n`; });
                                content += '\n';
                            }
                            
                            await fs.writeFile(filePath, content, 'utf8');
                            return fileName;
                        });
                        
                        const writtenFiles = await Promise.all(filePromises);
                        
                        return { 
                            content: [{ 
                                type: "text", 
                                text: `Generated ${writtenFiles.length} task files in the '${outDir}' directory:\n\n${writtenFiles.map(f => `- ${f}`).join('\n')}`
                            }]
                        };

                    default:
                        // Should not happen due to enum validation, but good practice
                        return { content: [{ type: "text", text: `Error: Unknown action '${action}'.` }], isError: true };
                }
            } catch (error: any) {
                 return { 
                    content: [{ type: "text", text: `Error performing action '${action}': ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
}

// Define the schema separately for clarity
const manageTaskStorageSchema = z.object({
    action: manageStorageActionSchema.describe("Storage management action to perform (required)"),
    hidden: z.boolean().optional().describe("Whether to use hidden storage (for 'configure')"),
    outputDirectory: z.string().optional().default("tasks").describe("Output directory for 'generateFiles'")
});

// Infer the parameter type from the schema
type ManageTaskStorageParams = z.infer<typeof manageTaskStorageSchema>; 