import type { Page } from "playwright";
import type { WorkerCommand, CommandResult } from "@dejsol/core";
import { executeNavigate } from "./commands/navigate.js";
import { executeClick } from "./commands/click.js";
import { executeType } from "./commands/type.js";
import { executeUpload } from "./commands/upload.js";
import { executeSelect } from "./commands/select.js";
import { executeScreenshot } from "./commands/screenshot.js";
import { executeDomSnapshot } from "./commands/dom-snapshot.js";
import { executeAccessibilityTree } from "./commands/accessibility-tree.js";
import { executeReadText } from "./commands/read-text.js";
import { executeWaitFor } from "./commands/wait-for.js";
import { executeClassifyPage } from "./commands/classify-page.js";
import { executeExtractFields } from "./commands/extract-fields.js";
import { executeExtractOptions } from "./commands/extract-options.js";
import { executeCheck } from "./commands/check.js";

export class BrowserWorker {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async execute(command: WorkerCommand): Promise<CommandResult> {
    switch (command.type) {
      case "NAVIGATE":
        return executeNavigate(this.page, command);
      case "CLICK":
        return executeClick(this.page, command);
      case "TYPE":
        return executeType(this.page, command);
      case "UPLOAD":
        return executeUpload(this.page, command);
      case "SELECT":
        return executeSelect(this.page, command);
      case "SCREENSHOT":
        return executeScreenshot(this.page, command);
      case "DOM_SNAPSHOT":
        return executeDomSnapshot(this.page, command);
      case "ACCESSIBILITY_TREE":
        return executeAccessibilityTree(this.page, command);
      case "READ_TEXT":
        return executeReadText(this.page, command);
      case "WAIT_FOR":
        return executeWaitFor(this.page, command);
      case "CLASSIFY_PAGE":
        return executeClassifyPage(this.page);
      case "EXTRACT_FIELDS":
        return executeExtractFields(this.page);
      case "EXTRACT_OPTIONS":
        return executeExtractOptions(this.page);
      case "CHECK":
        return executeCheck(this.page, command);
      default: {
        const _exhaustive: never = command;
        return {
          success: false,
          error: `Unknown command type: ${(_exhaustive as WorkerCommand).type}`,
          durationMs: 0,
        };
      }
    }
  }
}
