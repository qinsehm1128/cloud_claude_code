import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ContainerDetector {
  private containerId: string | null = null;

  constructor() {
    this.detectContainerId();
  }

  /**
   * Detect container ID from various sources:
   * 1. Environment variable CONTAINER_ID
   * 2. Environment variable HOSTNAME (often set to container ID in Docker)
   * 3. .containerid file in workspace
   * 4. /proc/self/cgroup (Linux containers)
   */
  public detectContainerId(): string | null {
    // Try environment variables first
    this.containerId = this.detectFromEnv();
    if (this.containerId) {
      return this.containerId;
    }

    // Try workspace file
    this.containerId = this.detectFromWorkspaceFile();
    if (this.containerId) {
      return this.containerId;
    }

    // Try cgroup (Linux)
    this.containerId = this.detectFromCgroup();
    if (this.containerId) {
      return this.containerId;
    }

    return null;
  }

  private detectFromEnv(): string | null {
    // Check explicit CONTAINER_ID env var
    const containerId = process.env.CONTAINER_ID;
    if (containerId && this.isValidContainerId(containerId)) {
      console.log('Container ID detected from CONTAINER_ID env var');
      return containerId;
    }

    // Check CC_CONTAINER_ID (our custom env var)
    const ccContainerId = process.env.CC_CONTAINER_ID;
    if (ccContainerId && this.isValidContainerId(ccContainerId)) {
      console.log('Container ID detected from CC_CONTAINER_ID env var');
      return ccContainerId;
    }

    // Check HOSTNAME (Docker sets this to container ID by default)
    const hostname = process.env.HOSTNAME;
    if (hostname && this.isValidContainerId(hostname)) {
      console.log('Container ID detected from HOSTNAME env var');
      return hostname;
    }

    return null;
  }

  private detectFromWorkspaceFile(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    for (const folder of workspaceFolders) {
      const containerIdFile = path.join(folder.uri.fsPath, '.containerid');
      try {
        if (fs.existsSync(containerIdFile)) {
          const containerId = fs.readFileSync(containerIdFile, 'utf8').trim();
          if (this.isValidContainerId(containerId)) {
            console.log('Container ID detected from .containerid file');
            return containerId;
          }
        }
      } catch {
        // Ignore file read errors
      }
    }

    return null;
  }

  private detectFromCgroup(): string | null {
    try {
      // This works on Linux containers
      const cgroupPath = '/proc/self/cgroup';
      if (!fs.existsSync(cgroupPath)) {
        return null;
      }

      const content = fs.readFileSync(cgroupPath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        // Docker cgroup format: 0::/docker/<container_id>
        const dockerMatch = line.match(/docker[/-]([a-f0-9]{64})/);
        if (dockerMatch) {
          console.log('Container ID detected from cgroup');
          return dockerMatch[1];
        }

        // Kubernetes/containerd format
        const containerdMatch = line.match(/containerd[/-]([a-f0-9]{64})/);
        if (containerdMatch) {
          console.log('Container ID detected from cgroup (containerd)');
          return containerdMatch[1];
        }
      }
    } catch {
      // Ignore errors (file doesn't exist on non-Linux systems)
    }

    return null;
  }

  private isValidContainerId(id: string): boolean {
    // Docker container IDs are 64 hex characters, but we also accept shorter IDs
    // and numeric IDs from our database
    if (/^[a-f0-9]{12,64}$/i.test(id)) {
      return true;
    }
    // Also accept numeric IDs (database container IDs)
    if (/^\d+$/.test(id)) {
      return true;
    }
    return false;
  }

  public getContainerId(): string | null {
    return this.containerId;
  }

  public setContainerId(id: string | null): void {
    this.containerId = id;
  }

  /**
   * Prompt user to enter container ID manually
   */
  public async promptForContainerId(): Promise<string | null> {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter the container ID to monitor',
      placeHolder: 'Container ID (e.g., 1 or abc123...)',
      validateInput: (value) => {
        if (!value) {
          return 'Container ID is required';
        }
        if (!this.isValidContainerId(value)) {
          return 'Invalid container ID format';
        }
        return null;
      },
    });

    if (input) {
      this.containerId = input;
      return input;
    }

    return null;
  }
}
