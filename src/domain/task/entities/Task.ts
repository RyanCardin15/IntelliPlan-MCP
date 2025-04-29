/**
 * Task domain entities
 * These types represent the core domain objects in the task management system
 */

/**
 * Represents a subtask within a parent task
 */
export interface Subtask {
  id: string;
  description: string;
  status: 'todo' | 'done';
  createdAt: string;
}

/**
 * Represents a file attached to a task
 */
export interface TaskFile {
  filePath: string;
  description?: string;
  addedAt: string;
}

/**
 * The main Task entity that represents a unit of work
 */
export interface Task {
  id: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  priority?: 'low' | 'medium' | 'high';
  complexity?: number;
  createdAt: string;
  updatedAt: string;
  subtasks: Subtask[];
  files: TaskFile[];
  dependencies?: string[];
  testStrategy?: string;
  implementationPlan?: string;
}

/**
 * A hash map of task IDs to tasks
 */
export interface TaskStore {
  [id: string]: Task;
} 