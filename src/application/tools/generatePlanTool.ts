import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskIdSchema, descriptionSchema } from "../schemas/commonSchemas.js";
// Correct imports
import { getEpicById, getTaskById, getEpics, configureStorage, loadEpics } from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task } from "../../domain/task/entities/Task.js";

const generatePlanTypeSchema = z.enum([
    'newTask', 
    'implementation', 
    'complexityAnalysis', 
    'stepByStepAnalysis', 
    'implementationDrift'
]);

const generatePlanSchema = z.object({
    planType: generatePlanTypeSchema.describe("Type of plan/prompt to generate (required)"),
    taskId: taskIdSchema.optional().describe("Task ID (required for most types except 'newTask')"),
    description: descriptionSchema.optional().describe("Initial description (required for 'newTask')"),
    stepIndex: z.number().optional().describe("Step index (for 'stepByStepAnalysis')"),
    implementationDescription: descriptionSchema.optional().describe("Description of implementation change (for 'implementationDrift')"),
    epicId: z.string().uuid().optional().describe("ID of the Epic containing the Task (optional, required if taskId is omitted or ambiguous)"),
    basePath: z.string().optional().describe("Base path for the plan (optional)"),
    includeDependencies: z.boolean().optional().describe("Include dependency context (optional)"),
    instructions: z.string().optional().describe("Instructions for the plan (optional)"),
    generateComplexity: z.boolean().optional().describe("Generate complexity assessment (optional)"),
    generatePlan: z.boolean().optional().describe("Generate implementation plan (optional)"),
    generateTestStrategy: z.boolean().optional().describe("Generate test strategy (optional)")
});

type GeneratePlanParams = z.infer<typeof generatePlanSchema>;

export function registerGeneratePlanTool(server: McpServer): void {
    server.tool(
        "generatePlan",
        "Generates prompts/guidance for planning, analysis, or handling implementation changes.",
        {
            planType: generatePlanTypeSchema.describe("Type of plan/prompt to generate (required)"),
            taskId: taskIdSchema.optional().describe("Task ID (required for most types except 'newTask')"),
            description: descriptionSchema.optional().describe("Initial description (required for 'newTask')"),
            stepIndex: z.number().optional().describe("Step index (for 'stepByStepAnalysis')"),
            implementationDescription: descriptionSchema.optional().describe("Description of implementation change (for 'implementationDrift')"),
            epicId: z.string().uuid().optional().describe("ID of the Epic containing the Task (optional, required if taskId is omitted or ambiguous)"),
            basePath: z.string().optional().describe("Base path for the plan (optional)"),
            includeDependencies: z.boolean().optional().describe("Include dependency context (optional)"),
            instructions: z.string().optional().describe("Instructions for the plan (optional)"),
            generateComplexity: z.boolean().optional().describe("Generate complexity assessment (optional)"),
            generatePlan: z.boolean().optional().describe("Generate implementation plan (optional)"),
            generateTestStrategy: z.boolean().optional().describe("Generate test strategy (optional)")
        },
        async (params: GeneratePlanParams) => {
            const { planType, taskId, description, stepIndex, implementationDescription, epicId, basePath, includeDependencies, instructions, generateComplexity, generatePlan, generateTestStrategy } = params;
            
            try {
                let targetEpic: Epic | undefined;
                let targetTask: Task | undefined;
                let currentTaskId = taskId; // Task ID being planned

                // --- Determine Target --- 
                if (currentTaskId) {
                    const result = getTaskById(currentTaskId);
                    if (result) {
                        targetEpic = result.epic;
                        targetTask = result.task;
                        if (epicId && targetEpic.id !== epicId) {
                             return { content: [{ type: "text", text: `Error: Task ${currentTaskId} found, but not within specified Epic ${epicId}.` }], isError: true };
                        }
                    } else if (epicId) {
                         targetEpic = getEpicById(epicId);
                         if (targetEpic) targetTask = targetEpic.tasks.find(t => t.id === currentTaskId);
                    }
                     if (!targetEpic || !targetTask) {
                        return { content: [{ type: "text", text: `Error: Could not find Task ${currentTaskId}. Specify epicId if known.` }], isError: true };
                    }
                } else if (epicId) {
                     targetEpic = getEpicById(epicId);
                     if (!targetEpic) return { content: [{ type: "text", text: `Error: Epic ${epicId} not found.` }], isError: true };
                     // Plan the Epic itself if no Task ID given
                } else {
                     return { content: [{ type: "text", text: "Error: Either epicId or taskId must be provided." }], isError: true };
                }

                // --- Build Prompt --- 
                let prompt = `Generate a plan for the following ${targetTask ? 'Task' : 'Epic'}:\n\n`;
                prompt += `BASE PATH: ${basePath}\n`;
                prompt += `EPIC ID: ${targetEpic.id}\n`;

                if (targetTask) {
                     // Task context
                     prompt += `TASK ID: ${targetTask.id}\n`;
                     prompt += `Description: ${targetTask.description.split('\n')[0]}\n`;
                     if (targetTask.description.includes('\n')) prompt += `Details Snippet: ${targetTask.description.split('\n').slice(1).join('\n').substring(0, 200)}...\n`;
                     if (targetTask.subtasks?.length > 0) prompt += `Subtasks: ${targetTask.subtasks.length}\n`;
                     if (targetTask.dependencies && targetTask.dependencies.length > 0) prompt += `Dependencies: ${targetTask.dependencies.length}\n`;
                     if (targetTask.complexity) prompt += `Current Complexity Score: ${targetTask.complexity}/10\n`;
                     if (targetTask.implementationPlan) prompt += `\nEXISTING PLAN:\n${targetTask.implementationPlan}\n`;
                     if (targetTask.testStrategy) prompt += `\nEXISTING TEST STRATEGY:\n${targetTask.testStrategy}\n`;

                } else { 
                     // Epic context
                     prompt += `Description: ${targetEpic.description.split('\n')[0]}\n`;
                     if (targetEpic.description.includes('\n')) prompt += `Details Snippet: ${targetEpic.description.split('\n').slice(1).join('\n').substring(0, 200)}...\n`;
                     if (targetEpic.tasks?.length > 0) prompt += `Tasks: ${targetEpic.tasks.length}\n`;
                     if (targetEpic.dependencies && targetEpic.dependencies.length > 0) prompt += `Dependencies: ${targetEpic.dependencies.length}\n`;
                     if (targetEpic.complexity) prompt += `Current Complexity Score: ${targetEpic.complexity}/10\n`;
                     if (targetEpic.implementationPlan) prompt += `\nEXISTING PLAN:\n${targetEpic.implementationPlan}\n`;
                     if (targetEpic.testStrategy) prompt += `\nEXISTING TEST STRATEGY:\n${targetEpic.testStrategy}\n`;
                }

                // --- Add Dependency Context --- 
                if (includeDependencies) {
                     prompt += "\n--- DEPENDENCY CONTEXT ---\n";
                     const allEpics = getEpics();
                     const allTasks: Task[] = allEpics.flatMap(e => e.tasks);

                     let dependencies: string[] = [];
                     if (targetTask?.dependencies) {
                         dependencies = targetTask.dependencies;
                     } else if (targetEpic?.dependencies) {
                         dependencies = targetEpic.dependencies;
                     }

                     if (dependencies.length > 0) {
                         prompt += "Depends On:\n";
                         dependencies.forEach(depId => {
                             const depTaskResult = getTaskById(depId);
                             const depEpic = getEpicById(depId);
                             if (depTaskResult) {
                                 prompt += `- TASK ${depId.substring(0, 8)}: ${depTaskResult.task.description.split('\n')[0]} [${depTaskResult.task.status}]\n`;
                             } else if (depEpic) {
                                  prompt += `- EPIC ${depId.substring(0, 8)}: ${depEpic.description.split('\n')[0]} [${depEpic.status}]\n`;
                             } else {
                                 prompt += `- UNKNOWN ${depId.substring(0, 8)}\n`;
                             }
                         });
                     } else {
                         prompt += "No direct dependencies listed.\n";
                     }
                     
                     // Find direct dependents (items that depend on *this* item)
                     const currentItemId = targetTask?.id || targetEpic?.id;
                     if (currentItemId) {
                        const directDependents = allTasks.filter(t => t.dependencies?.includes(currentItemId));
                        const directEpicDependents = allEpics.filter(e => e.dependencies?.includes(currentItemId));
                        
                        if (directDependents.length > 0 || directEpicDependents.length > 0) {
                            prompt += "\nDepended On By:\n";
                            directDependents.forEach(t => {
                                prompt += `- TASK ${t.id.substring(0, 8)}: ${t.description.split('\n')[0]} [${t.status}]\n`;
                            });
                            directEpicDependents.forEach(e => {
                                prompt += `- EPIC ${e.id.substring(0, 8)}: ${e.description.split('\n')[0]} [${e.status}]\n`;
                            });
                        } else {
                             prompt += "\nNot directly depended on by any listed item.\n";
                        }
                     } 
                }
                
                prompt += "\n--- INSTRUCTIONS ---\n";
                prompt += `${instructions}\n`;
                if (generateComplexity) prompt += "\nEstimate complexity (1-10). Provide only the number.";
                if (generatePlan) prompt += "\nGenerate a concise implementation plan.";
                if (generateTestStrategy) prompt += "\nGenerate a concise test strategy.";
                prompt += "\nProvide ONLY the requested information.";

                return {
                    content: [{ type: "text", text: prompt }],
                    metadata: { 
                        epicId: targetEpic.id,
                        taskId: targetTask?.id, 
                        itemType: targetTask ? "Task" : "Epic" 
                    }
                };
            } catch (error: any) {
                 return { 
                    content: [{ type: "text", text: `Error performing action '${planType}': ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
} 