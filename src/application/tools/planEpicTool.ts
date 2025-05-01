import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { descriptionSchema } from "../schemas/commonSchemas.js";
import { loadPlanConfiguration, DEFAULT_PLAN_CONFIGURATION } from "../../infrastructure/planConfigLoader.js";
import type { PlanConfiguration, PlanStep } from "../../types/PlanConfigTypes.js";
import path from "path";

const planEpicSchema = z.object({
    description: descriptionSchema.describe("High-level description of what needs to be implemented"),
    basePath: z.string().optional().describe("FULL base path for the implementation (optional)"),
    includeSubtasks: z.boolean().optional().describe("Whether to include creation of subtasks (default: true)"),
    maxDepth: z.number().optional().describe("Maximum depth of subtask hierarchy (optional, default: 3)"),
    includeTestStrategy: z.boolean().optional().describe("Whether to include test strategy planning (optional, default: true)"),
    additionalContext: z.string().optional().describe("Additional context or requirements for the implementation (optional)"),
    currentStep: z.number().optional().describe("Current step in the sequential thinking process (internal use)"),
    planSummary: z.string().optional().describe("Brief summary of planning progress so far (internal use)"),
    configPath: z.string().optional().describe("FULL path to custom plan configuration JSON file (optional)")
});

type PlanEpicParams = z.infer<typeof planEpicSchema>;

export function registerPlanEpicTool(server: McpServer): void {
    server.tool(
        "planEpic",
        "Interactively creates a detailed implementation plan with hierarchical tasks and subtasks through sequential thinking, guiding the agent through multiple steps of refinement. Must be called BEFORE using the createEpic tool to ensure a comprehensive plan.",
        {
            description: descriptionSchema.describe("High-level description of what needs to be implemented"),
            basePath: z.string().optional().describe("FULL base path for the implementation (optional)"),
            includeSubtasks: z.boolean().optional().describe("Whether to include creation of subtasks (default: true)"),
            maxDepth: z.number().optional().describe("Maximum depth of subtask hierarchy (optional, default: 3)"),
            includeTestStrategy: z.boolean().optional().describe("Whether to include test strategy planning (optional, default: true)"),
            additionalContext: z.string().optional().describe("Additional context or requirements for the implementation (optional)"),
            currentStep: z.number().optional().describe("Current step in the sequential thinking process (internal use)"),
            planSummary: z.string().optional().describe("Brief summary of planning progress so far (internal use)"),
            configPath: z.string().optional().describe("FULL path to custom plan configuration JSON file (optional)")
        },
        async (params: PlanEpicParams) => {
            const { 
                description, 
                basePath, 
                includeSubtasks = true, 
                maxDepth = 3, 
                includeTestStrategy = true, 
                additionalContext,
                currentStep = 0,
                planSummary = "",
                configPath
            } = params;
            
            try {
                // Load plan configuration (from file or default)
                let planConfig: PlanConfiguration = DEFAULT_PLAN_CONFIGURATION;
                let configError: string | undefined = undefined;
                
                if (configPath) {
                    const configResult = loadPlanConfiguration(configPath);
                    if (configResult.success && configResult.configuration) {
                        planConfig = configResult.configuration;
                    } else {
                        configError = configResult.error;
                    }
                }
                
                // Check if configuration could not be loaded
                if (configError) {
                    return { 
                        content: [{ type: "text", text: `Error loading plan configuration: ${configError}` }],
                        isError: true 
                    };
                }
                
                // Get configuration-specific values or use defaults
                const effectiveMaxDepth = maxDepth || planConfig.defaultMaxDepth || 3;
                const effectiveIncludeTestStrategy = includeTestStrategy !== undefined ? 
                    includeTestStrategy : (planConfig.includeTestStrategy !== undefined ? 
                    planConfig.includeTestStrategy : true);
                
                // Get steps from configuration
                const steps = planConfig.steps.map(step => step.id);
                
                // Get current step or default to first step
                const currentStepName = currentStep < steps.length ? steps[currentStep] : steps[0];
                
                // Find the step configuration
                const stepConfig = planConfig.steps.find(step => step.id === currentStepName);
                
                if (!stepConfig) {
                    return { 
                        content: [{ type: "text", text: `Error: Could not find configuration for step "${currentStepName}"` }],
                        isError: true 
                    };
                }
                
                // Generate prompt for current step
                let prompt = generatePromptFromStepConfig(
                    stepConfig, 
                    description, 
                    basePath, 
                    additionalContext,
                    planSummary,
                    effectiveMaxDepth,
                    effectiveIncludeTestStrategy
                );
                
                // Determine next step
                let nextStep = stepConfig.order + 1;
                
                // Check if we've reached the end of the process
                if (nextStep >= planConfig.steps.length) {
                    nextStep = -1; // End of process
                }
                
                // Metadata to guide the agent's next actions
                const metadata: any = {
                    planType: "implementation",
                    includesSubtasks: includeSubtasks,
                    includesTestStrategy: effectiveIncludeTestStrategy,
                    currentStep: currentStep,
                    nextStep: nextStep,
                    stepName: currentStepName,
                    isComplete: nextStep === -1,
                    configurationId: planConfig.id,
                    configurationName: planConfig.name
                };
                
                if (nextStep !== -1) {
                    const nextStepConfig = planConfig.steps.find(step => step.order === nextStep);
                    if (nextStepConfig) {
                        metadata.nextAction = "Call planEpic with updated planSummary and currentStep";
                        metadata.nextStepName = nextStepConfig.id;
                    }
                } else {
                    metadata.nextAction = "Create Epic structure using batchEpic tool";
                }
                
                return {
                    content: [{ type: "text", text: prompt }],
                    metadata: metadata
                };
            } catch (error: any) {
                return { 
                    content: [{ type: "text", text: `Error creating implementation plan: ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
}

/**
 * Generates a prompt based on the step configuration
 */
function generatePromptFromStepConfig(
    stepConfig: PlanStep,
    description: string,
    basePath?: string,
    additionalContext?: string,
    planSummary?: string,
    maxDepth: number = 3,
    includeTestStrategy: boolean = true
): string {
    // Build the step title and header
    let prompt = `# Sequential Epic Planning: Step ${stepConfig.order + 1} - ${stepConfig.name}\n\n`;
    
    // Add project info
    prompt += `**Project**: ${description}\n`;
    if (basePath) prompt += `**Path**: ${basePath}\n`;
    if (additionalContext && stepConfig.order <= 1) prompt += `**Context**: ${additionalContext}\n`;
    
    // Add previous step summary if this step requires it
    if (stepConfig.requiresPreviousStepData && planSummary) {
        prompt += `**Previous Step**: ${planSummary}\n`;
    }
    prompt += '\n';
    
    // Add step instructions
    prompt += `**Instructions**:\n`;
    stepConfig.instructions.forEach((instruction, index) => {
        prompt += `${index + 1}. ${instruction}\n`;
    });
    prompt += '\n';
    
    // Add thinking prompts
    if (stepConfig.thinkingPrompts.length > 0) {
        prompt += `**Think About**: ${stepConfig.thinkingPrompts.join(' ')}\n\n`;
    }
    
    // Add next step prompt
    prompt += `**Next Step**:\n`;
    prompt += `${stepConfig.nextStepPrompt}\n\n`;
    
    // Add hint for summary if not the initialization step
    if (stepConfig.order > 0) {
        prompt += `Provide a 2-3 sentence summary in planSummary. Think thoroughly before submitting.`;
    }
    
    return prompt;
}

// Keep the legacy helper functions for backward compatibility
// They will be removed in a future update

function generateInitializationPrompt(description: string, basePath?: string, additionalContext?: string, maxDepth: number = 3, includeTestStrategy: boolean = true): string {
    // Find the initialization step in the default configuration
    const stepConfig = DEFAULT_PLAN_CONFIGURATION.steps.find(step => step.id === "initialization");
    if (stepConfig) {
        return generatePromptFromStepConfig(
            stepConfig,
            description,
            basePath,
            additionalContext,
            "",
            maxDepth,
            includeTestStrategy
        );
    }
    
    // Fallback to original implementation
    let prompt = `# Sequential Epic Planning: Step 1 - Getting Started\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    if (basePath) prompt += `**Path**: ${basePath}\n`;
    if (additionalContext) prompt += `**Context**: ${additionalContext}\n\n`;
    
    prompt += `**Planning Process**:\n`;
    prompt += `1. Requirements Analysis\n`;
    prompt += `2. Component Breakdown\n`;
    prompt += `3. Task Detailing (max ${maxDepth} levels)\n`;
    prompt += `4. Dependency Mapping\n`;
    prompt += `5. Implementation Details\n`;
    if (includeTestStrategy) prompt += `6. Test Strategy\n`;
    prompt += `7. Finalization\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic again with:\n`;
    prompt += `- currentStep = 1\n`;
    prompt += `- planSummary = "Starting requirements analysis"\n`;
    
    return prompt;
}

function generateRequirementsAnalysisPrompt(description: string, planSummary: string, additionalContext?: string): string {
    const stepConfig = DEFAULT_PLAN_CONFIGURATION.steps.find(step => step.id === "requirement_analysis");
    if (stepConfig) {
        return generatePromptFromStepConfig(
            stepConfig,
            description,
            undefined,
            additionalContext,
            planSummary
        );
    }
    
    // Fallback implementation
    let prompt = `# Sequential Epic Planning: Step 2 - Requirements Analysis\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    if (additionalContext) prompt += `**Additional Context**: ${additionalContext}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Analyze project requirements thoroughly\n`;
    prompt += `2. Identify functional requirements\n`;
    prompt += `3. Identify non-functional requirements\n`;
    prompt += `4. Note constraints/assumptions\n`;
    prompt += `5. Prioritize requirements\n\n`;
    
    prompt += `**Think About**: What does this project need to accomplish? What are the technical constraints?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 2\n`;
    prompt += `- planSummary = "Requirements analyzed: [key requirements]"\n\n`;
    
    prompt += `Provide a 2-3 sentence summary of requirements in planSummary. Think thoroughly about all requirements before submitting.`;
    
    return prompt;
}

function generateComponentBreakdownPrompt(description: string, planSummary: string): string {
    const stepConfig = DEFAULT_PLAN_CONFIGURATION.steps.find(step => step.id === "component_breakdown");
    if (stepConfig) {
        return generatePromptFromStepConfig(
            stepConfig,
            description,
            undefined,
            undefined,
            planSummary
        );
    }
    
    // Fallback implementation
    let prompt = `# Sequential Epic Planning: Step 3 - Component Breakdown\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Think through all major components needed\n`;
    prompt += `2. Determine purpose and responsibility of each component\n`;
    prompt += `3. Consider how components interact with each other\n`;
    prompt += `4. Consider technical architecture where relevant\n\n`;
    
    prompt += `**Think About**: What logical parts make up this system? How do they connect?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 3\n`;
    prompt += `- planSummary = "Components identified: [list main components]"\n\n`;
    
    prompt += `Provide a 2-3 sentence summary of key components in planSummary. Think thoroughly about the component architecture before submitting.`;
    
    return prompt;
}

function generateTaskDetailingPrompt(description: string, planSummary: string, maxDepth: number): string {
    const stepConfig = DEFAULT_PLAN_CONFIGURATION.steps.find(step => step.id === "task_detailing");
    if (stepConfig) {
        return generatePromptFromStepConfig(
            stepConfig,
            description,
            undefined,
            undefined,
            planSummary,
            maxDepth
        );
    }
    
    // Fallback implementation
    let prompt = `# Sequential Epic Planning: Step 4 - Task Detailing\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. For each component from the previous step, define concrete tasks\n`;
    prompt += `2. Break down complex tasks into hierarchical subtasks (max ${maxDepth} levels)\n`;
    prompt += `3. Make tasks specific and actionable\n`;
    prompt += `4. Assign complexity (1-10) to each task\n\n`;
    
    prompt += `**Think About**: What work needs to be done for each component? How can this be broken down?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 4\n`;
    prompt += `- planSummary = "Tasks defined: [X] tasks across [Y] components"\n\n`;
    
    prompt += `Provide a 2-3 sentence task summary in planSummary. Think thoroughly about all necessary tasks before submitting.`;
    
    return prompt;
}

function generateDependencyMappingPrompt(description: string, planSummary: string): string {
    const stepConfig = DEFAULT_PLAN_CONFIGURATION.steps.find(step => step.id === "dependency_mapping");
    if (stepConfig) {
        return generatePromptFromStepConfig(
            stepConfig,
            description,
            undefined,
            undefined,
            planSummary
        );
    }
    
    // Fallback implementation
    let prompt = `# Sequential Epic Planning: Step 5 - Dependency Mapping\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Identify task dependencies - which tasks must be completed before others\n`;
    prompt += `2. Map out dependencies between components and tasks\n`;
    prompt += `3. Identify critical path tasks\n`;
    prompt += `4. Consider external dependencies (APIs, services, etc.)\n\n`;
    
    prompt += `**Think About**: What is the logical order of implementation? What are the blockers?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 5\n`;
    prompt += `- planSummary = "Dependencies mapped: [key dependencies]"\n\n`;
    
    prompt += `Provide a 2-3 sentence dependency summary in planSummary. Think thoroughly about all dependencies before submitting.`;
    
    return prompt;
}

function generateImplementationDetailsPrompt(description: string, planSummary: string): string {
    const stepConfig = DEFAULT_PLAN_CONFIGURATION.steps.find(step => step.id === "implementation_details");
    if (stepConfig) {
        return generatePromptFromStepConfig(
            stepConfig,
            description,
            undefined,
            undefined,
            planSummary
        );
    }
    
    // Fallback implementation
    let prompt = `# Sequential Epic Planning: Step 6 - Implementation Details\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Add technical implementation details for key tasks\n`;
    prompt += `2. Include specific approaches, patterns, or techniques\n`;
    prompt += `3. Consider error handling, edge cases, and resilience\n`;
    prompt += `4. Address potential technical challenges\n\n`;
    
    prompt += `**Think About**: How should each part be implemented? What technical decisions need to be made?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 6\n`;
    prompt += `- planSummary = "Implementation details added for [X] components"\n\n`;
    
    prompt += `Provide a 2-3 sentence implementation summary in planSummary. Think thoroughly about implementation details before submitting.`;
    
    return prompt;
}

function generateTestStrategyPrompt(description: string, planSummary: string): string {
    const stepConfig = DEFAULT_PLAN_CONFIGURATION.steps.find(step => step.id === "test_strategy");
    if (stepConfig) {
        return generatePromptFromStepConfig(
            stepConfig,
            description,
            undefined,
            undefined,
            planSummary
        );
    }
    
    // Fallback implementation
    let prompt = `# Sequential Epic Planning: Step 7 - Test Strategy\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Develop overall testing strategy\n`;
    prompt += `2. Plan unit tests for key components\n`;
    prompt += `3. Consider integration testing approach\n`;
    prompt += `4. Plan for end-to-end or acceptance tests\n`;
    prompt += `5. Consider test data needs\n\n`;
    
    prompt += `**Think About**: How will we verify correctness? What testing approaches are most appropriate?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 7\n`;
    prompt += `- planSummary = "Test strategy defined with [approach] for [components]"\n\n`;
    
    prompt += `Provide a 2-3 sentence test strategy summary in planSummary. Think thoroughly about testing approaches before submitting.`;
    
    return prompt;
}

function generateFinalizationPrompt(description: string, planSummary: string, basePath?: string): string {
    const stepConfig = DEFAULT_PLAN_CONFIGURATION.steps.find(step => step.id === "finalization");
    if (stepConfig) {
        return generatePromptFromStepConfig(
            stepConfig,
            description,
            basePath,
            undefined,
            planSummary
        );
    }
    
    // Fallback implementation
    let prompt = `# Sequential Epic Planning: Step 8 - Finalization\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n`;
    if (basePath) prompt += `**Base Path**: ${basePath}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Review the complete plan\n`;
    prompt += `2. Ensure all tasks are properly defined\n`;
    prompt += `3. Verify dependencies are correctly mapped\n`;
    prompt += `4. Finalize implementation details and test strategy\n\n`;
    
    prompt += `**Think About**: Is the plan comprehensive and feasible? Have we missed anything important?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Your planning is complete! Now use the batchEpic tool to create the Epic structure with all the tasks and details you've defined.\n\n`;
    
    return prompt;
} 