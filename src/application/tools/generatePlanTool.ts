import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskIdSchema, descriptionSchema } from "../schemas/commonSchemas.js";
// Import necessary functions/types...
import { getTaskById, getTasks } from "../../infrastructure/storage/TaskStorageService.js";
import type { Task } from "../../types/TaskTypes.js";

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
    implementationDescription: descriptionSchema.optional().describe("Description of implementation change (for 'implementationDrift')")
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
            implementationDescription: descriptionSchema.optional().describe("Description of implementation change (for 'implementationDrift')")
        },
        async (params: GeneratePlanParams) => {
            const { planType, taskId, description, stepIndex, implementationDescription } = params;
            
            try {
                switch (planType) {
                    case 'newTask': {
                        if (!description) {
                             return { content: [{ type: "text", text: `Error: 'description' is required for planType '${planType}'.` }], isError: true };
                        }
                        // Logic from old planTask
                        const prompt = `Please plan this task thoroughly:
TASK: ${description}

1. Goal?
2. Steps?
3. Acceptance Criteria?
4. Effort (S/M/L)?
5. Priority (L/M/H)?
6. Test Strategy?

Use \`createTask\` with the appropriate parameters.`;
                        return { content: [{ type: "text", text: prompt }] };
                    } // End case 'newTask'

                    case 'implementation': {
                        if (!taskId) {
                             return { content: [{ type: "text", text: `Error: 'taskId' is required for planType '${planType}'.` }], isError: true };
                        }
                        const task = getTaskById(taskId);
                        if (!task) return { content: [{ type: "text", text: `Error: Task ${taskId} not found.` }], isError: true };
                        
                        // Logic from old createImplementationPlan
                        let prompt = "Please create a detailed implementation plan for this task. Consider the following:\n\n";
                        prompt += `TASK: ${task.description.split('\n')[0]}\n`;
                        if (task.description.includes('\n')) prompt += `\nDETAILS:\n${task.description.split('\n').slice(1).join('\n')}\n`;
                        if (task.subtasks && task.subtasks.length > 0) {
                            prompt += "\nEXISTING SUBTASKS:\n";
                            task.subtasks.forEach((st, i) => { prompt += `${i+1}. ${st.description} [${st.status}]\n`; });
                        }
                        prompt += "\nYour implementation plan should include:\n";
                        prompt += "1. Technical approach and key considerations\n";
                        prompt += "2. Implementation steps in sequence\n";
                        prompt += "3. Testing strategy\n";
                        prompt += "4. Potential risks and mitigations\n\n";
                        prompt += "After creating your plan, update the task with the implementation plan using:\n";
                        prompt += `\`manageTask\` action=update, taskId=${taskId}, and description=[new description including plan]\`;`;
                        return { content: [{ type: "text", text: prompt }] };
                    } // End case 'implementation'
                    
                    case 'complexityAnalysis': {
                        if (!taskId) {
                             return { content: [{ type: "text", text: `Error: 'taskId' is required for planType '${planType}'.` }], isError: true };
                        }
                        const task = getTaskById(taskId);
                        if (!task) return { content: [{ type: "text", text: `Error: Task ${taskId} not found.` }], isError: true };
                        
                        // Logic from old analyzeTask complexity mode
                        let prompt = "Please analyze the complexity of this task, considering factors like ambiguity, dependencies, number of steps/subtasks, required knowledge, and potential risks. Provide a complexity score (1-10) and justification.\n\n";
                        prompt += `--- TASK: ${task.id.substring(0, 8)} ---\n`;
                        prompt += `Description: ${task.description.split('\n')[0]}\n`;
                        if (task.description.includes('\n')) prompt += `Details Snippet: ${task.description.split('\n').slice(1).join('\n').substring(0, 200)}...\n`;
                        if (task.subtasks?.length > 0) prompt += `Subtasks: ${task.subtasks.length}\n`;
                        if (task.dependencies && task.dependencies.length > 0) prompt += `Dependencies: ${task.dependencies.length}\n`;
                        if (task.complexity) prompt += `Current Complexity Score: ${task.complexity}/10\n`;
                        prompt += `\nRespond with:\n- Complexity Score (1-10): [Score]\n- Justification: [Reasoning]\n\nUse \`manageTask\` action=update with taskId=${taskId} and complexity=[Score] to record your assessment.\`;`;
                        return { content: [{ type: "text", text: prompt }] };
                    } // End case 'complexityAnalysis'

                    case 'stepByStepAnalysis': {
                         if (!taskId) {
                             return { content: [{ type: "text", text: `Error: 'taskId' is required for planType '${planType}'.` }], isError: true };
                        }
                        const task = getTaskById(taskId);
                        if (!task) return { content: [{ type: "text", text: `Error: Task ${taskId} not found.` }], isError: true };
                        
                        // Logic from old analyzeTask step-by-step mode
                        const steps = [
                            "What is the core problem this task is trying to solve?",
                            "What are the key components or pieces of this task?",
                            "What technical dependencies might this task have?",
                            "What might be challenging about implementing this task?",
                            "What would a good solution look like for this task?"
                        ];
                        const currentStep = stepIndex !== undefined ? stepIndex : 0;
                        if (currentStep >= 0 && currentStep < steps.length) {
                            let prompt = `Step ${currentStep + 1}/${steps.length}: ${steps[currentStep]}\n\n`;
                            prompt += `Task: ${task.description.split('\n')[0]}\n\n`;
                            if (currentStep < steps.length - 1) {
                                prompt += `Consider this question carefully, then respond. When ready for the next step, use \`generatePlan\` with planType=stepByStepAnalysis, taskId=${taskId}, and stepIndex=${currentStep + 1}\`;`;
                            } else {
                                prompt += "This is the final step. After considering this question, you can formulate a complete implementation plan (e.g., using \`generatePlan\` with planType=implementation).";
                            }
                            return { content: [{ type: "text", text: prompt }] };
                        } else {
                            return { content: [{ type: "text", text: `Invalid step index: ${stepIndex}. Must be between 0 and ${steps.length - 1}.` }], isError: true };
                        }
                    } // End case 'stepByStepAnalysis'

                    case 'implementationDrift': {
                         if (!taskId) {
                             return { content: [{ type: "text", text: `Error: 'taskId' is required for planType '${planType}'.` }], isError: true };
                        }
                         if (!implementationDescription) {
                             return { content: [{ type: "text", text: `Error: 'implementationDescription' is required for planType '${planType}'.` }], isError: true };
                        }
                        const task = getTaskById(taskId);
                        if (!task) return { content: [{ type: "text", text: `Error: Task ${taskId} not found.` }], isError: true };
                        
                        // Logic from old updateTasksFromImplementation
                        const allTasks = getTasks();
                        const findDependentTasks = (currentTaskId: string, visited = new Set<string>()): string[] => {
                            if (visited.has(currentTaskId)) return [];
                            visited.add(currentTaskId);
                            const directDependents = allTasks.filter(t => t.dependencies && t.dependencies.includes(currentTaskId)).map(t => t.id);
                            const allDependents = [...directDependents];
                            for (const depId of directDependents) {
                                allDependents.push(...findDependentTasks(depId, visited));
                            }
                            return Array.from(new Set(allDependents)); // Ensure unique IDs
                        };
                        
                        const dependentTaskIds = findDependentTasks(taskId);
                        const affectedTasks = [taskId, ...dependentTaskIds];
                        
                        let prompt = `Implementation approach change detected for task ${taskId.substring(0, 8)}: "${implementationDescription}"\n\n`;
                        prompt += `This potentially affects ${affectedTasks.length} task(s) (including itself and dependents):\n`;
                        for (const affTaskId of affectedTasks) {
                            const t = getTaskById(affTaskId);
                            if (t) prompt += `- ${affTaskId.substring(0, 8)}: ${t.description.split('\n')[0]}\n`;
                        }
                        prompt += "\nPlease review each affected task. Consider if updates are needed for:\n";
                        prompt += "1. Description (\`manageTask\` action=update, description=...)\`\n";
                        prompt += "2. Subtasks (\`manageTask\` actions like updateSubtask, createSubtask, deleteSubtask)\`\n";
                        prompt += "3. Dependencies (\`manageTask\` actions like addDependency, removeDependency)\`\n";
                        prompt += "4. Status, Priority, Complexity (\`manageTask\` action=update)\`\n";
                        prompt += "Start with the original task and work through dependents.";
                        return { content: [{ type: "text", text: prompt }] };
                    } // End case 'implementationDrift'

                    default:
                        return { content: [{ type: "text", text: `Error: Unknown planType '${planType}'.` }], isError: true };
                }
            } catch (error: any) {
                 return { 
                    content: [{ type: "text", text: `Error performing action '${planType}': ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
} 