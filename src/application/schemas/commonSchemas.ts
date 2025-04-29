import { z } from "zod";

export const taskIdSchema = z.string().uuid().describe("The ID of the task.");
export const subtaskIdSchema = z.string().uuid().describe("The ID of the subtask.");
export const taskStatusSchema = z.enum(['todo', 'in-progress', 'done']).optional().describe("Task status");
export const subtaskStatusSchema = z.enum(['todo', 'done']).optional().describe("Subtask status");
export const descriptionSchema = z.string().describe("Description text");
export const prioritySchema = z.enum(['low', 'medium', 'high']).optional().describe("Priority level");
export const complexitySchema = z.number().int().min(1).max(10).optional().describe("Complexity score (1-10)"); 