import {
  type Epic, 
  type Task, 
  type Subtask, 
  type AssociatedFile,
  type Status,
  type Priority
} from '../entities/Task.js';

/**
 * Task Data Transfer Objects
 * Used for transferring task data between layers
 */

/**
 * Status options for Tasks and Epics
 */
export type StatusDto = 'todo' | 'in-progress' | 'done';

/**
 * Priority levels for Tasks and Epics
 */
export type PriorityDto = 'low' | 'medium' | 'high';

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
  description: string;
  status: 'todo' | 'done';
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
 * Associated file representation
 */
export interface AssociatedFileDto {
  filePath: string;
  description?: string;
  addedAt: string;
}

/**
 * Task representation (nested within an Epic)
 */
export interface TaskDto {
  id: string;
  description: string;
  status: StatusDto;
  priority?: PriorityDto;
  complexity?: number;
  createdAt: string;
  updatedAt: string;
  subtasks: SubtaskDto[];
  files: AssociatedFileDto[];
  dependencies?: string[];
  testStrategy?: string;
  implementationPlan?: string;
}

/**
 * Epic representation (top-level)
 */
export interface EpicDto {
  id: string;
  description: string;
  status: StatusDto;
  priority?: PriorityDto;
  complexity?: number;
  createdAt: string;
  updatedAt: string;
  tasks: TaskDto[]; // Epics contain Tasks
  files: AssociatedFileDto[];
  dependencies?: string[];
  testStrategy?: string;
  implementationPlan?: string;
}

/**
 * Request DTO for creating an Epic
 */
export interface CreateEpicRequestDto {
  description: string;
  priority?: PriorityDto;
  // ... other fields as needed
}

/**
 * Request DTO for creating a Task
 */
export interface CreateTaskRequestDto {
  epicId: string;
  description: string;
  priority?: PriorityDto;
  // ... other fields as needed
}

/**
 * Request DTO for creating a Subtask
 */
export interface CreateSubtaskRequestDto {
  epicId: string;
  taskId: string;
  description: string;
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
      description: subtask.description,
      status: subtask.status,
      createdAt: subtask.createdAt
    };
  }
  
  /**
   * Convert a TaskFile entity to a TaskFileDto
   */
  static toFileDto(file: AssociatedFile): TaskFileDto {
    return {
      filePath: file.filePath,
      description: file.description,
      addedAt: file.addedAt
    };
  }
} 