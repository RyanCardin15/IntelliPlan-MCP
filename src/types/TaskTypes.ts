// src/types.ts

/**
 * Status options for Tasks and Epics
 */
export type Status = 'todo' | 'in-progress' | 'done';

/**
 * Priority levels for Tasks and Epics
 */
export type Priority = 'low' | 'medium' | 'high';

/**
 * Subtask definition (nested within a Task)
 */
export interface Subtask {
    id: string;
    description: string;
    status: 'todo' | 'done'; // Subtasks are simpler
    createdAt: string;
}

/**
 * Associated file information
 */
export interface AssociatedFile {
    filePath: string;
    description?: string;
    addedAt: string;
}

/**
 * Task definition (nested within an Epic)
 */
export interface Task {
    id: string;
    description: string;
    status: Status;
    priority?: Priority;
    createdAt: string;
    updatedAt: string;
    files: AssociatedFile[];
    subtasks: Subtask[]; // Tasks can have subtasks
    dependencies?: string[]; // IDs of Tasks or Epics this Task depends on
    testStrategy?: string;
    complexity?: number; // Estimated complexity score (1-10)
    implementationPlan?: string; // Detailed implementation plan
    tags?: string[];
    details?: string; // Detailed implementation notes
    dueDate?: string; // ISO date string
}

/**
 * Core Epic entity (top-level)
 */
export interface Epic {
    id: string;
    description: string;
    status: Status;
    priority?: Priority;
    createdAt: string;
    updatedAt: string;
    files: AssociatedFile[]; // Files associated directly with the Epic
    tasks: Task[]; // Epics contain Tasks
    dependencies?: string[]; // IDs of Epics this Epic depends on
    testStrategy?: string; // Overall test strategy for the Epic
    complexity?: number; // Estimated complexity score (1-10)
    implementationPlan?: string; // Overall plan for the Epic
    tags?: string[];
    details?: string; // High-level details for the Epic
    dueDate?: string; // ISO date string
}

/**
 * Epic store maps Epic ID to Epic object
 */
export interface EpicStore {
    [epicId: string]: Epic;
}

// Add a dummy value export to ensure the compiled JS file is not empty
export const _dummy = 0; 