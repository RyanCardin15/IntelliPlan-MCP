import * as path from 'path';
import * as fs from 'fs/promises';

async function main() {
  try {
    // This is the specific task directory we're trying to create
    const taskId = 'test-task-' + Date.now();
    
    // Method 1: Using process.cwd()
    console.log('Method 1: Using process.cwd()');
    const cwd = process.cwd();
    console.log('Current working directory:', cwd);
    
    const tasksDir1 = path.join(cwd, 'tasks');
    const taskDir1 = path.join(tasksDir1, taskId);
    
    try {
      await fs.mkdir(tasksDir1, { recursive: true });
      console.log('Created tasks directory at:', tasksDir1);
      
      await fs.mkdir(taskDir1, { recursive: true });
      console.log('Created task directory at:', taskDir1);
    } catch (error) {
      console.error('Method 1 error:', error);
    }
    
    // Method 2: Using relative path
    console.log('\nMethod 2: Using relative path');
    const tasksDir2 = './tasks';
    const taskDir2 = path.join(tasksDir2, taskId + '-relative');
    
    try {
      await fs.mkdir(path.resolve(tasksDir2), { recursive: true });
      console.log('Created tasks directory at:', path.resolve(tasksDir2));
      
      await fs.mkdir(path.resolve(taskDir2), { recursive: true });
      console.log('Created task directory at:', path.resolve(taskDir2));
    } catch (error) {
      console.error('Method 2 error:', error);
    }
    
    // Method 3: Using absolute path
    console.log('\nMethod 3: Using absolute path');
    const tasksDir3 = '/tasks'; // This is likely the problematic path
    const taskDir3 = path.join(tasksDir3, taskId + '-absolute');
    
    try {
      await fs.mkdir(tasksDir3, { recursive: true });
      console.log('Created tasks directory at:', tasksDir3);
      
      await fs.mkdir(taskDir3, { recursive: true });
      console.log('Created task directory at:', taskDir3);
    } catch (error) {
      console.error('Method 3 error:', error);
    }
  } catch (error) {
    console.error('Main error:', error);
  }
}

main().catch(error => console.error('Uncaught error:', error)); 