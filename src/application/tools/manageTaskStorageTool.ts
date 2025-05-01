import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from 'fs/promises';
import * as path from 'path';
// Update imports for Epic storage
import { 
    configureStorage, 
    getStoragePath, 
    getBaseDir, 
    loadEpics, 
    saveEpics, // Keep saveEpics if generateFiles needs to ensure data is flushed
    getEpics,
    getEpicFolder // Needed to structure output
} from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Subtask, AssociatedFile } from "../../domain/task/entities/Task.js";

// Actions now relate to Epic storage management
const storageActionSchema = z.enum(['configure', 'getInfo', 'generateFiles']);

const manageTaskStorageSchema = z.object({
    action: storageActionSchema.describe("Storage action to perform (required)"),
    basePath: z.string().describe("FULL directory path for storage (required for all actions, e.g., '/path/to/storage')"),
    outputDirectory: z.string().optional().default('epic-exports').describe("FULL output directory path for generated files")
});

type ManageTaskStorageParams = z.infer<typeof manageTaskStorageSchema>;

// Helper to create Markdown content for an Epic
function epicToMarkdown(epic: Epic): string {
    let md = `# Epic: ${epic.description.split('\n')[0]} (ID: ${epic.id.substring(0,8)})\n\n`;
    md += `**Status**: ${epic.status} | **Priority**: ${epic.priority || 'N/A'} | **Complexity**: ${epic.complexity || 'N/A'}\n`;
    md += `**Created**: ${epic.createdAt} | **Updated**: ${epic.updatedAt}\n`;
    
    if (epic.description.includes('\n')) {
        md += `\n## Description\n${epic.description}\n`;
    }
    
    if (epic.implementationPlan) md += `\n## Implementation Plan\n${epic.implementationPlan}\n`;
    if (epic.testStrategy) md += `\n## Test Strategy\n${epic.testStrategy}\n`;

    if (epic.dependencies && epic.dependencies.length > 0) {
        md += `\n## Dependencies\n`;
        epic.dependencies.forEach(depId => { md += `- Depends on: ${depId}\n`; });
    }
    
    if (epic.files && epic.files.length > 0) {
        md += `\n## Files\n`;
        epic.files.forEach(file => { md += `- ${file.filePath}${file.description ? ': '+file.description : ''}\n`; });
    }

    if (epic.tasks && epic.tasks.length > 0) {
        md += `\n## Tasks (${epic.tasks.length})\n\n`;
        epic.tasks.forEach(task => {
            md += taskToMarkdown(task, 3); // Indent tasks with ###
        });
    }

    return md;
}

// Helper to create Markdown content for a Task (can be nested)
function taskToMarkdown(task: Task, headingLevel: number): string {
    const h = '#'.repeat(headingLevel);
    let md = `${h} Task: ${task.description.split('\n')[0]} (ID: ${task.id.substring(0,8)})\n\n`;
    md += `**Status**: ${task.status} | **Priority**: ${task.priority || 'N/A'} | **Complexity**: ${task.complexity || 'N/A'}\n`;
    md += `**Created**: ${task.createdAt} | **Updated**: ${task.updatedAt}\n`;
    
     if (task.description.includes('\n')) {
        md += `\n#### Description\n${task.description}\n`;
    }

    if (task.implementationPlan) md += `\n#### Implementation Plan\n${task.implementationPlan}\n`;
    if (task.testStrategy) md += `\n#### Test Strategy\n${task.testStrategy}\n`;
    
     if (task.dependencies && task.dependencies.length > 0) {
        md += `\n#### Dependencies\n`;
        task.dependencies.forEach(depId => { md += `- Depends on: ${depId}\n`; });
    }

    if (task.files && task.files.length > 0) {
        md += `\n#### Files\n`;
        task.files.forEach(file => { md += `- ${file.filePath}${file.description ? ': '+file.description : ''}\n`; });
    }
    
    if (task.subtasks && task.subtasks.length > 0) {
        md += `\n#### Subtasks (${task.subtasks.length})\n\n`;
        task.subtasks.forEach(subtask => {
            md += `- [${subtask.status === 'done' ? 'x' : ' '}] ${subtask.description} (ID: ${subtask.id.substring(0,8)})\n`;
        });
         md += `\n`;
    }

    return md;
}

export function registerManageTaskStorageTool(server: McpServer): void {
    server.tool(
        "manageItemStorage", // Renamed to reflect Epic focus
        "Manages storage configuration and export for Epics.",
        {
            action: storageActionSchema,
            basePath: z.string().describe("FULL directory path for storage (required for all actions, e.g., '/path/to/storage')"),
            outputDirectory: z.string().describe("FULL output directory path for generated files")
        },
        async (params: ManageTaskStorageParams) => {
            const { action, basePath, outputDirectory = 'epic-exports' } = params;

            if (!basePath) {
                 return { content: [{ type: "text", text: "Error: 'basePath' parameter is required." }], isError: true };
            }

            // Configure storage for all actions to ensure paths are set
            try {
                configureStorage(basePath);
            } catch (error: any) {
                return { 
                    content: [{ type: "text", text: `Error configuring storage path: ${error.message}` }], 
                    isError: true 
                };
            }

            try {
                switch (action) {
                    case 'configure':
                        // Configuration now happens implicitly via basePath. This action confirms it.
                         return { content: [{ type: "text", text: `Storage configured to use base path: ${basePath}\nEffective IntelliPlan directory: ${getBaseDir()}` }] };

                    case 'getInfo':
                        try {
                             await loadEpics(); // Ensure latest data is loaded
                             const epics = getEpics();
                             const storagePath = getStoragePath();
                             const baseDir = getBaseDir();
                             return { content: [{ 
                                type: "text", 
                                text: `Storage Info:\n- Base Path: ${basePath}\n- IntelliPlan Dir: ${baseDir}\n- Epics Dir: ${storagePath}\n- Loaded Epics: ${epics.length}` 
                            }] };
                         } catch (error: any) {
                             // Handle case where storage exists but epics.json might be missing/corrupt
                             if (error.code === 'ENOENT') {
                                 return { content: [{ type: "text", text: `Storage path configured at ${getStoragePath()}, but no epics found (epics.json missing or empty).` }] };
                             } else {
                                 throw error; // Re-throw other errors
                             }
                         }

                    case 'generateFiles':
                        await loadEpics(); // Ensure we have the data
                        const epicsToExport = getEpics();
                        if (epicsToExport.length === 0) {
                            return { content: [{ type: "text", text: "No Epics found to export." }] };
                        }
                        
                        const outputDir = path.join(basePath, outputDirectory);
                        await fs.mkdir(outputDir, { recursive: true });
                        
                        const writtenFiles: string[] = [];
                        for (const epic of epicsToExport) {
                            const markdownContent = epicToMarkdown(epic);
                            // Sanitize description for filename (basic example)
                            const safeDesc = epic.description.split('\n')[0].replace(/[^a-zA-Z0-9_\-\. ]/g, '').substring(0, 50);
                            const filename = `${epic.id.substring(0, 8)}_${safeDesc || 'epic'}.md`;
                            const filePath = path.join(outputDir, filename);
                            
                            try {
                                await fs.writeFile(filePath, markdownContent, 'utf-8');
                                writtenFiles.push(filename);
                            } catch (writeError: any) {
                                 return { 
                                    content: [{ type: "text", text: `Error writing file ${filename}: ${writeError.message}` }], 
                                    isError: true 
                                };
                            }
                        }
                        
                        return { content: [{ 
                            type: "text", 
                            text: `Generated ${writtenFiles.length} Epic markdown files in the '${outputDirectory}' directory (inside ${basePath}):\n\n${writtenFiles.map(f => `- ${f}`).join('\n')}` 
                        }] };

                    default:
                         return { content: [{ type: "text", text: `Unknown storage action: ${action}` }], isError: true };
                }
            } catch (error: any) {
                 return { 
                    content: [{ type: "text", text: `Error performing storage action '${action}': ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
} 