import { v4 as uuidv4 } from 'uuid';
import type { Task, Subtask } from '../entities/Task.js';
import type { TaskRepository } from '../repositories/TaskRepository.js';

/**
 * Task Service
 * Contains core business logic for task operations
 */
export class TaskService {
  constructor(private taskRepository: TaskRepository) {}
  
  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return this.taskRepository.getAllTasks();
  }
  
  /**
   * Get a task by ID
   */
  getTaskById(id: string): Task | undefined {
    return this.taskRepository.getTaskById(id);
  }
  
  /**
   * Create a new task with its properties
   */
  async createTask(params: {
    description: string,
    goal?: string,
    steps?: string[],
    acceptanceCriteria?: string[],
    estimatedEffort?: string,
    priority?: 'low' | 'medium' | 'high',
    testStrategy?: string,
    createSubtasks?: boolean
  }): Promise<{ task: Task, message: string }> {
    const {
      description,
      goal,
      steps,
      acceptanceCriteria,
      estimatedEffort,
      priority,
      testStrategy,
      createSubtasks = steps ? true : false
    } = params;
    
    const taskId = uuidv4();
    const now = new Date().toISOString();
    
    // Format a detailed description with sections
    let finalDescription = description;
    if (goal || steps || acceptanceCriteria || estimatedEffort || testStrategy) {
      const sections = [
        `# ${description}`,
        goal ? `## Goal\n${goal}` : null,
        steps ? `## Steps\n${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}` : null,
        acceptanceCriteria ? `## Acceptance Criteria\n${acceptanceCriteria.map((c) => `- ${c}`).join('\n')}` : null,
        estimatedEffort ? `## Estimated Effort\n${estimatedEffort}` : null,
        testStrategy ? `## Test Strategy\n${testStrategy}` : null
      ].filter(Boolean);
      finalDescription = sections.join('\n\n');
    }
    
    // Create subtasks if steps are provided and createSubtasks is true
    let subtasks: Subtask[] = [];
    if (createSubtasks && steps && steps.length > 0) {
      subtasks = steps.map(step => ({
        id: uuidv4(),
        description: step,
        status: 'todo',
        createdAt: now
      }));
    }
    
    const newTask: Task = {
      id: taskId,
      description: finalDescription,
      status: 'todo',
      createdAt: now,
      updatedAt: now,
      files: [],
      subtasks,
      priority,
      testStrategy
    };
    
    const success = this.taskRepository.addTask(newTask);
    if (!success) {
      throw new Error(`Failed to create task: ${taskId}`);
    }
    
    await this.taskRepository.saveTasks();
    
    return {
      task: newTask,
      message: `Task created with ID: ${taskId}` + 
               (subtasks.length > 0 ? ` with ${subtasks.length} subtasks.` : '')
    };
  }
  
  /**
   * Update an existing task
   */
  async updateTask(
    taskId: string, 
    updates: Partial<Pick<Task, 'description' | 'status' | 'priority' | 'complexity'>>
  ): Promise<{ success: boolean, message: string }> {
    const task = this.getTaskById(taskId);
    if (!task) {
      return { success: false, message: `Error: Task ${taskId} not found.` };
    }
    
    let updated = false;
    const updatedFields: string[] = [];
    const updatedTask = { ...task };
    
    // Process each update field
    if (updates.description !== undefined && task.description !== updates.description) {
      updatedTask.description = updates.description;
      updatedFields.push('description');
      updated = true;
    }
    
    if (updates.status !== undefined && task.status !== updates.status) {
      updatedTask.status = updates.status;
      updatedFields.push('status');
      updated = true;
    }
    
    if (updates.priority !== undefined && task.priority !== updates.priority) {
      updatedTask.priority = updates.priority;
      updatedFields.push('priority');
      updated = true;
    }
    
    if (updates.complexity !== undefined && task.complexity !== updates.complexity) {
      updatedTask.complexity = updates.complexity;
      updatedFields.push('complexity');
      updated = true;
    }
    
    if (!updated) {
      return { success: true, message: `No changes made to task ${taskId}.` };
    }
    
    // Update timestamp
    updatedTask.updatedAt = new Date().toISOString();
    
    // Save the changes
    const success = this.taskRepository.updateTask(taskId, updatedTask);
    if (!success) {
      return { success: false, message: `Error updating task ${taskId}.` };
    }
    
    await this.taskRepository.saveTasks();
    
    return { 
      success: true, 
      message: `Updated ${updatedFields.join(', ')} for task ${taskId}.` 
    };
  }
  
  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<{ success: boolean, message: string }> {
    const deleted = this.taskRepository.deleteTask(taskId);
    if (!deleted) {
      return { success: false, message: `Error: Task ${taskId} not found.` };
    }
    
    await this.taskRepository.saveTasks();
    return { success: true, message: `Task ${taskId} deleted successfully.` };
  }
  
  /**
   * Add a dependency between tasks
   */
  async addDependency(
    taskId: string, 
    dependsOnId: string
  ): Promise<{ success: boolean, message: string }> {
    const task = this.getTaskById(taskId);
    if (!task) {
      return { success: false, message: `Error: Task ${taskId} not found.` };
    }
    
    const dependencyTask = this.getTaskById(dependsOnId);
    if (!dependencyTask) {
      return { success: false, message: `Error: Dependency task ${dependsOnId} not found.` };
    }
    
    // Cannot depend on itself
    if (taskId === dependsOnId) {
      return { success: false, message: `Error: A task cannot depend on itself.` };
    }
    
    // Initialize dependencies array if needed
    const updatedTask = { ...task };
    if (!updatedTask.dependencies) {
      updatedTask.dependencies = [];
    }
    
    // Check if dependency already exists
    if (updatedTask.dependencies.includes(dependsOnId)) {
      return { success: true, message: `Task ${taskId} already depends on ${dependsOnId}.` };
    }
    
    // Add the dependency
    updatedTask.dependencies.push(dependsOnId);
    updatedTask.updatedAt = new Date().toISOString();
    
    // Save the changes
    const success = this.taskRepository.updateTask(taskId, updatedTask);
    if (!success) {
      return { success: false, message: `Error adding dependency from ${taskId} to ${dependsOnId}.` };
    }
    
    await this.taskRepository.saveTasks();
    
    return { 
      success: true, 
      message: `Added dependency: Task ${taskId} now depends on ${dependsOnId}.` 
    };
  }
  
  /**
   * Remove a dependency between tasks
   */
  async removeDependency(
    taskId: string, 
    dependsOnId: string
  ): Promise<{ success: boolean, message: string }> {
    const task = this.getTaskById(taskId);
    if (!task) {
      return { success: false, message: `Error: Task ${taskId} not found.` };
    }
    
    // Check if the dependency exists
    if (!task.dependencies || !task.dependencies.includes(dependsOnId)) {
      return { success: true, message: `Task ${taskId} does not depend on ${dependsOnId}.` };
    }
    
    // Remove the dependency
    const updatedTask = { 
      ...task, 
      dependencies: task.dependencies.filter(dep => dep !== dependsOnId),
      updatedAt: new Date().toISOString()
    };
    
    // Save the changes
    const success = this.taskRepository.updateTask(taskId, updatedTask);
    if (!success) {
      return { success: false, message: `Error removing dependency from ${taskId} to ${dependsOnId}.` };
    }
    
    await this.taskRepository.saveTasks();
    
    return { 
      success: true, 
      message: `Removed dependency: Task ${taskId} no longer depends on ${dependsOnId}.` 
    };
  }
  
  /**
   * Add a subtask to a task
   */
  async createSubtask(
    params: {
      parentTaskId: string,
      description: string,
      status?: 'todo' | 'done'
    }
  ): Promise<{ success: boolean, message: string, subtaskId?: string }> {
    const { parentTaskId, description, status = 'todo' } = params;
    
    const task = this.getTaskById(parentTaskId);
    if (!task) {
      return { success: false, message: `Error: Parent task ${parentTaskId} not found.` };
    }
    
    const subtaskId = uuidv4();
    const now = new Date().toISOString();
    
    const newSubtask: Subtask = {
      id: subtaskId,
      description,
      status,
      createdAt: now
    };
    
    const updatedTask = { 
      ...task, 
      subtasks: [...task.subtasks, newSubtask],
      updatedAt: now
    };
    
    const success = this.taskRepository.updateTask(parentTaskId, updatedTask);
    if (!success) {
      return { success: false, message: `Error adding subtask to ${parentTaskId}.` };
    }
    
    await this.taskRepository.saveTasks();
    
    return { 
      success: true, 
      message: `Subtask added to task ${parentTaskId}.`,
      subtaskId
    };
  }
  
  /**
   * Update a subtask
   */
  async updateSubtask(
    params: {
      parentTaskId: string,
      subtaskId: string,
      description?: string,
      status?: 'todo' | 'done'
    }
  ): Promise<{ success: boolean, message: string }> {
    const { parentTaskId, subtaskId, description, status } = params;
    
    const task = this.getTaskById(parentTaskId);
    if (!task) {
      return { success: false, message: `Error: Parent task ${parentTaskId} not found.` };
    }
    
    const subtaskIndex = task.subtasks.findIndex(st => st.id === subtaskId);
    if (subtaskIndex === -1) {
      return { success: false, message: `Error: Subtask ${subtaskId} not found in task ${parentTaskId}.` };
    }
    
    // Only update fields that were provided
    const updatedSubtask = { ...task.subtasks[subtaskIndex] };
    let updated = false;
    
    if (description !== undefined && updatedSubtask.description !== description) {
      updatedSubtask.description = description;
      updated = true;
    }
    
    if (status !== undefined && updatedSubtask.status !== status) {
      updatedSubtask.status = status;
      updated = true;
    }
    
    if (!updated) {
      return { success: true, message: `No changes to subtask ${subtaskId}.` };
    }
    
    // Create new arrays to avoid mutating the original
    const updatedSubtasks = [...task.subtasks];
    updatedSubtasks[subtaskIndex] = updatedSubtask;
    
    const updatedTask = { 
      ...task, 
      subtasks: updatedSubtasks,
      updatedAt: new Date().toISOString() 
    };
    
    const success = this.taskRepository.updateTask(parentTaskId, updatedTask);
    if (!success) {
      return { success: false, message: `Error updating subtask ${subtaskId}.` };
    }
    
    await this.taskRepository.saveTasks();
    
    return { 
      success: true, 
      message: `Subtask ${subtaskId} updated successfully.` 
    };
  }
  
  /**
   * Delete a subtask
   */
  async deleteSubtask(
    params: {
      parentTaskId: string,
      subtaskId: string
    }
  ): Promise<{ success: boolean, message: string }> {
    const { parentTaskId, subtaskId } = params;
    
    const task = this.getTaskById(parentTaskId);
    if (!task) {
      return { success: false, message: `Error: Parent task ${parentTaskId} not found.` };
    }
    
    const initialLength = task.subtasks.length;
    const updatedSubtasks = task.subtasks.filter(st => st.id !== subtaskId);
    
    if (updatedSubtasks.length === initialLength) {
      return { success: false, message: `Error: Subtask ${subtaskId} not found in task ${parentTaskId}.` };
    }
    
    const updatedTask = { 
      ...task, 
      subtasks: updatedSubtasks, 
      updatedAt: new Date().toISOString() 
    };
    
    const success = this.taskRepository.updateTask(parentTaskId, updatedTask);
    if (!success) {
      return { success: false, message: `Error deleting subtask ${subtaskId}.` };
    }
    
    await this.taskRepository.saveTasks();
    
    return { 
      success: true, 
      message: `Subtask ${subtaskId} deleted successfully.` 
    };
  }
  
  /**
   * Add a file to a task
   */
  async addFile(
    params: {
      taskId: string,
      filePath: string,
      description?: string
    }
  ): Promise<{ success: boolean, message: string }> {
    const { taskId, filePath, description } = params;
    
    const task = this.getTaskById(taskId);
    if (!task) {
      return { success: false, message: `Error: Task ${taskId} not found.` };
    }
    
    // Check if file already exists
    if (task.files.some(f => f.filePath === filePath)) {
      return { success: true, message: `File ${filePath} already attached to task ${taskId}.` };
    }
    
    // Add the file
    const updatedTask = { 
      ...task, 
      files: [
        ...task.files, 
        { 
          filePath, 
          description, 
          addedAt: new Date().toISOString() 
        }
      ],
      updatedAt: new Date().toISOString()
    };
    
    const success = this.taskRepository.updateTask(taskId, updatedTask);
    if (!success) {
      return { success: false, message: `Error adding file to task ${taskId}.` };
    }
    
    await this.taskRepository.saveTasks();
    
    return { 
      success: true, 
      message: `File ${filePath} added to task ${taskId}.`
    };
  }
  
  /**
   * Remove a file from a task
   */
  async removeFile(
    params: {
      taskId: string,
      filePath: string
    }
  ): Promise<{ success: boolean, message: string }> {
    const { taskId, filePath } = params;
    
    const task = this.getTaskById(taskId);
    if (!task) {
      return { success: false, message: `Error: Task ${taskId} not found.` };
    }
    
    // Check if file exists
    const initialFileCount = task.files.length;
    const updatedFiles = task.files.filter(f => f.filePath !== filePath);
    
    if (updatedFiles.length === initialFileCount) {
      return { success: true, message: `File ${filePath} not found in task ${taskId}.` };
    }
    
    // Update the task
    const updatedTask = { 
      ...task, 
      files: updatedFiles,
      updatedAt: new Date().toISOString()
    };
    
    const success = this.taskRepository.updateTask(taskId, updatedTask);
    if (!success) {
      return { success: false, message: `Error removing file from task ${taskId}.` };
    }
    
    await this.taskRepository.saveTasks();
    
    return { 
      success: true, 
      message: `File ${filePath} removed from task ${taskId}.` 
    };
  }
} 