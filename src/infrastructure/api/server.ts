import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { json } from 'body-parser';
import type { Epic } from '../../domain/task/entities/Task.js';
import { FileEpicRepository } from '../persistence/FileEpicRepository.js';

export class ApiServer {
  private app: express.Application;
  private port: number;
  private epicRepository: FileEpicRepository;
  
  constructor(port: number = 3000, basePath: string = process.cwd()) {
    this.app = express();
    this.port = port;
    this.epicRepository = new FileEpicRepository(basePath);
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());
    
    // Rate limiting to prevent abuse
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per window
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);
    
    // Parse JSON bodies
    this.app.use(json());
  }
  
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' });
    });
    
    // Get all epics
    this.app.get('/epics', async (req: Request, res: Response) => {
      try {
        const epics = this.epicRepository.getAllEpics();
        res.status(200).json(epics);
      } catch (error) {
        console.error('Error getting epics:', error);
        res.status(500).json({ error: 'Failed to get epics' });
      }
    });
    
    // Get epic by ID
    this.app.get('/epics/:id', (req: Request, res: Response) => {
      try {
        const epic = this.epicRepository.getEpicById(req.params.id);
        if (!epic) {
          return res.status(404).json({ error: 'Epic not found' });
        }
        res.status(200).json(epic);
      } catch (error) {
        console.error('Error getting epic:', error);
        res.status(500).json({ error: 'Failed to get epic' });
      }
    });
    
    // Create a new epic
    this.app.post('/epics', (req: Request, res: Response) => {
      try {
        const epic = req.body as Epic;
        const success = this.epicRepository.addEpic(epic);
        if (!success) {
          return res.status(400).json({ error: 'Failed to add epic' });
        }
        
        // Save changes to disk
        this.epicRepository.saveEpics()
          .catch(err => console.error('Error saving epics after add:', err));
          
        res.status(201).json(epic);
      } catch (error) {
        console.error('Error adding epic:', error);
        res.status(500).json({ error: 'Failed to add epic' });
      }
    });
    
    // Update an epic
    this.app.put('/epics/:id', (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        const epic = req.body as Epic;
        
        if (id !== epic.id) {
          return res.status(400).json({ error: 'Epic ID mismatch' });
        }
        
        const success = this.epicRepository.updateEpic(id, epic);
        if (!success) {
          return res.status(404).json({ error: 'Epic not found' });
        }
        
        // Save changes to disk
        this.epicRepository.saveEpics()
          .catch(err => console.error('Error saving epics after update:', err));
          
        res.status(200).json(epic);
      } catch (error) {
        console.error('Error updating epic:', error);
        res.status(500).json({ error: 'Failed to update epic' });
      }
    });
    
    // Delete an epic
    this.app.delete('/epics/:id', (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        const success = this.epicRepository.deleteEpic(id);
        
        if (!success) {
          return res.status(404).json({ error: 'Epic not found' });
        }
        
        // Save changes to disk
        this.epicRepository.saveEpics()
          .catch(err => console.error('Error saving epics after delete:', err));
          
        res.status(204).send();
      } catch (error) {
        console.error('Error deleting epic:', error);
        res.status(500).json({ error: 'Failed to delete epic' });
      }
    });
    
    // Batch update epics
    this.app.post('/epics/batch', async (req: Request, res: Response) => {
      try {
        const epics = req.body as Epic[];
        
        // Replace all epics with the new batch
        // This is a simple implementation - in a real system, you might want more validation
        for (const epic of epics) {
          if (this.epicRepository.getEpicById(epic.id)) {
            this.epicRepository.updateEpic(epic.id, epic);
          } else {
            this.epicRepository.addEpic(epic);
          }
        }
        
        // Save changes to disk
        await this.epicRepository.saveEpics();
        
        res.status(200).json({ success: true });
      } catch (error) {
        console.error('Error in batch update:', error);
        res.status(500).json({ error: 'Failed to process batch update' });
      }
    });
  }
  
  public async start(): Promise<void> {
    try {
      // Load existing epics
      await this.epicRepository.loadEpics();
      
      // Start the server
      this.app.listen(this.port, () => {
        console.log(`API server listening on port ${this.port}`);
      });
    } catch (error) {
      console.error('Failed to start API server:', error);
      throw error;
    }
  }
} 