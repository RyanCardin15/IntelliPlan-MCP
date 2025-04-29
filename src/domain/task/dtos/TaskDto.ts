import type { Task, Subtask, TaskFile } from '../entities/Task.js';

/**
 * Task Data Transfer Objects
 * Used for transferring task data between layers
 */

/**
 * Basic task details for list views
 */
export interface TaskListItemDto {
  id: string;
  shortId: string;
  description: string;
  status: string;
  priority?: string;
  subtaskCount: number;
  completedSubtaskCount: number;
}

/**
 * Detailed task view
 */
export interface TaskDetailDto {
  id: string;
  description: string;
  status: string;
  priority?: string;
  complexity?: number;
  createdAt: string;
  updatedAt: string;
  subtasks: SubtaskDto[];
  files: TaskFileDto[];
  dependencies?: string[];
  dependents?: string[];
  testStrategy?: string;
  implementationPlan?: string;
}

/**
 * Subtask representation
 */
export interface SubtaskDto {
  id: string;
  shortId: string;
  description: string;
  status: string;
  createdAt: string;
}

/**
 * Task file representation
 */
export interface TaskFileDto {
  filePath: string;
  description?: string;
  addedAt: string;
}

/**
 * Task creation parameters
 */
export interface CreateTaskDto {
  description: string;
  goal?: string;
  steps?: string[];
  acceptanceCriteria?: string[];
  estimatedEffort?: string;
  priority?: 'low' | 'medium' | 'high';
  testStrategy?: string;
  createSubtasks?: boolean;
  autoExpandSubtasks?: boolean;
}

/**
 * Task update parameters
 */
export interface UpdateTaskDto {
  description?: string;
  status?: 'todo' | 'in-progress' | 'done';
  priority?: 'low' | 'medium' | 'high';
  complexity?: number;
}

/**
 * Task overview including dependencies
 */
export interface TaskOverviewDto {
  task: TaskDetailDto;
  dependencies: TaskListItemDto[];
  dependents: TaskListItemDto[];
  includeDiagrams?: boolean;
  verbosity: 'summary' | 'detailed' | 'full';
}

/**
 * Helper functions to convert between entity and DTO
 */
export class TaskMapper {
  /**
   * Convert a Task entity to a TaskListItemDto
   */
  static toListItem(task: Task): TaskListItemDto {
    return {
      id: task.id,
      shortId: task.id.substring(0, 8),
      description: task.description.split('\n')[0], // First line only
      status: task.status,
      priority: task.priority,
      subtaskCount: task.subtasks.length,
      completedSubtaskCount: task.subtasks.filter(s => s.status === 'done').length
    };
  }
  
  /**
   * Convert a Task entity to a TaskDetailDto
   */
  static toDetail(task: Task, dependentTaskIds?: string[]): TaskDetailDto {
    return {
      id: task.id,
      description: task.description,
      status: task.status,
      priority: task.priority,
      complexity: task.complexity,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      subtasks: task.subtasks.map(this.toSubtaskDto),
      files: task.files.map(this.toFileDto),
      dependencies: task.dependencies,
      dependents: dependentTaskIds,
      testStrategy: task.testStrategy,
      implementationPlan: task.implementationPlan
    };
  }
  
  /**
   * Convert a Subtask entity to a SubtaskDto
   */
  static toSubtaskDto(subtask: Subtask): SubtaskDto {
    return {
      id: subtask.id,
      shortId: subtask.id.substring(0, 8),
      description: subtask.description,
      status: subtask.status,
      createdAt: subtask.createdAt
    };
  }
  
  /**
   * Convert a TaskFile entity to a TaskFileDto
   */
  static toFileDto(file: TaskFile): TaskFileDto {
    return {
      filePath: file.filePath,
      description: file.description,
      addedAt: file.addedAt
    };
  }
} 