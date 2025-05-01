import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { 
    CreatePlanningConfigParams, 
    PlanningStep,
    CreatePlanningConfigResponse,
    ProgressivePlanningConfigParams
} from "../../types/PlanningConfigTypes.js";

// Zod schema for a planning step
const planningStepSchema = z.object({
    id: z.string().describe("Unique identifier for this step"),
    name: z.string().describe("Display name for this step"),
    description: z.string().describe("Description of what this step accomplishes"),
    order: z.number().int().min(0).describe("Order in the planning sequence (0-based)"),
    instructions: z.array(z.string()).describe("Instructions for this planning step"),
    thinkingPrompts: z.array(z.string()).describe("Thinking prompts to aid reflection"),
    nextStepPrompt: z.string().describe("Prompt for moving to the next step"),
    requiresPreviousStepData: z.boolean().describe("Whether this step requires data from previous steps")
});

// Zod schema for creating a planning configuration
const createPlanningConfigSchema = z.object({
    name: z.string().describe("Name of the planning configuration"),
    description: z.string().describe("Description of what this planning process does"),
    steps: z.array(planningStepSchema).describe("Steps to include in the planning process"),
    outputPath: z.string().describe("FULL path where the config should be saved (e.g., '/path/to/config/myconfig.json')"),
    defaultMaxDepth: z.number().int().min(1).optional().describe("Default maximum task hierarchy depth"),
    includeTestStrategy: z.boolean().optional().describe("Whether test strategy is included by default")
});

// Zod schema for progressive planning configuration building
const progressivePlanningConfigSchema = z.object({
    currentStep: z.number().int().min(0).describe("Current step in the configuration building process"),
    configId: z.string().optional().describe("ID of the configuration being built"),
    stepsCompleted: z.array(z.string()).optional().describe("IDs of steps that have been completed"),
    partialConfig: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        steps: z.array(planningStepSchema).optional(),
        outputPath: z.string().optional().describe("FULL path where the config should be saved (e.g., '/path/to/config/myconfig.json')"),
        defaultMaxDepth: z.number().int().min(1).optional(),
        includeTestStrategy: z.boolean().optional()
    }).optional().describe("Partial configuration built so far")
});

// The steps in the progressive planning config building process
enum PlanningConfigBuilderSteps {
    OVERVIEW = 0,
    BASIC_INFO = 1,
    STEP_DEFINITION = 2,
    FINALIZATION = 3
}

// Define the return type for step handler functions
interface StepHandlerResponse {
    content: { type: "text"; text: string; }[];
    metadata: Record<string, any>;
    isError?: boolean;
}

export function registerCreatePlanningConfigTool(server: McpServer): void {
    server.tool(
        "createPlanningConfig",
        "Creates a JSON configuration file for the planEpic tool, allowing customization of planning steps and process",
        {
            currentStep: z.number().int().min(0).describe("Current step in the configuration building process"),
            configId: z.string().optional().describe("ID of the configuration being built"),
            stepsCompleted: z.array(z.string()).optional().describe("IDs of steps that have been completed"),
            partialConfig: z.object({
                name: z.string().optional(),
                description: z.string().optional(),
                steps: z.array(planningStepSchema).optional(),
                outputPath: z.string().optional().describe("FULL path where the config should be saved (e.g., '/path/to/config/myconfig.json')"),
                defaultMaxDepth: z.number().int().min(1).optional(),
                includeTestStrategy: z.boolean().optional()
            }).optional().describe("Partial configuration built so far")
        },
        async (params: ProgressivePlanningConfigParams) => {
            try {
                const { 
                    currentStep = 0, 
                    configId = uuidv4(), 
                    stepsCompleted = [],
                    partialConfig = {} 
                } = params;
                
                // Handle each step in the configuration building process
                let response: StepHandlerResponse;
                switch (currentStep) {
                    case PlanningConfigBuilderSteps.OVERVIEW:
                        response = handleOverviewStep(configId);
                        break;
                    
                    case PlanningConfigBuilderSteps.BASIC_INFO:
                        response = handleBasicInfoStep(configId, stepsCompleted, partialConfig);
                        break;
                    
                    case PlanningConfigBuilderSteps.STEP_DEFINITION:
                        response = handleStepDefinitionStep(configId, stepsCompleted, partialConfig);
                        break;
                    
                    case PlanningConfigBuilderSteps.FINALIZATION:
                        response = handleFinalizationStep(configId, stepsCompleted, partialConfig);
                        break;
                    
                    default:
                        // Invalid step - restart from overview
                        response = handleOverviewStep(configId);
                        break;
                }
                
                return {
                    content: response.content,
                    metadata: response.metadata,
                    isError: response.isError
                };
            } catch (error: any) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error creating planning configuration: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
    
    // Also register a direct configuration creation tool for more advanced users
    server.tool(
        "createDirectPlanningConfig",
        "Directly creates a JSON configuration file for planEpic from complete specifications",
        {
            name: z.string().describe("Name of the planning configuration"),
            description: z.string().describe("Description of what this planning process does"),
            steps: z.array(planningStepSchema).describe("Steps to include in the planning process"),
            outputPath: z.string().describe("FULL path where the config should be saved (e.g., '/path/to/config/myconfig.json')"),
            defaultMaxDepth: z.number().int().min(1).optional().describe("Default maximum task hierarchy depth"),
            includeTestStrategy: z.boolean().optional().describe("Whether test strategy is included by default")
        },
        async (params: CreatePlanningConfigParams) => {
            try {
                const { name, description, steps, outputPath, defaultMaxDepth, includeTestStrategy } = params;
                
                // Create the full configuration object
                const configObject = {
                    id: uuidv4(),
                    name,
                    description,
                    version: "1.0",
                    steps,
                    defaultMaxDepth,
                    includeTestStrategy
                };
                
                // Save the configuration to file
                const result = saveConfigurationToFile(configObject, outputPath);
                
                if (result.success) {
                    return {
                        content: [{ 
                            type: "text", 
                            text: `Planning configuration created successfully at ${result.configPath}`
                        }],
                        metadata: {
                            configPath: result.configPath,
                            configId: configObject.id
                        }
                    };
                } else {
                    return {
                        content: [{ 
                            type: "text", 
                            text: `Failed to create planning configuration: ${result.error}`
                        }],
                        isError: true
                    };
                }
            } catch (error: any) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error creating planning configuration: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}

/**
 * Handles the overview step - introduces the process and prompts for the next step
 */
function handleOverviewStep(configId: string): StepHandlerResponse {
    let prompt = `# Creating Custom Planning Configuration\n\n`;
    prompt += `You are about to create a custom planning configuration that will be used with the planEpic tool. `;
    prompt += `This configuration will define the steps and process for planning an implementation.\n\n`;
    
    prompt += `## Process Overview\n`;
    prompt += `1. **Basic Information**: Define name, description, and output path\n`;
    prompt += `2. **Step Definition**: Define the planning steps with instructions and prompts\n`;
    prompt += `3. **Finalization**: Review and save the configuration\n\n`;
    
    prompt += `## Next Step\n`;
    prompt += `Call createPlanningConfig again with:\n`;
    prompt += `- currentStep = 1 (Basic Information)\n`;
    prompt += `- configId = "${configId}"\n`;
    prompt += `- partialConfig = {} (empty object for now)\n\n`;
    
    prompt += `Let's start by gathering basic information about your planning configuration.`;
    
    return {
        content: [{ type: "text", text: prompt }],
        metadata: {
            configBuilderStep: PlanningConfigBuilderSteps.OVERVIEW,
            nextStep: PlanningConfigBuilderSteps.BASIC_INFO,
            configId: configId
        }
    };
}

/**
 * Handles the basic information step - collects name, description, and output path
 */
function handleBasicInfoStep(configId: string, stepsCompleted: string[], partialConfig: Partial<CreatePlanningConfigParams>): StepHandlerResponse {
    // Mark this step as completed if not already done
    if (!stepsCompleted.includes('basic_info')) {
        stepsCompleted.push('basic_info');
    }
    
    let prompt = `# Basic Planning Configuration Information\n\n`;
    
    // If we already have basic info, show what we have
    if (partialConfig.name && partialConfig.description && partialConfig.outputPath) {
        prompt += `You've provided the following information:\n`;
        prompt += `- **Name**: ${partialConfig.name}\n`;
        prompt += `- **Description**: ${partialConfig.description}\n`;
        prompt += `- **Output Path**: ${partialConfig.outputPath}\n\n`;
        
        prompt += `Would you like to proceed to defining planning steps? If so, call createPlanningConfig with:\n`;
        prompt += `- currentStep = 2 (Step Definition)\n`;
        prompt += `- configId = "${configId}"\n`;
        prompt += `- stepsCompleted = ${JSON.stringify(stepsCompleted)}\n`;
        prompt += `- partialConfig = your current partialConfig\n\n`;
        
        prompt += `If you need to modify these values, update the partialConfig object with your changes.`;
    } else {
        prompt += `Please provide the following information for your planning configuration:\n\n`;
        prompt += `1. **Name**: A descriptive name for this planning configuration.\n`;
        prompt += `2. **Description**: Explain what kind of planning this configuration is for.\n`;
        prompt += `3. **Output Path**: FULL path where to save the configuration file (e.g., "/path/to/config/myPlanConfig.json").\n`;
        prompt += `4. (Optional) **Default Max Depth**: Maximum depth of task hierarchy (default: 3).\n`;
        prompt += `5. (Optional) **Include Test Strategy**: Whether to include test strategy by default (default: true).\n\n`;
        
        prompt += `Call createPlanningConfig again with:\n`;
        prompt += `- currentStep = 1 (stay on this step)\n`;
        prompt += `- configId = "${configId}"\n`;
        prompt += `- stepsCompleted = ${JSON.stringify(stepsCompleted)}\n`;
        prompt += `- partialConfig = { name, description, outputPath, ... } (fill in your values)\n\n`;
        
        prompt += `Once all required fields are provided, you'll move to the step definition phase.`;
    }
    
    return {
        content: [{ type: "text", text: prompt }],
        metadata: {
            configBuilderStep: PlanningConfigBuilderSteps.BASIC_INFO,
            nextStep: partialConfig.name && partialConfig.description && partialConfig.outputPath 
                ? PlanningConfigBuilderSteps.STEP_DEFINITION 
                : PlanningConfigBuilderSteps.BASIC_INFO,
            configId: configId,
            stepsCompleted
        }
    };
}

/**
 * Handles the step definition phase - collects information about planning steps
 */
function handleStepDefinitionStep(configId: string, stepsCompleted: string[], partialConfig: Partial<CreatePlanningConfigParams>): StepHandlerResponse {
    // Mark this step as in progress if not already
    if (!stepsCompleted.includes('step_definition')) {
        stepsCompleted.push('step_definition');
    }
    
    let prompt = `# Define Planning Steps\n\n`;
    
    // If we already have some steps defined, show what we have
    if (partialConfig.steps && partialConfig.steps.length > 0) {
        prompt += `You've defined ${partialConfig.steps.length} planning steps:\n\n`;
        
        partialConfig.steps.forEach((step, index) => {
            prompt += `## Step ${index + 1}: ${step.name}\n`;
            prompt += `- ID: ${step.id}\n`;
            prompt += `- Description: ${step.description}\n`;
            prompt += `- Order: ${step.order}\n`;
            prompt += `- Instructions: ${step.instructions.length} instruction(s)\n`;
            prompt += `- Thinking Prompts: ${step.thinkingPrompts.length} prompt(s)\n\n`;
        });
        
        prompt += `Would you like to:\n`;
        prompt += `1. Add more steps? Update your partialConfig.steps array with new steps.\n`;
        prompt += `2. Proceed to finalization? Call createPlanningConfig with currentStep = 3.\n\n`;
        
        prompt += `Call createPlanningConfig again with:\n`;
        prompt += `- currentStep = 2 (to add more steps) or 3 (to proceed to finalization)\n`;
        prompt += `- configId = "${configId}"\n`;
        prompt += `- stepsCompleted = ${JSON.stringify(stepsCompleted)}\n`;
        prompt += `- partialConfig = your current partialConfig with any additions\n`;
    } else {
        prompt += `Now it's time to define the steps in your planning process. Each step should include:\n\n`;
        prompt += `1. **ID**: A unique identifier for the step (e.g., "requirements_analysis")\n`;
        prompt += `2. **Name**: A display name for the step (e.g., "Requirements Analysis")\n`;
        prompt += `3. **Description**: What this step accomplishes\n`;
        prompt += `4. **Order**: Sequence number (0-based, starting from 0)\n`;
        prompt += `5. **Instructions**: Array of instructions for this planning step\n`;
        prompt += `6. **Thinking Prompts**: Questions to aid reflection during this step\n`;
        prompt += `7. **Next Step Prompt**: Text suggesting how to proceed to the next step\n`;
        prompt += `8. **Requires Previous Step Data**: Whether this step needs data from previous steps\n\n`;
        
        prompt += `Here's an example step object:\n`;
        prompt += "```json\n";
        prompt += `{
  "id": "requirements_analysis",
  "name": "Requirements Analysis",
  "description": "Identify and categorize requirements",
  "order": 0,
  "instructions": [
    "List all functional requirements",
    "Identify non-functional requirements",
    "Prioritize requirements"
  ],
  "thinkingPrompts": [
    "What does this project need to accomplish?",
    "What are the constraints?"
  ],
  "nextStepPrompt": "Call planEpic with currentStep = 1 and planSummary = 'Requirements analyzed'",
  "requiresPreviousStepData": false
}\n`;
        prompt += "```\n\n";
        
        prompt += `Call createPlanningConfig again with:\n`;
        prompt += `- currentStep = 2 (stay on this step)\n`;
        prompt += `- configId = "${configId}"\n`;
        prompt += `- stepsCompleted = ${JSON.stringify(stepsCompleted)}\n`;
        prompt += `- partialConfig = { ...your current partialConfig, steps: [your step objects] }\n\n`;
        
        prompt += `You can define multiple steps at once by adding them to the steps array. Make sure the "order" values are sequential starting from 0.`;
    }
    
    return {
        content: [{ type: "text", text: prompt }],
        metadata: {
            configBuilderStep: PlanningConfigBuilderSteps.STEP_DEFINITION,
            nextStep: partialConfig.steps && partialConfig.steps.length > 0 
                ? PlanningConfigBuilderSteps.FINALIZATION
                : PlanningConfigBuilderSteps.STEP_DEFINITION,
            configId: configId,
            stepsCompleted
        }
    };
}

/**
 * Handles the finalization step - reviews and saves the configuration
 */
function handleFinalizationStep(configId: string, stepsCompleted: string[], partialConfig: Partial<CreatePlanningConfigParams>): StepHandlerResponse {
    // Check if we have all required information
    const missingFields = [];
    if (!partialConfig.name) missingFields.push("name");
    if (!partialConfig.description) missingFields.push("description");
    if (!partialConfig.outputPath) missingFields.push("outputPath");
    if (!partialConfig.steps || partialConfig.steps.length === 0) missingFields.push("steps");
    
    // If we're missing required fields, prompt for them
    if (missingFields.length > 0) {
        let prompt = `# Missing Required Information\n\n`;
        prompt += `Before finalizing your planning configuration, the following required fields are missing:\n`;
        missingFields.forEach(field => prompt += `- ${field}\n`);
        prompt += `\nPlease provide these fields and call createPlanningConfig again with currentStep = 2 to continue.`;
        
        return {
            content: [{ type: "text", text: prompt }],
            metadata: {
                configBuilderStep: PlanningConfigBuilderSteps.STEP_DEFINITION,
                nextStep: PlanningConfigBuilderSteps.STEP_DEFINITION,
                configId: configId,
                stepsCompleted,
                missingFields
            },
            isError: true
        };
    }
    
    // All required fields are present, finalize the configuration
    const fullConfig = {
        id: configId,
        name: partialConfig.name!,
        description: partialConfig.description!,
        version: "1.0",
        steps: partialConfig.steps!,
        defaultMaxDepth: partialConfig.defaultMaxDepth,
        includeTestStrategy: partialConfig.includeTestStrategy
    };
    
    // Save the configuration to file
    const result = saveConfigurationToFile(fullConfig, partialConfig.outputPath!);
    
    if (result.success) {
        let prompt = `# Planning Configuration Created Successfully\n\n`;
        prompt += `Your planning configuration has been saved to: ${result.configPath}\n\n`;
        
        prompt += `## Configuration Summary\n`;
        prompt += `- **Name**: ${fullConfig.name}\n`;
        prompt += `- **Description**: ${fullConfig.description}\n`;
        prompt += `- **Version**: ${fullConfig.version}\n`;
        prompt += `- **Steps**: ${fullConfig.steps.length} step(s)\n`;
        if (fullConfig.defaultMaxDepth !== undefined) {
            prompt += `- **Default Max Depth**: ${fullConfig.defaultMaxDepth}\n`;
        }
        if (fullConfig.includeTestStrategy !== undefined) {
            prompt += `- **Include Test Strategy**: ${fullConfig.includeTestStrategy}\n`;
        }
        
        prompt += `\n## Using Your Configuration\n`;
        prompt += `You can now use this configuration with the planEpic tool by specifying:\n`;
        prompt += `\`configPath: "${result.configPath}"\`\n\n`;
        
        prompt += `Example:\n`;
        prompt += "```\n";
        prompt += `mcp_task-orchestrator_planEpic({
  description: "Your implementation description",
  configPath: "${result.configPath}"
})\n`;
        prompt += "```";
        
        return {
            content: [{ type: "text", text: prompt }],
            metadata: {
                configBuilderStep: PlanningConfigBuilderSteps.FINALIZATION,
                configId: configId,
                configPath: result.configPath,
                stepsCompleted: [...stepsCompleted, 'finalization'],
                isComplete: true
            }
        };
    } else {
        return {
            content: [{ 
                type: "text", 
                text: `Failed to save planning configuration: ${result.error}`
            }],
            metadata: {
                configBuilderStep: PlanningConfigBuilderSteps.FINALIZATION,
                configId: configId,
                stepsCompleted,
                error: result.error
            },
            isError: true
        };
    }
}

/**
 * Saves a configuration object to file
 */
function saveConfigurationToFile(config: any, outputPath: string): CreatePlanningConfigResponse {
    try {
        // Ensure the directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write the configuration to file
        fs.writeFileSync(
            outputPath,
            JSON.stringify(config, null, 2),
            'utf8'
        );
        
        return {
            success: true,
            configPath: outputPath
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message
        };
    }
} 