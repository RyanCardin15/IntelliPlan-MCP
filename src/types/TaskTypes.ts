// src/types.ts

/**
 * Task status options
 */
export type TaskStatus = 'todo' | 'in-progress' | 'done';

/**
 * Subtask definition
 */
export interface Subtask {
    id: string;
    description: string;
    status: 'todo' | 'done';
    createdAt: string;
}

/**
 * File information attached to a task
 */
export interface TaskFile {
    filePath: string;
    description?: string;
    addedAt: string;
}

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'medium' | 'high';

/**
 * Core Task entity
 */
export interface Task {
    id: string;
    description: string;
    status: TaskStatus;
    priority?: TaskPriority;
    createdAt: string;
    updatedAt: string;
    files: TaskFile[];
    subtasks: Subtask[]; // Added subtasks array
    dependencies?: string[]; // IDs of tasks this task depends on
    testStrategy?: string;
    complexity?: number; // Estimated complexity score (1-10)
    implementationPlan?: string; // Detailed implementation plan
    tags?: string[];
    details?: string; // Detailed implementation notes
    dueDate?: string; // ISO date string
}

/**
 * Task store maps task ID to task object
 */
export interface TaskStore {
    [taskId: string]: Task;
} 