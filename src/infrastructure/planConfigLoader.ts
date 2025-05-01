import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import type { PlanConfiguration, LoadPlanConfigResult } from '../types/PlanConfigTypes.js';

// Zod schema for validating plan steps
const planStepSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    order: z.number().int().min(0),
    instructions: z.array(z.string()),
    thinkingPrompts: z.array(z.string()),
    nextStepPrompt: z.string(),
    requiresPreviousStepData: z.boolean()
});

// Zod schema for validating entire plan configuration
const planConfigurationSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    version: z.string(),
    steps: z.array(planStepSchema),
    defaultMaxDepth: z.number().int().min(1).optional(),
    includeTestStrategy: z.boolean().optional()
});

/**
 * Loads and validates a plan configuration from a JSON file
 * 
 * @param configPath Path to the configuration JSON file
 * @returns Result containing the loaded configuration or error
 */
export function loadPlanConfiguration(configPath: string): LoadPlanConfigResult {
    try {
        // Check if file exists
        if (!fs.existsSync(configPath)) {
            return {
                success: false,
                error: `Configuration file not found: ${configPath}`
            };
        }

        // Read and parse the file
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const configJson = JSON.parse(configContent);
        
        // Validate against schema
        const validationResult = planConfigurationSchema.safeParse(configJson);
        
        if (!validationResult.success) {
            return {
                success: false,
                error: `Invalid configuration format: ${validationResult.error.message}`
            };
        }
        
        // Sort steps by order to ensure they're in correct sequence
        const config = validationResult.data;
        config.steps.sort((a, b) => a.order - b.order);
        
        return {
            success: true,
            configuration: config
        };
    } catch (error: any) {
        return {
            success: false,
            error: `Failed to load configuration: ${error.message}`
        };
    }
}

/**
 * Gets a list of available plan configurations in the given directory
 * 
 * @param configDir Directory containing plan configuration JSON files
 * @returns Array of available configuration file names
 */
export function getAvailableConfigurations(configDir: string): string[] {
    try {
        if (!fs.existsSync(configDir)) {
            return [];
        }
        
        // Get all JSON files in the directory
        return fs.readdirSync(configDir)
            .filter(file => file.endsWith('.json'))
            .map(file => path.join(configDir, file));
    } catch (error) {
        return [];
    }
}

/**
 * Default implementation plan configuration
 * This is used when no custom configuration is provided
 */
export const DEFAULT_PLAN_CONFIGURATION: PlanConfiguration = {
    id: "default-implementation-plan",
    name: "Default Implementation Planning",
    description: "Standard step-by-step planning process for implementation",
    version: "1.0",
    defaultMaxDepth: 3,
    includeTestStrategy: true,
    steps: [
        {
            id: "initialization",
            name: "Initialization",
            description: "Getting started with planning process",
            order: 0,
            instructions: [
                "Review the project goal and details",
                "Understand the scope of work",
                "Consider initial resources needed"
            ],
            thinkingPrompts: [
                "What is the overall purpose of this implementation?",
                "What high-level challenges might we face?"
            ],
            nextStepPrompt: "Call planEpic again with currentStep = 1 and planSummary = \"Starting requirements analysis\"",
            requiresPreviousStepData: false
        },
        {
            id: "requirement_analysis",
            name: "Requirements Analysis",
            description: "Identify and categorize all requirements",
            order: 1,
            instructions: [
                "Analyze project requirements thoroughly",
                "Identify functional requirements",
                "Identify non-functional requirements",
                "Note constraints/assumptions",
                "Prioritize requirements"
            ],
            thinkingPrompts: [
                "What does this project need to accomplish?",
                "What are the technical constraints?"
            ],
            nextStepPrompt: "Call planEpic with currentStep = 2 and planSummary = \"Requirements analyzed: [key requirements]\"",
            requiresPreviousStepData: true
        },
        {
            id: "component_breakdown",
            name: "Component Breakdown",
            description: "Break down into major components",
            order: 2,
            instructions: [
                "Think through all major components needed",
                "Determine purpose and responsibility of each component",
                "Consider how components interact with each other",
                "Consider technical architecture where relevant"
            ],
            thinkingPrompts: [
                "What logical parts make up this system?",
                "How do these components connect?"
            ],
            nextStepPrompt: "Call planEpic with currentStep = 3 and planSummary = \"Components identified: [list main components]\"",
            requiresPreviousStepData: true
        },
        {
            id: "task_detailing",
            name: "Task Detailing",
            description: "Create specific tasks for each component",
            order: 3,
            instructions: [
                "For each component from the previous step, define concrete tasks",
                "Break down complex tasks into hierarchical subtasks",
                "Make tasks specific and actionable",
                "Assign complexity (1-10) to each task"
            ],
            thinkingPrompts: [
                "What work needs to be done for each component?",
                "How can this work be broken down?"
            ],
            nextStepPrompt: "Call planEpic with currentStep = 4 and planSummary = \"Tasks defined: [X] tasks across [Y] components\"",
            requiresPreviousStepData: true
        },
        {
            id: "dependency_mapping",
            name: "Dependency Mapping",
            description: "Identify dependencies between tasks",
            order: 4,
            instructions: [
                "Identify task dependencies - which tasks must be completed before others",
                "Map out dependencies between components and tasks",
                "Identify critical path tasks",
                "Consider external dependencies (APIs, services, etc.)"
            ],
            thinkingPrompts: [
                "What is the logical order of implementation?",
                "What are the blockers?"
            ],
            nextStepPrompt: "Call planEpic with currentStep = 5 and planSummary = \"Dependencies mapped: [key dependencies]\"",
            requiresPreviousStepData: true
        },
        {
            id: "implementation_details",
            name: "Implementation Details",
            description: "Add implementation guidance",
            order: 5,
            instructions: [
                "Add technical implementation details for key tasks",
                "Include specific approaches, patterns, or techniques",
                "Consider error handling, edge cases, and resilience",
                "Address potential technical challenges"
            ],
            thinkingPrompts: [
                "How should each part be implemented?",
                "What technical decisions need to be made?"
            ],
            nextStepPrompt: "Call planEpic with currentStep = 6 and planSummary = \"Implementation details added for [X] components\"",
            requiresPreviousStepData: true
        },
        {
            id: "test_strategy",
            name: "Test Strategy",
            description: "Develop testing approach",
            order: 6,
            instructions: [
                "Develop overall testing strategy",
                "Plan unit tests for key components",
                "Consider integration testing approach",
                "Plan for end-to-end or acceptance tests",
                "Consider test data needs"
            ],
            thinkingPrompts: [
                "How will we verify correctness?",
                "What testing approaches are most appropriate?"
            ],
            nextStepPrompt: "Call planEpic with currentStep = 7 and planSummary = \"Test strategy defined with [approach] for [components]\"",
            requiresPreviousStepData: true
        },
        {
            id: "finalization",
            name: "Finalization",
            description: "Complete the planning process",
            order: 7,
            instructions: [
                "Review the complete plan",
                "Ensure all tasks are properly defined",
                "Verify dependencies are correctly mapped",
                "Finalize implementation details and test strategy"
            ],
            thinkingPrompts: [
                "Is the plan comprehensive and feasible?",
                "Have we missed anything important?"
            ],
            nextStepPrompt: "Complete planning and create Epic using batchEpic tool",
            requiresPreviousStepData: true
        }
    ]
}; 