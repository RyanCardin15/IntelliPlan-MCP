import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from 'fs/promises';
import * as path from 'path';

// Import schemas
import { configureStorage, loadEpics, getEpics, getEpicById, getTaskById, getEpicFolder } from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Subtask, AssociatedFile, Status } from "../../domain/task/entities/Task.js";

// Define Epic ID schema
const epicIdSchema = z.string().uuid().describe("ID of the Epic to get overview for");

/**
 * Find tasks that depend on a given task or epic
 */
function findDependentItems(itemId: string, allEpics: Epic[]): { epicDependents: Epic[], taskDependents: { epic: Epic, task: Task }[] } {
    const epicDependents: Epic[] = [];
    const taskDependents: { epic: Epic, task: Task }[] = [];
    
    // Check all epics and tasks for dependencies on the given item
    for (const epic of allEpics) {
        // Check if epic depends on our item
        if (epic.dependencies?.includes(itemId)) {
            epicDependents.push(epic);
        }
        
        // Check if any tasks in this epic depend on our item
        for (const task of epic.tasks) {
            if (task.dependencies?.includes(itemId)) {
                taskDependents.push({ epic, task });
            }
        }
    }
    
    return { epicDependents, taskDependents };
}

/**
 * Calculate completion percentage of an epic based on task completion
 */
function calculateEpicCompletion(epic: Epic): { completedTasks: number, totalTasks: number, completedSubtasks: number, totalSubtasks: number, percentage: number } {
    const totalTasks = epic.tasks.length;
    const completedTasks = epic.tasks.filter(t => t.status === 'done').length;
    
    let totalSubtasks = 0;
    let completedSubtasks = 0;
    
    for (const task of epic.tasks) {
        if (task.subtasks) {
            totalSubtasks += task.subtasks.length;
            completedSubtasks += task.subtasks.filter(st => st.status === 'done').length;
        }
    }
    
    // Calculate overall percentage (weighted more towards tasks than subtasks)
    const taskWeight = 0.7;
    const subtaskWeight = 0.3;
    
    let percentage = 0;
    if (totalTasks > 0) {
        const taskPercentage = (completedTasks / totalTasks) * 100;
        const subtaskPercentage = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 100;
        percentage = (taskPercentage * taskWeight) + (subtaskPercentage * subtaskWeight);
    }
    
    return {
        completedTasks,
        totalTasks,
        completedSubtasks,
        totalSubtasks,
        percentage: Math.round(percentage)
    };
}

/**
 * Get a progress bar string based on percentage
 */
function getProgressBar(percentage: number, length: number = 20): string {
    const filledLength = Math.round((percentage * length) / 100);
    const emptyLength = length - filledLength;
    
    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);
    
    return `${filled}${empty} ${percentage}%`;
}

/**
 * Get status emoji for visual representation
 */
function getStatusEmoji(status: Status): string {
    switch (status) {
        case 'done': return '✅';
        case 'in-progress': return '🚧';
        case 'todo': return '⏳';
        default: return '❓';
    }
}

/**
 * Get task status display with checkbox and emoji
 */
function getTaskStatusDisplay(status: Status): string {
    const checkbox = status === 'done' ? '[x]' : '[ ]';
    return `${checkbox} ${getStatusEmoji(status)}`;
}

/**
 * Get priority emoji for visual representation
 */
function getPriorityEmoji(priority?: string): string {
    if (!priority) return '';
    
    switch (priority) {
        case 'high': return '🔴';
        case 'medium': return '🟠';
        case 'low': return '🟢';
        default: return '';
    }
}

const getOverviewModeSchema = z.enum([
    'fullOverview', 
    'suggestNext', 
    'verify'
]);

// Define supported diagram types as a string enum
const DiagramType = {
    PROGRESS_PIE: 'progressPie',
    DEPENDENCY_GRAPH: 'dependencyGraph',
    TASK_FLOW: 'taskFlow',
    TIMELINE: 'timeline',
    USER_JOURNEY: 'userJourney',
    BLOCK_DIAGRAM: 'blockDiagram',
    RADAR_CHART: 'radarChart',
    KANBAN_BOARD: 'kanbanBoard',
    SEQUENCE_DIAGRAM: 'sequenceDiagram',
    CLASS_DIAGRAM: 'classDiagram'
} as const;

type DiagramTypeValues = typeof DiagramType[keyof typeof DiagramType];

// Helper function to get all diagram types
function getAllDiagramTypes(): DiagramTypeValues[] {
    return Object.values(DiagramType);
}

// Define the schema for the epic overview tool
const getEpicOverviewSchema = z.object({
    mode: getOverviewModeSchema.default('fullOverview').describe("Information mode (required)"),
    epicId: epicIdSchema.optional().describe("Epic ID (required for 'fullOverview', 'verify')"),
    verbosity: z.enum(['summary', 'detailed', 'full']).optional().default('detailed').describe("Level of detail for 'fullOverview'"),
    includeDiagrams: z.boolean().optional().default(true).describe("Include Mermaid diagrams (for 'fullOverview')"),
    diagramTypes: z.array(z.string()).optional().describe("Specific diagram types to include (if empty and includeDiagrams=true, includes all)"),
    basePath: z.string().describe("Base directory path for storage (required)")
});

// Infer the parameter type from the schema
type GetEpicOverviewParams = z.infer<typeof getEpicOverviewSchema>;

export function registerGetEpicOverviewTool(server: McpServer): void {
    server.tool(
        "getEpicOverview",
        "Provides a detailed, easy-to-read overview of an Epic, its tasks, and related information.",
        {
            mode: getOverviewModeSchema.default('fullOverview').describe("Information mode (required)"),
            epicId: epicIdSchema.optional().describe("Epic ID (required for 'fullOverview', 'verify')"),
            verbosity: z.enum(['summary', 'detailed', 'full']).optional().default('detailed').describe("Level of detail for 'fullOverview'"),
            includeDiagrams: z.boolean().optional().default(true).describe("Include Mermaid diagrams (for 'fullOverview')"),
            diagramTypes: z.array(z.string()).optional().describe("Specific diagram types to include (if empty and includeDiagrams=true, includes all)"),
            basePath: z.string().describe("Base directory path for storage (required)")
        },
        async (params: GetEpicOverviewParams) => {
            const { 
                mode, 
                epicId, 
                verbosity = 'detailed', 
                includeDiagrams = true, 
                diagramTypes = [],
                basePath 
            } = params;

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

            try {
                switch (mode) {
                    case 'fullOverview': {
                        if (!epicId) {
                            return { content: [{ type: "text", text: "epicId is required for fullOverview mode" }], isError: true };
                        }

                        const epic = getEpicById(epicId);
                        if (!epic) {
                            return { content: [{ type: "text", text: `Epic with ID ${epicId} not found` }], isError: true };
                        }

                        // Get all epics for dependency checks
                        const allEpics = getEpics();
                        const completion = calculateEpicCompletion(epic);
                        
                        // Begin building the overview
                        let output = `# 📊 Epic Overview: ${epic.description.split('\n')[0]}\n\n`;
                        
                        // Add timestamp of when this overview was generated
                        output += `> Generated on: ${new Date().toLocaleString()}\n\n`;
                        
                        // Status and progress section
                        output += `## Status and Progress\n\n`;
                        output += `**Status**: ${getStatusEmoji(epic.status)} ${epic.status}\n\n`;
                        
                        if (epic.priority) {
                            output += `**Priority**: ${getPriorityEmoji(epic.priority)} ${epic.priority}\n\n`;
                        }
                        
                        if (epic.complexity) {
                            output += `**Complexity**: ${epic.complexity}/10\n\n`;
                        }
                        
                        output += `**Progress**: ${getProgressBar(completion.percentage)}\n\n`;
                        output += `**Tasks**: ${completion.completedTasks}/${completion.totalTasks} completed\n\n`;
                        output += `**Subtasks**: ${completion.completedSubtasks}/${completion.totalSubtasks} completed\n\n`;
                        output += `**ID**: \`${epic.id}\`\n\n`;
                        output += `**Created**: ${new Date(epic.createdAt).toLocaleString()}\n\n`;
                        output += `**Updated**: ${new Date(epic.updatedAt).toLocaleString()}\n\n`;
                        
                        // Description section
                        if (verbosity !== "summary") {
                            output += `## Description\n\n${epic.description}\n\n`;
                        }
                        
                        // Implementation plan if available
                        if ((verbosity === "full" || verbosity === "detailed") && epic.implementationPlan) {
                            output += `## Implementation Plan\n\n${epic.implementationPlan}\n\n`;
                        }
                        
                        // Test strategy if available
                        if ((verbosity === "full" || verbosity === "detailed") && epic.testStrategy) {
                            output += `## Test Strategy\n\n${epic.testStrategy}\n\n`;
                        }
                        
                        // Tasks section
                        output += `## Tasks (${completion.completedTasks}/${completion.totalTasks})\n\n`;
                        
                        if (epic.tasks.length === 0) {
                            output += "*No tasks defined yet*\n\n";
                        } else {
                            // Group tasks by status for better organization
                            const inProgressTasks = epic.tasks.filter(t => t.status === 'in-progress');
                            const todoTasks = epic.tasks.filter(t => t.status === 'todo');
                            const doneTasks = epic.tasks.filter(t => t.status === 'done');
                            
                            // In-progress tasks first
                            if (inProgressTasks.length > 0) {
                                output += `### In Progress Tasks\n\n`;
                                inProgressTasks.forEach(task => {
                                    const subtaskProgress = task.subtasks?.length > 0 
                                        ? `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length} subtasks)` 
                                        : '';
                                    
                                    // Use markdown list format for main tasks
                                    output += `- ${getTaskStatusDisplay(task.status)} **${task.id}**: ${task.description.split('\n')[0]} ${subtaskProgress}\n`;
                                    
                                    // Add subtasks for detailed/full verbosity
                                    if ((verbosity === 'detailed' || verbosity === 'full') && task.subtasks?.length > 0) {
                                        task.subtasks.forEach(subtask => {
                                            const subtaskStatus = subtask.status === 'done' ? '[x] ✅' : '[ ] ⬜';
                                            // Indent subtasks with proper markdown list formatting
                                            output += `  - ${subtaskStatus} ${subtask.description}\n`;
                                        });
                                        // Subtasks already have newline, add one more for spacing
                                        output += '\n'; 
                                    } else {
                                        // Add extra blank line after task if no subtasks
                                        output += '\n'; 
                                    }
                                });
                            }
                            
                            // Todo tasks next
                            if (todoTasks.length > 0) {
                                output += `### To Do Tasks\n\n`;
                                todoTasks.forEach(task => {
                                    const subtaskProgress = task.subtasks?.length > 0 
                                        ? `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length} subtasks)` 
                                        : '';
                                    
                                    // Use markdown list format for main tasks
                                    output += `- ${getTaskStatusDisplay(task.status)} **${task.id}**: ${task.description.split('\n')[0]} ${subtaskProgress}\n`;
                                    
                                    // Add subtasks for detailed/full verbosity
                                    if ((verbosity === 'detailed' || verbosity === 'full') && task.subtasks?.length > 0) {
                                        task.subtasks.forEach(subtask => {
                                            const subtaskStatus = subtask.status === 'done' ? '[x] ✅' : '[ ] ⬜';
                                            // Indent subtasks with proper markdown list formatting
                                            output += `  - ${subtaskStatus} ${subtask.description}\n`;
                                        });
                                        // Subtasks already have newline, add one more for spacing
                                        output += '\n';
                                    } else {
                                        // Add extra blank line after task if no subtasks
                                        output += '\n';
                                    }
                                });
                            }
                            
                            // Done tasks last
                            if (doneTasks.length > 0) {
                                output += `### Completed Tasks\n\n`;
                                doneTasks.forEach(task => {
                                    // Use markdown list format for main tasks
                                    output += `- ${getTaskStatusDisplay(task.status)} **${task.id}**: ${task.description.split('\n')[0]}\n`;
                                    
                                    // For completed tasks, only show subtasks in full verbosity
                                    if (verbosity === 'full' && task.subtasks?.length > 0) {
                                        task.subtasks.forEach(subtask => {
                                            const subtaskStatus = subtask.status === 'done' ? '[x] ✅' : '[ ] ⬜';
                                            // Indent subtasks with proper markdown list formatting
                                            output += `  - ${subtaskStatus} ${subtask.description}\n`;
                                        });
                                        // Subtasks already have newline, add one more for spacing
                                        output += '\n';
                                    } else {
                                        // Add extra blank line after task if no subtasks
                                        output += '\n';
                                    }
                                });
                            }
                        }
                        
                        // Dependencies section if any
                        if (epic.dependencies && epic.dependencies.length > 0) {
                            output += `## Dependencies (Depends On)\n\n`;
                            
                            for (const depId of epic.dependencies) {
                                const depEpic = getEpicById(depId);
                                if (depEpic) {
                                    const checkmark = depEpic.status === 'done' ? '✅' : depEpic.status === 'in-progress' ? '🚧' : '⬜';
                                    output += `- ${checkmark} EPIC **${depId}**: ${depEpic.description.split('\n')[0]}\n`;
                                } else {
                                    output += `- ❓ UNKNOWN **${depId}**\n`;
                                }
                            }
                            output += '\n';
                        }
                        
                        // Dependents section (epics and tasks that depend on this epic)
                        const { epicDependents, taskDependents } = findDependentItems(epic.id, allEpics);
                        
                        if (epicDependents.length > 0 || taskDependents.length > 0) {
                            output += `## Dependents (Required By)\n\n`;
                            
                            epicDependents.forEach(depEpic => {
                                const checkmark = depEpic.status === 'done' ? '✅' : depEpic.status === 'in-progress' ? '🚧' : '⬜';
                                output += `- ${checkmark} EPIC **${depEpic.id}**: ${depEpic.description.split('\n')[0]}\n`;
                            });
                            
                            taskDependents.forEach(({ epic: parentEpic, task }) => {
                                const checkmark = task.status === 'done' ? '✅' : task.status === 'in-progress' ? '🚧' : '⬜';
                                output += `- ${checkmark} TASK **${task.id}**: ${task.description.split('\n')[0]} (in Epic: ${parentEpic.id})\n`;
                            });
                            
                            output += '\n';
                        }
                        
                        // Files section if any
                        if (verbosity !== 'summary' && epic.files && epic.files.length > 0) {
                            output += `## Associated Files\n\n`;
                            
                            epic.files.forEach(file => {
                                output += `- 📄 \`${file.filePath}\`${file.description ? `: ${file.description}` : ''}\n`;
                            });
                            output += '\n';
                        }
                        
                        // Add diagrams if requested
                        if (includeDiagrams) {
                            output += `## Visualizations\n\n`;
                            
                            // Determine which diagrams to include
                            const diagramsToInclude: DiagramTypeValues[] = diagramTypes.length > 0
                                ? diagramTypes.filter(d => Object.values(DiagramType).includes(d as DiagramTypeValues)) as DiagramTypeValues[]
                                : getAllDiagramTypes();
                            
                            // Add each requested diagram
                            if (diagramsToInclude.includes(DiagramType.PROGRESS_PIE)) {
                                output += generateProgressPieDiagram(epic, completion);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.DEPENDENCY_GRAPH)) {
                                output += generateDependencyGraphDiagram(epic, allEpics);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.TASK_FLOW) && verbosity === 'full') {
                                output += generateTaskFlowDiagram(epic);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.TIMELINE) && verbosity === 'full') {
                                output += generateTimelineDiagram(epic);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.USER_JOURNEY)) {
                                output += generateUserJourneyDiagram(epic);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.BLOCK_DIAGRAM)) {
                                output += generateBlockDiagram(epic);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.RADAR_CHART)) {
                                output += generateRadarChart(epic);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.KANBAN_BOARD)) {
                                output += generateKanbanBoard(epic);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.SEQUENCE_DIAGRAM)) {
                                output += generateSequenceDiagram(epic);
                            }
                            
                            if (diagramsToInclude.includes(DiagramType.CLASS_DIAGRAM)) {
                                output += generateClassDiagram(epic);
                            }
                        }
                        
                        // Write the overview to a markdown file in the epic's directory
                        try {
                            const epicDir = getEpicFolder(epicId);
                            const overviewPath = path.join(epicDir, 'overview.md');
                            await fs.writeFile(overviewPath, output, 'utf-8');
                            
                            // Return both the content and the file location
                            return { 
                                content: [
                                    { type: "text", text: output },
                                    { type: "text", text: `\n---\nOverview saved to: ${overviewPath}` }
                                ] 
                            };
                        } catch (error: any) {
                            return { 
                                content: [
                                    { type: "text", text: output },
                                    { type: "text", text: `\n---\nWarning: Could not save overview to file: ${error.message}` }
                                ],
                                isError: false // Don't mark as error since we still have the output
                            };
                        }
                    }
                    
                    case 'suggestNext': {
                        const allEpics = getEpics();
                        let suggestion = "# 🎯 Next Steps Suggestion\n\n";
                        
                        if (epicId) {
                            // Suggest next task for a specific epic
                            const epic = getEpicById(epicId);
                            if (!epic) {
                                return { content: [{ type: "text", text: `Epic with ID ${epicId} not found` }], isError: true };
                            }
                            
                            suggestion += `## For Epic: ${epic.description.split('\n')[0]}\n\n`;
                            
                            // Check epic status
                            if (epic.status === 'done') {
                                suggestion += "✅ This Epic is marked as **done**. Consider reviewing the completed work or starting a new Epic.\n\n";
                                return { content: [{ type: "text", text: suggestion }] };
                            }
                            
                            // Check for epic blockers
                            if (epic.dependencies && epic.dependencies.length > 0) {
                                const blockers = epic.dependencies
                                    .map(depId => getEpicById(depId))
                                    .filter(dep => dep && dep.status !== 'done')
                                    .map(dep => `${dep?.id}: ${dep?.description.split('\n')[0]}`);
                                
                                if (blockers.length > 0) {
                                    suggestion += "⚠️ This Epic is blocked by:\n\n";
                                    blockers.forEach(blocker => {
                                        suggestion += `- ${blocker}\n`;
                                    });
                                    suggestion += "\nConsider working on these blocking Epics first.\n\n";
                                }
                            }
                            
                            // Find in-progress tasks
                            const inProgressTasks = epic.tasks.filter(t => t.status === 'in-progress');
                            if (inProgressTasks.length > 0) {
                                suggestion += "🚧 **Continue working on these in-progress tasks:**\n\n";
                                inProgressTasks.forEach(task => {
                                    const subtaskProgress = task.subtasks?.length > 0 
                                        ? `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length} subtasks)` 
                                        : '';
                                    suggestion += `- ${task.id}: ${task.description.split('\n')[0]} ${subtaskProgress}\n`;
                                });
                                suggestion += "\n";
                            }
                            
                            // Find unblocked todo tasks
                            const todoTasks = epic.tasks.filter(t => t.status === 'todo');
                            if (todoTasks.length > 0) {
                                const unblocked = todoTasks.filter(task => {
                                    if (!task.dependencies || task.dependencies.length === 0) return true;
                                    
                                    return task.dependencies.every(depId => {
                                        const depTask = getTaskById(depId);
                                        const depEpic = getEpicById(depId);
                                        return depTask?.task.status === 'done' || depEpic?.status === 'done';
                                    });
                                });
                                
                                if (unblocked.length > 0) {
                                    suggestion += "✅ **Ready to start tasks:**\n\n";
                                    unblocked.forEach(task => {
                                        suggestion += `- ${task.id}: ${task.description.split('\n')[0]}\n`;
                                    });
                                    suggestion += "\n";
                                }
                                
                                // Find blocked tasks
                                const blocked = todoTasks.filter(task => 
                                    task.dependencies && task.dependencies.some(depId => {
                                        const depTask = getTaskById(depId);
                                        const depEpic = getEpicById(depId);
                                        return (!depTask || depTask.task.status !== 'done') && 
                                               (!depEpic || depEpic.status !== 'done');
                                    })
                                );
                                
                                if (blocked.length > 0) {
                                    suggestion += "⏳ **Blocked tasks (dependencies not satisfied):**\n\n";
                                    blocked.forEach(task => {
                                        suggestion += `- ${task.id}: ${task.description.split('\n')[0]}\n`;
                                    });
                                    suggestion += "\n";
                                }
                            }
                            
                            if (epic.tasks.length === 0) {
                                suggestion += "📝 **This Epic has no tasks yet.** Consider creating initial tasks to break down the work.\n\n";
                            }
                            
                        } else {
                            // Suggest next Epic to work on
                            suggestion += "## Epic Suggestions\n\n";
                            
                            // Find in-progress epics first
                            const inProgressEpics = allEpics.filter(e => e.status === 'in-progress');
                            if (inProgressEpics.length > 0) {
                                suggestion += "🚧 **Continue working on these in-progress Epics:**\n\n";
                                inProgressEpics.forEach(epic => {
                                    const completion = calculateEpicCompletion(epic);
                                    suggestion += `- ${epic.id}: ${epic.description.split('\n')[0]} (${completion.percentage}% complete)\n`;
                                });
                                suggestion += "\n";
                            }
                            
                            // Find unblocked todo epics
                            const todoEpics = allEpics.filter(e => e.status === 'todo');
                            if (todoEpics.length > 0) {
                                const unblocked = todoEpics.filter(epic => {
                                    if (!epic.dependencies || epic.dependencies.length === 0) return true;
                                    
                                    return epic.dependencies.every(depId => {
                                        const depEpic = getEpicById(depId);
                                        return depEpic?.status === 'done';
                                    });
                                });
                                
                                if (unblocked.length > 0) {
                                    suggestion += "✅ **Ready to start Epics:**\n\n";
                                    unblocked.forEach(epic => {
                                        suggestion += `- ${epic.id}: ${epic.description.split('\n')[0]}\n`;
                                    });
                                    suggestion += "\n";
                                }
                                
                                // Find blocked epics
                                const blocked = todoEpics.filter(epic => 
                                    epic.dependencies && epic.dependencies.some(depId => {
                                        const depEpic = getEpicById(depId);
                                        return !depEpic || depEpic.status !== 'done';
                                    })
                                );
                                
                                if (blocked.length > 0) {
                                    suggestion += "⏳ **Blocked Epics (dependencies not satisfied):**\n\n";
                                    blocked.forEach(epic => {
                                        suggestion += `- ${epic.id}: ${epic.description.split('\n')[0]}\n`;
                                        
                                        // List blockers
                                        if (epic.dependencies) {
                                            const blockers = epic.dependencies
                                                .map(depId => getEpicById(depId))
                                                .filter(dep => dep && dep.status !== 'done')
                                                .map(dep => `${dep?.id}: ${dep?.description.split('\n')[0]}`);
                                            
                                            if (blockers.length > 0) {
                                                blockers.forEach(blocker => {
                                                    suggestion += `  - Blocked by: ${blocker}\n`;
                                                });
                                            }
                                        }
                                    });
                                    suggestion += "\n";
                                }
                            }
                            
                            if (allEpics.length === 0) {
                                suggestion += "📝 **No Epics found.** Create a new Epic to get started.\n\n";
                            }
                        }
                        
                        return { content: [{ type: "text", text: suggestion }] };
                    }
                    
                    case 'verify': {
                        if (!epicId) {
                            return { content: [{ type: "text", text: "epicId is required for verify mode" }], isError: true };
                        }

                        const epic = getEpicById(epicId);
                        if (!epic) {
                            return { content: [{ type: "text", text: `Epic with ID ${epicId} not found` }], isError: true };
                        }
                        
                        // Calculate completion metrics
                        const completion = calculateEpicCompletion(epic);
                        
                        // Check dependencies
                        let allDependenciesMet = true;
                        const pendingDependencies: string[] = [];
                        
                        if (epic.dependencies && epic.dependencies.length > 0) {
                            for (const depId of epic.dependencies) {
                                const dependency = getEpicById(depId);
                                if (!dependency || dependency.status !== 'done') {
                                    allDependenciesMet = false;
                                    pendingDependencies.push(depId);
                                }
                            }
                        }
                        
                        // Prepare verification report
                        let report = `# 🔍 Epic Verification Report\n\n`;
                        report += `## Epic: ${epic.description.split('\n')[0]}\n\n`;
                        
                        // Completion status
                        report += `### Completion Status\n\n`;
                        report += `**Overall Progress**: ${getProgressBar(completion.percentage)}\n`;
                        report += `**Tasks**: ${completion.completedTasks}/${completion.totalTasks} completed\n`;
                        report += `**Subtasks**: ${completion.completedSubtasks}/${completion.totalSubtasks} completed\n\n`;
                        
                        // Dependencies status
                        report += `### Dependencies Status\n\n`;
                        if (epic.dependencies && epic.dependencies.length > 0) {
                            if (allDependenciesMet) {
                                report += `✅ All dependencies are satisfied.\n\n`;
                            } else {
                                report += `⚠️ Some dependencies are not yet completed:\n\n`;
                                for (const depId of pendingDependencies) {
                                    const dep = getEpicById(depId);
                                    if (dep) {
                                        report += `- ${dep.id}: ${dep.description.split('\n')[0]} (${dep.status})\n`;
                                    } else {
                                        report += `- ${depId}: Unknown dependency\n`;
                                    }
                                }
                                report += `\n`;
                            }
                        } else {
                            report += `✅ No dependencies defined.\n\n`;
                        }
                        
                        // List incomplete tasks
                        const incompleteTasks = epic.tasks.filter(t => t.status !== 'done');
                        if (incompleteTasks.length > 0) {
                            report += `### Incomplete Tasks\n\n`;
                            incompleteTasks.forEach(task => {
                                report += `- ${getStatusEmoji(task.status)} ${task.id}: ${task.description.split('\n')[0]}\n`;
                            });
                            report += `\n`;
                        }
                        
                        // Verification result
                        report += `### Verification Result\n\n`;
                        
                        if (completion.percentage === 100 && allDependenciesMet) {
                            report += `✅ **PASSED**: All tasks are complete and dependencies are satisfied.\n\n`;
                            report += `Recommendation: Mark this Epic as 'done'.\n`;
                        } else {
                            report += `⚠️ **NOT READY**: ${completion.percentage}% complete. `;
                            
                            if (completion.totalTasks === 0) {
                                report += `No tasks have been defined yet.\n\n`;
                            } else if (incompleteTasks.length > 0) {
                                report += `${incompleteTasks.length} task(s) are not yet complete.\n\n`;
                            }
                            
                            if (!allDependenciesMet) {
                                report += `${pendingDependencies.length} dependency/dependencies need to be completed first.\n\n`;
                            }
                            
                            report += `Recommendation: Keep status as '${epic.status}' until all tasks and dependencies are completed.\n`;
                        }
                        
                        return { content: [{ type: "text", text: report }] };
                    }
                    
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

// Function to generate progress pie chart
function generateProgressPieDiagram(epic: Epic, completion: ReturnType<typeof calculateEpicCompletion>): string {
    let output = `### Progress Chart\n\n`;
    output += "```mermaid\npie\n";
    output += `    title Epic Progress\n`;
    output += `    "Completed Tasks" : ${completion.completedTasks}\n`;
    output += `    "Remaining Tasks" : ${completion.totalTasks - completion.completedTasks}\n`;
    output += "```\n\n";
    return output;
}

// Function to generate dependency graph
function generateDependencyGraphDiagram(epic: Epic, allEpics: Epic[]): string {
    let output = `### Dependency Graph\n\n`;
    output += "```mermaid\nflowchart TB\n";
    // Style configuration
    output += "    classDef epicNode fill:#f9f,stroke:#333,stroke-width:2px;\n";
    output += "    classDef taskNode fill:#bbf,stroke:#333,stroke-width:1px;\n";
    output += "    classDef doneNode fill:#bfb,stroke:#333;\n";
    output += "    classDef inProgressNode fill:#ffb,stroke:#333;\n";
    
    // Current epic node
    output += `    EPIC_${epic.id}["${getStatusEmoji(epic.status)} Epic: ${epic.description.split('\n')[0].substring(0, 30)}${epic.description.split('\n')[0].length > 30 ? '...' : ''}"];\n`;
    output += `    class EPIC_${epic.id} epicNode;\n`;
    
    // Epic dependencies
    if (epic.dependencies) {
        for (const depId of epic.dependencies) {
            const depEpic = getEpicById(depId);
            if (depEpic) {
                output += `    EPIC_${depId}["${getStatusEmoji(depEpic.status)} Epic: ${depEpic.description.split('\n')[0].substring(0, 30)}${depEpic.description.split('\n')[0].length > 30 ? '...' : ''}"];\n`;
                output += `    EPIC_${depId} --> EPIC_${epic.id};\n`;
                output += `    class EPIC_${depId} epicNode${depEpic.status === 'done' ? ',doneNode' : depEpic.status === 'in-progress' ? ',inProgressNode' : ''};\n`;
            }
        }
    }
    
    // Tasks in the epic (with simplified labels for better rendering)
    // Only include first few tasks in diagram to prevent overcrowding
    const MAX_TASKS_IN_DIAGRAM = 6;
    const tasksForDiagram = epic.tasks.slice(0, MAX_TASKS_IN_DIAGRAM);
    
    for (const task of tasksForDiagram) {
        const truncatedDesc = task.description.split('\n')[0].substring(0, 25) + 
            (task.description.split('\n')[0].length > 25 ? '...' : '');
        output += `    TASK_${task.id}["${getStatusEmoji(task.status)} Task: ${truncatedDesc}"];\n`;
        output += `    EPIC_${epic.id} --> TASK_${task.id};\n`;
        output += `    class TASK_${task.id} taskNode${task.status === 'done' ? ',doneNode' : task.status === 'in-progress' ? ',inProgressNode' : ''};\n`;
    }
    
    // Add a note if tasks were omitted
    if (epic.tasks.length > MAX_TASKS_IN_DIAGRAM) {
        const remainingTasks = epic.tasks.length - MAX_TASKS_IN_DIAGRAM;
        output += `    MORE["...and ${remainingTasks} more tasks"];\n`;
        output += `    EPIC_${epic.id} --> MORE;\n`;
        output += `    class MORE taskNode;\n`;
    }
    
    output += "```\n\n";
    return output;
}

// Function to generate task flow diagram
function generateTaskFlowDiagram(epic: Epic): string {
    // Group tasks by status
    const todoTasksForDiagrams = epic.tasks.filter(t => t.status === 'todo');
    const inProgressTasksForDiagrams = epic.tasks.filter(t => t.status === 'in-progress');
    const doneTasksForDiagrams = epic.tasks.filter(t => t.status === 'done');
    
    // Only generate if there are sufficient tasks
    if (epic.tasks.length <= 3) {
        return "";
    }
    
    let output = `### Task Flow Diagram\n\n`;
    output += "```mermaid\nflowchart TB\n";
    output += "    %% Flowchart settings\n";
    
    // Add subgraphs for different statuses
    // Limit number of tasks in each subgraph
    const MAX_TASKS_PER_STATUS = 5;
    
    if (todoTasksForDiagrams.length > 0) {
        output += "    subgraph TODO[\"⏳ To Do Tasks\"]\n";
        const todoForDisplay = todoTasksForDiagrams.slice(0, MAX_TASKS_PER_STATUS);
        todoForDisplay.forEach((task: Task) => {
            const truncatedDesc = task.description.split('\n')[0].substring(0, 30) + 
                (task.description.split('\n')[0].length > 30 ? '...' : '');
            output += `        TODO_${task.id}["${truncatedDesc}"];\n`;
        });
        
        // Add a note if tasks were omitted
        if (todoTasksForDiagrams.length > MAX_TASKS_PER_STATUS) {
            output += `        TODO_MORE["...and ${todoTasksForDiagrams.length - MAX_TASKS_PER_STATUS} more tasks"];\n`;
        }
        
        output += "    end\n\n";
    }
    
    if (inProgressTasksForDiagrams.length > 0) {
        output += "    subgraph PROGRESS[\"🚧 In Progress Tasks\"]\n";
        const inProgressForDisplay = inProgressTasksForDiagrams.slice(0, MAX_TASKS_PER_STATUS);
        inProgressForDisplay.forEach((task: Task) => {
            const truncatedDesc = task.description.split('\n')[0].substring(0, 30) + 
                (task.description.split('\n')[0].length > 30 ? '...' : '');
            output += `        INPROGRESS_${task.id}["${truncatedDesc}"];\n`;
        });
        
        // Add a note if tasks were omitted
        if (inProgressTasksForDiagrams.length > MAX_TASKS_PER_STATUS) {
            output += `        INPROGRESS_MORE["...and ${inProgressTasksForDiagrams.length - MAX_TASKS_PER_STATUS} more tasks"];\n`;
        }
        
        output += "    end\n\n";
    }
    
    if (doneTasksForDiagrams.length > 0) {
        output += "    subgraph DONE[\"✅ Completed Tasks\"]\n";
        const doneForDisplay = doneTasksForDiagrams.slice(0, MAX_TASKS_PER_STATUS);
        doneForDisplay.forEach((task: Task) => {
            const truncatedDesc = task.description.split('\n')[0].substring(0, 30) + 
                (task.description.split('\n')[0].length > 30 ? '...' : '');
            output += `        DONE_${task.id}["${truncatedDesc}"];\n`;
        });
        
        // Add a note if tasks were omitted
        if (doneTasksForDiagrams.length > MAX_TASKS_PER_STATUS) {
            output += `        DONE_MORE["...and ${doneTasksForDiagrams.length - MAX_TASKS_PER_STATUS} more tasks"];\n`;
        }
        
        output += "    end\n\n";
    }
    
    // Define default empty arrays to avoid undefined errors
    const todoForDisplay: Task[] = todoTasksForDiagrams.length > 0 ? 
        todoTasksForDiagrams.slice(0, MAX_TASKS_PER_STATUS) : [];
        
    const inProgressForDisplay: Task[] = inProgressTasksForDiagrams.length > 0 ? 
        inProgressTasksForDiagrams.slice(0, MAX_TASKS_PER_STATUS) : [];
        
    const doneForDisplay: Task[] = doneTasksForDiagrams.length > 0 ? 
        doneTasksForDiagrams.slice(0, MAX_TASKS_PER_STATUS) : [];
    
    // Add connections based on dependencies - limit to visible tasks only
    const allDisplayedTaskIds = new Set([
        ...todoForDisplay.map((t: Task) => t.id),
        ...inProgressForDisplay.map((t: Task) => t.id),
        ...doneForDisplay.map((t: Task) => t.id)
    ]);
    
    // Only add connections for tasks that are actually displayed
    for (const task of [...todoForDisplay, ...inProgressForDisplay, ...doneForDisplay]) {
        if (task.dependencies) {
            for (const depId of task.dependencies) {
                // Only add connection if both tasks are displayed
                if (allDisplayedTaskIds.has(depId)) {
                    const depTaskResult = getTaskById(depId);
                    if (depTaskResult && epic.tasks.some(t => t.id === depId)) {
                        const sourcePrefix = depTaskResult.task.status === 'done' ? 'DONE' : 
                                          depTaskResult.task.status === 'in-progress' ? 'INPROGRESS' : 'TODO';
                        const targetPrefix = task.status === 'done' ? 'DONE' : 
                                          task.status === 'in-progress' ? 'INPROGRESS' : 'TODO';
                        
                        output += `    ${sourcePrefix}_${depId} --> ${targetPrefix}_${task.id};\n`;
                    }
                }
            }
        }
    }
    
    output += "```\n\n";
    return output;
}

// Function to generate timeline diagram
function generateTimelineDiagram(epic: Epic): string {
    // Only generate if there are multiple tasks
    if (epic.tasks.length <= 1) {
        return "";
    }
    
    let output = `### Timeline View\n\n`;
    output += "```mermaid\ngantt\n";
    output += "    title Epic Timeline\n";
    output += "    dateFormat  YYYY-MM-DD\n";
    output += "    axisFormat %m/%d\n";
    
    // Start date is the earliest creation date among tasks
    const startDate = epic.tasks.reduce((earliest, task) => {
        const taskDate = new Date(task.createdAt);
        return taskDate < earliest ? taskDate : earliest;
    }, new Date(epic.createdAt));
    
    // Format the date as YYYY-MM-DD
    const formattedStartDate = startDate.toISOString().split('T')[0];
    output += `    section Tasks\n`;
    
    // Add each task as a gantt section
    epic.tasks.forEach((task, index) => {
        const taskDescription = task.description.split('\n')[0].replace(/"/g, "'"); // Escape quotes
        const status = task.status === 'done' ? 'done' : task.status === 'in-progress' ? 'active' : 'crit';
        
        // Calculate a duration based on complexity or a default
        const duration = task.complexity ? Math.max(task.complexity, 1) : 3;
        output += `    ${taskDescription} :${status}, ${formattedStartDate}, ${duration}d\n`;
    });
    
    output += "```\n\n";
    return output;
}

// Function to generate user journey diagram
function generateUserJourneyDiagram(epic: Epic): string {
    let output = `### User Journey\n\n`;
    output += "```mermaid\njourney\n";
    output += `    title Epic Journey: ${epic.description.split('\n')[0].substring(0, 30)}\n`;
    
    // Group tasks by status for the journey
    const statusSections = {
        'todo': epic.tasks.filter(t => t.status === 'todo'),
        'in-progress': epic.tasks.filter(t => t.status === 'in-progress'),
        'done': epic.tasks.filter(t => t.status === 'done')
    };
    
    // Status display names
    const statusNames = {
        'todo': 'To Do',
        'in-progress': 'In Progress',
        'done': 'Completed'
    };
    
    // Add tasks to sections
    Object.entries(statusSections).forEach(([status, tasks]) => {
        if (tasks.length > 0) {
            output += `    section ${statusNames[status as keyof typeof statusNames]}\n`;
            tasks.forEach(task => {
                // Score based on status (5 for done, 3 for in-progress, 1 for todo)
                const score = status === 'done' ? 5 : status === 'in-progress' ? 3 : 1;
                const truncatedDesc = task.description.split('\n')[0].substring(0, 25) + 
                    (task.description.split('\n')[0].length > 25 ? '...' : '');
                output += `      ${truncatedDesc}: ${score}: Team\n`;
            });
        }
    });
    
    output += "```\n\n";
    return output;
}

// Function to generate block diagram
function generateBlockDiagram(epic: Epic): string {
    let output = `### Epic Structure\n\n`;
    output += "```mermaid\nblock-beta\n";
    output += "  columns 3\n";
    
    // Create the epic block
    output += `  Epic["${epic.description.split('\n')[0].substring(0, 30)}"] down<[" "]>(down)\n`;
    
    // Add Tasks
    // First row - statuses
    output += "  Todo[\"⏳ Todo\"] space:1 InProgress[\"🚧 In Progress\"] space:1 Done[\"✅ Done\"]\n";
    
    // Count tasks in each category
    const todoCount = epic.tasks.filter(t => t.status === 'todo').length;
    const inProgressCount = epic.tasks.filter(t => t.status === 'in-progress').length;
    const doneCount = epic.tasks.filter(t => t.status === 'done').length;
    
    // Add task blocks with counts
    output += `  down<[" "]>(down) space:1 down<[" "]>(down) space:1 down<[" "]>(down)\n`;
    output += `  TodoTasks["${todoCount} task${todoCount !== 1 ? 's' : ''}"] space:1 InProgressTasks["${inProgressCount} task${inProgressCount !== 1 ? 's' : ''}"] space:1 DoneTasks["${doneCount} task${doneCount !== 1 ? 's' : ''}"]\n`;
    
    // Add styling
    output += "  classDef epicBlock fill:#f9f,stroke:#333;\n";
    output += "  classDef todoBlock fill:#fff,stroke:#333;\n";
    output += "  classDef inProgressBlock fill:#ffb,stroke:#333;\n";
    output += "  classDef doneBlock fill:#bfb,stroke:#333;\n";
    output += "  class Epic epicBlock\n";
    output += "  class Todo,TodoTasks todoBlock\n";
    output += "  class InProgress,InProgressTasks inProgressBlock\n";
    output += "  class Done,DoneTasks doneBlock\n";
    
    output += "```\n\n";
    return output;
}

// Function to generate radar chart to visualize task metrics
function generateRadarChart(epic: Epic): string {
    let output = `### Task Metrics Radar Chart\n\n`;
    output += "```mermaid\nxychart-beta\ntitle Task Status Metrics\nx-axis [Todo, In Progress, Done]\ny-axis \"Tasks\" 0 --> ${epic.tasks.length}\nbar [${epic.tasks.filter(t => t.status === 'todo').length}, ${epic.tasks.filter(t => t.status === 'in-progress').length}, ${epic.tasks.filter(t => t.status === 'done').length}]\n```\n\n";
    return output;
}

// Function to generate kanban board
function generateKanbanBoard(epic: Epic): string {
    let output = `### Kanban Board\n\n`;
    
    // Using flowchart to simulate a kanban board
    output += "```mermaid\nflowchart LR\n";
    
    // Create columns for each status
    output += "    subgraph TO-DO\n";
    epic.tasks.filter(t => t.status === 'todo').forEach(task => {
        const truncatedDesc = task.description.split('\n')[0].substring(0, 25) + 
            (task.description.split('\n')[0].length > 25 ? '...' : '');
        output += `        TODO_${task.id}["${truncatedDesc}"]\n`;
    });
    output += "    end\n";
    
    output += "    subgraph IN-PROGRESS\n";
    epic.tasks.filter(t => t.status === 'in-progress').forEach(task => {
        const truncatedDesc = task.description.split('\n')[0].substring(0, 25) + 
            (task.description.split('\n')[0].length > 25 ? '...' : '');
        output += `        INPROGRESS_${task.id}["${truncatedDesc}"]\n`;
    });
    output += "    end\n";
    
    output += "    subgraph DONE\n";
    epic.tasks.filter(t => t.status === 'done').forEach(task => {
        const truncatedDesc = task.description.split('\n')[0].substring(0, 25) + 
            (task.description.split('\n')[0].length > 25 ? '...' : '');
        output += `        DONE_${task.id}["${truncatedDesc}"]\n`;
    });
    output += "    end\n";
    
    // Add styles
    output += "    classDef todo fill:#ffcccc,stroke:#333;\n";
    output += "    classDef inprogress fill:#ffffcc,stroke:#333;\n";
    output += "    classDef done fill:#ccffcc,stroke:#333;\n";
    
    // Apply styles
    epic.tasks.filter(t => t.status === 'todo').forEach(task => {
        output += `    class TODO_${task.id} todo\n`;
    });
    
    epic.tasks.filter(t => t.status === 'in-progress').forEach(task => {
        output += `    class INPROGRESS_${task.id} inprogress\n`;
    });
    
    epic.tasks.filter(t => t.status === 'done').forEach(task => {
        output += `    class DONE_${task.id} done\n`;
    });
    
    output += "```\n\n";
    return output;
}

// Function to generate sequence diagram for task flow
function generateSequenceDiagram(epic: Epic): string {
    // Get tasks in order (first completed ones, then in-progress, then todo)
    const orderedTasks = [
        ...epic.tasks.filter(t => t.status === 'done'),
        ...epic.tasks.filter(t => t.status === 'in-progress'),
        ...epic.tasks.filter(t => t.status === 'todo')
    ];
    
    if (orderedTasks.length < 2) {
        return ""; // Need at least 2 tasks for a meaningful sequence diagram
    }
    
    let output = `### Task Sequence Diagram\n\n`;
    output += "```mermaid\nsequenceDiagram\n";
    output += "    participant E as Epic\n";
    
    // Add participants for each task (limit to first 5 for readability)
    const limitedTasks = orderedTasks.slice(0, 5);
    limitedTasks.forEach(task => {
        const shortDesc = task.description.split('\n')[0].substring(0, 15);
        output += `    participant T${task.id.substring(0, 4)} as ${shortDesc}...\n`;
    });
    
    // Show messages for task status transitions
    output += "\n    Note over E: Epic Started\n";
    
    limitedTasks.forEach(task => {
        output += `    E->>T${task.id.substring(0, 4)}: Task Created\n`;
        if (task.status === 'in-progress' || task.status === 'done') {
            output += `    T${task.id.substring(0, 4)}->>E: In Progress\n`;
        }
        if (task.status === 'done') {
            output += `    T${task.id.substring(0, 4)}->>E: Completed\n`;
        }
    });
    
    if (epic.status === 'done') {
        output += "    Note over E: Epic Completed\n";
    } else if (epic.status === 'in-progress') {
        output += "    Note over E: Epic In Progress\n";
    } else {
        output += "    Note over E: Epic Planned\n";
    }
    
    output += "```\n\n";
    return output;
}

// Function to generate class diagram for epic structure
function generateClassDiagram(epic: Epic): string {
    let output = `### Epic Structure Class Diagram\n\n`;
    output += "```mermaid\nclassDiagram\n";
    
    // Epic class
    output += `    class Epic {\n        +String id\n        +String description\n        +Status status\n        +Number complexity\n        +Tasks[] tasks\n    }\n`;
    
    // Status enum
    output += `    class Status {\n        <<enumeration>>\n        TODO\n        IN_PROGRESS\n        DONE\n    }\n`;
    
    // Task class
    output += `    class Task {\n        +String id\n        +String description\n        +Status status\n        +Number complexity\n        +Subtasks[] subtasks\n    }\n`;
    
    // Subtask class
    output += `    class Subtask {\n        +String id\n        +String description\n        +Status status\n    }\n`;
    
    // Relationships
    output += `    Epic *-- Task : contains\n`;
    output += `    Task *-- Subtask : contains\n`;
    output += `    Epic -- Status : has\n`;
    output += `    Task -- Status : has\n`;
    output += `    Subtask -- Status : has\n`;
    
    output += "```\n\n";
    return output;
} 