/*
 * Copyright (c) 2017, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { getTestResultsFolder, ActivationTracker } from '@salesforce/salesforcedx-utils-vscode';
import * as path from 'path';
import * as vscode from 'vscode';
import { ApexLanguageClient } from './apexLanguageClient';
import ApexLSPStatusBarItem from './apexLspStatusBarItem';
import { CodeCoverage, StatusBarToggle } from './codecoverage';

console.log('Geeta- Starting index.ts for Apex Extension');

class Logger {
  private static timestamps: Map<string, number> = new Map();

  static logWithTimestamp(message: string) {
    const now = new Date();
    const timestamp = now.toISOString();
    console.log(`[${timestamp}] ${message}`);
  }

  static startTiming(eventName: string) {
    const now = new Date();
    this.timestamps.set(eventName, now.getTime());
    this.logWithTimestamp(`Started timing event: ${eventName}`);
  }

  static endTiming(eventName: string) {
    const now = new Date();
    const endTime = now.getTime();
    const startTime = this.timestamps.get(eventName);

    if (startTime) {
      const duration = endTime - startTime;
      this.logWithTimestamp(`Event ${eventName} took ${duration} ms`);
      this.timestamps.delete(eventName); // Optionally clear the start time
    } else {
      this.logWithTimestamp(`No start time found for event: ${eventName}`);
    }
  }
}

Logger.startTiming('T00 Import Apex related libraries');

import {
  anonApexDebug,
  anonApexExecute,
  apexDebugClassRunCodeActionDelegate,
  apexDebugMethodRunCodeActionDelegate,
  apexLogGet,
  apexTestClassRunCodeAction,
  apexTestClassRunCodeActionDelegate,
  apexTestMethodRunCodeAction,
  apexTestMethodRunCodeActionDelegate,
  apexTestRun,
  apexTestSuiteAdd,
  apexTestSuiteCreate,
  apexTestSuiteRun,
  launchApexReplayDebuggerWithCurrentFile
} from './commands';
import { API, SET_JAVA_DOC_LINK } from './constants';
import { workspaceContext } from './context';
import * as languageServer from './languageServer';
import { languageServerOrphanHandler as lsoh } from './languageServerOrphanHandler';
import {
  ClientStatus,
  enableJavaDocSymbols,
  extensionUtils,
  getApexTests,
  getExceptionBreakpointInfo,
  getLineBreakpointInfo,
  languageClientUtils
} from './languageUtils';
import { nls } from './messages';
import { retrieveEnableSyncInitJobs } from './settings';
import { getTelemetryService } from './telemetry/telemetry';
import { getTestOutlineProvider, TestNode } from './views/testOutlineProvider';
import { ApexTestRunner, TestRunType } from './views/testRunner';

Logger.endTiming('T00 Import Apex related libraries');

export const activate = async (extensionContext: vscode.ExtensionContext) => {
  Logger.startTiming('T01 Activate Function');
  Logger.startTiming('T01_0 initialization steps in activate function');
  const telemetryService = await getTelemetryService();
  if (!telemetryService) {
    throw new Error('Could not fetch a telemetry service instance');
  }

  // Telemetry
  await telemetryService.initializeService(extensionContext);

  const activationTracker = new ActivationTracker(extensionContext, telemetryService);

  const languageServerStatusBarItem = new ApexLSPStatusBarItem();
  const testOutlineProvider = getTestOutlineProvider();
  if (vscode.workspace && vscode.workspace.workspaceFolders) {
    const apexDirPath = getTestResultsFolder(vscode.workspace.workspaceFolders[0].uri.fsPath, 'apex');

    const testResultOutput = path.join(apexDirPath, '*.json');
    const testResultFileWatcher = vscode.workspace.createFileSystemWatcher(testResultOutput);
    testResultFileWatcher.onDidCreate(uri => testOutlineProvider.onResultFileCreate(apexDirPath, uri.fsPath));
    testResultFileWatcher.onDidChange(uri => testOutlineProvider.onResultFileCreate(apexDirPath, uri.fsPath));

    extensionContext.subscriptions.push(testResultFileWatcher);
  } else {
    throw new Error(nls.localize('cannot_determine_workspace'));
  }

  // Workspace Context
  await workspaceContext.initialize(extensionContext);
  Logger.endTiming('T01_0 initialization steps in activate function');
  Logger.startTiming('T01_1 start the language server and client');
  // start the language server and client
  await createLanguageClient(extensionContext, languageServerStatusBarItem);
  Logger.endTiming('T01_1 start the language server and client');
  // Javadoc support
  Logger.startTiming('T01_2 enable Javadoc support');
  enableJavaDocSymbols();
  Logger.endTiming('T01_2 enable Javadoc support');
  // Commands
  Logger.startTiming('T01_3 Register Commands in the activate function');
  const commands = registerCommands();
  extensionContext.subscriptions.push(commands);
  Logger.endTiming('T01_3 Register Commands in the activate function');
  Logger.startTiming('T01_4 Register Test View in the activate function');
  extensionContext.subscriptions.push(registerTestView());
  Logger.endTiming('T01_4 Register Test View in the activate function');
  const exportedApi = {
    getLineBreakpointInfo,
    getExceptionBreakpointInfo,
    getApexTests,
    languageClientUtils
  };

  void activationTracker.markActivationStop(new Date());
  Logger.startTiming('T01_5 setImmediate resolveAnyFoundOrphanLanguageServers');
  setImmediate(() => {
    // Resolve any found orphan language servers in the background
    void lsoh.resolveAnyFoundOrphanLanguageServers();
  });
  Logger.endTiming('T01_5 setImmediate resolveAnyFoundOrphanLanguageServers');
  Logger.endTiming('T01 Activate Function');
  return exportedApi;
};

const registerCommands = (): vscode.Disposable => {
  // Colorize code coverage
  const statusBarToggle = new StatusBarToggle();
  const colorizer = new CodeCoverage(statusBarToggle);
  const apexToggleColorizerCmd = vscode.commands.registerCommand('sf.apex.toggle.colorizer', () =>
    colorizer.toggleCoverage()
  );

  // Customer-facing commands
  const apexTestClassRunDelegateCmd = vscode.commands.registerCommand(
    'sf.apex.test.class.run.delegate',
    apexTestClassRunCodeActionDelegate
  );
  const apexTestLastClassRunCmd = vscode.commands.registerCommand(
    'sf.apex.test.last.class.run',
    apexTestClassRunCodeAction
  );
  const apexTestClassRunCmd = vscode.commands.registerCommand('sf.apex.test.class.run', apexTestClassRunCodeAction);
  const apexTestMethodRunDelegateCmd = vscode.commands.registerCommand(
    'sf.apex.test.method.run.delegate',
    apexTestMethodRunCodeActionDelegate
  );
  const apexDebugClassRunDelegateCmd = vscode.commands.registerCommand(
    'sf.apex.debug.class.run.delegate',
    apexDebugClassRunCodeActionDelegate
  );
  const apexDebugMethodRunDelegateCmd = vscode.commands.registerCommand(
    'sf.apex.debug.method.run.delegate',
    apexDebugMethodRunCodeActionDelegate
  );
  const anonApexRunDelegateCmd = vscode.commands.registerCommand('sf.anon.apex.run.delegate', anonApexExecute);
  const anonApexDebugDelegateCmd = vscode.commands.registerCommand('sf.anon.apex.debug.delegate', anonApexDebug);
  const apexLogGetCmd = vscode.commands.registerCommand('sf.apex.log.get', apexLogGet);
  const apexTestLastMethodRunCmd = vscode.commands.registerCommand(
    'sf.apex.test.last.method.run',
    apexTestMethodRunCodeAction
  );
  const apexTestMethodRunCmd = vscode.commands.registerCommand('sf.apex.test.method.run', apexTestMethodRunCodeAction);
  const apexTestSuiteCreateCmd = vscode.commands.registerCommand('sf.apex.test.suite.create', apexTestSuiteCreate);
  const apexTestSuiteRunCmd = vscode.commands.registerCommand('sf.apex.test.suite.run', apexTestSuiteRun);
  const apexTestSuiteAddCmd = vscode.commands.registerCommand('sf.apex.test.suite.add', apexTestSuiteAdd);
  const apexTestRunCmd = vscode.commands.registerCommand('sf.apex.test.run', apexTestRun);
  const anonApexExecuteDocumentCmd = vscode.commands.registerCommand('sf.anon.apex.execute.document', anonApexExecute);
  const anonApexDebugDocumentCmd = vscode.commands.registerCommand('sf.apex.debug.document', anonApexDebug);
  const anonApexExecuteSelectionCmd = vscode.commands.registerCommand(
    'sf.anon.apex.execute.selection',
    anonApexExecute
  );
  const launchApexReplayDebuggerWithCurrentFileCmd = vscode.commands.registerCommand(
    'sf.launch.apex.replay.debugger.with.current.file',
    launchApexReplayDebuggerWithCurrentFile
  );

  return vscode.Disposable.from(
    anonApexDebugDelegateCmd,
    anonApexDebugDocumentCmd,
    anonApexExecuteDocumentCmd,
    anonApexExecuteSelectionCmd,
    anonApexRunDelegateCmd,
    apexDebugClassRunDelegateCmd,
    apexDebugMethodRunDelegateCmd,
    apexLogGetCmd,
    apexTestClassRunCmd,
    apexTestClassRunDelegateCmd,
    apexTestLastClassRunCmd,
    apexTestLastMethodRunCmd,
    apexTestMethodRunCmd,
    apexTestMethodRunDelegateCmd,
    apexTestRunCmd,
    apexToggleColorizerCmd,
    apexTestSuiteCreateCmd,
    apexTestSuiteRunCmd,
    apexTestSuiteAddCmd,
    launchApexReplayDebuggerWithCurrentFileCmd
  );
};

const registerTestView = (): vscode.Disposable => {
  const testOutlineProvider = getTestOutlineProvider();
  // Create TestRunner
  const testRunner = new ApexTestRunner(testOutlineProvider);

  // Test View
  const testViewItems = new Array<vscode.Disposable>();

  const testProvider = vscode.window.registerTreeDataProvider(testOutlineProvider.getId(), testOutlineProvider);
  testViewItems.push(testProvider);

  // Run Test Button on Test View command
  testViewItems.push(
    vscode.commands.registerCommand(`${testOutlineProvider.getId()}.run`, () => testRunner.runAllApexTests())
  );
  // Show Error Message command
  testViewItems.push(
    vscode.commands.registerCommand(`${testOutlineProvider.getId()}.showError`, (test: TestNode) =>
      testRunner.showErrorMessage(test)
    )
  );
  // Show Definition command
  testViewItems.push(
    vscode.commands.registerCommand(`${testOutlineProvider.getId()}.goToDefinition`, (test: TestNode) =>
      testRunner.showErrorMessage(test)
    )
  );
  // Run Class Tests command
  testViewItems.push(
    vscode.commands.registerCommand(`${testOutlineProvider.getId()}.runClassTests`, (test: TestNode) =>
      testRunner.runApexTests([test.name], TestRunType.Class)
    )
  );
  // Run Single Test command
  testViewItems.push(
    vscode.commands.registerCommand(`${testOutlineProvider.getId()}.runSingleTest`, (test: TestNode) =>
      testRunner.runApexTests([test.name], TestRunType.Method)
    )
  );
  // Refresh Test View command
  testViewItems.push(
    vscode.commands.registerCommand(`${testOutlineProvider.getId()}.refresh`, () => {
      if (languageClientUtils.getStatus().isReady()) {
        return testOutlineProvider.refresh();
      }
    })
  );
  // Collapse All Apex Tests command
  testViewItems.push(
    vscode.commands.registerCommand(`${testOutlineProvider.getId()}.collapseAll`, () =>
      testOutlineProvider.collapseAll()
    )
  );

  return vscode.Disposable.from(...testViewItems);
};

export const deactivate = async () => {
  await languageClientUtils.getClientInstance()?.stop();
  const telemetryService = await getTelemetryService();
  telemetryService.sendExtensionDeactivationEvent();
};

const createLanguageClient = async (
  extensionContext: vscode.ExtensionContext,
  languageServerStatusBarItem: ApexLSPStatusBarItem
): Promise<void> => {
  Logger.startTiming('T01_1 createLanguageClient function');
  const telemetryService = await getTelemetryService();
  // Initialize Apex language server
  try {
    Logger.startTiming('T01_1_1 ApexLSP Startup');
    const langClientHRStart = process.hrtime();
    Logger.startTiming('T01_1_1_0 await languageServer.createLanguageServer');
    languageClientUtils.setClientInstance(await languageServer.createLanguageServer(extensionContext));
    Logger.endTiming('T01_1_1_0 await languageServer.createLanguageServer');
    Logger.startTiming('T01_1_1_1 languageClientUtils.getClientInstance()');
    const languageClient = languageClientUtils.getClientInstance();
    Logger.endTiming('T01_1_1_1 languageClientUtils.getClientInstance()');
    Logger.startTiming('T01_1_1_2 languageClient.errorHandler?.addListener');
    if (languageClient) {
      languageClient.errorHandler?.addListener('error', (message: string) => {
        languageServerStatusBarItem.error(message);
      });
      languageClient.errorHandler?.addListener('restarting', (count: number) => {
        languageServerStatusBarItem.error(
          nls.localize('apex_language_server_quit_and_restarting').replace('$N', `${count}`)
        );
      });
      languageClient.errorHandler?.addListener('startFailed', () => {
        languageServerStatusBarItem.error(nls.localize('apex_language_server_failed_activate'));
      });
      Logger.endTiming('T01_1_1_2 languageClient.errorHandler?.addListener');
      // TODO: the client should not be undefined. We should refactor the code to
      // so there is no question as to whether the client is defined or not.
      Logger.startTiming('T01_1_1_3 languageClient.start()');
      await languageClient.start();
      Logger.endTiming('T01_1_1_3 languageClient.start()');
      // Client is running
      const startTime = telemetryService.getEndHRTime(langClientHRStart); // Record the end time
      telemetryService.sendEventData('apexLSPStartup', undefined, {
        activationTime: startTime
      });
      Logger.endTiming('T01_1_1 ApexLSP Startup');
      Logger.startTiming('T01_1_2 First Index Done Handler');
      await indexerDoneHandler(retrieveEnableSyncInitJobs(), languageClient, languageServerStatusBarItem);
      Logger.endTiming('T01_1_2 First Index Done Handler');
      Logger.startTiming('T01_1_3 languageClientUtils.getClientInstance()');
      extensionContext.subscriptions.push(languageClientUtils.getClientInstance()!);
      Logger.endTiming('T01_1_3 languageClientUtils.getClientInstance()');
    } else {
      languageClientUtils.setStatus(
        ClientStatus.Error,
        `${nls.localize('apex_language_server_failed_activate')} - ${nls.localize('unknown')}`
      );
      languageServerStatusBarItem.error(
        `${nls.localize('apex_language_server_failed_activate')} - ${nls.localize('unknown')}`
      );
    }
  } catch (e) {
    let errorMessage = '';
    if (typeof e === 'string') {
      errorMessage = e;
    } else if (e instanceof Error) {
      errorMessage = e.message ?? nls.localize('unknown_error');
    }
    if (errorMessage.includes(nls.localize('wrong_java_version_text', SET_JAVA_DOC_LINK))) {
      errorMessage = nls.localize('wrong_java_version_short');
    }
    languageClientUtils.setStatus(ClientStatus.Error, errorMessage);
    languageServerStatusBarItem.error(`${nls.localize('apex_language_server_failed_activate')} - ${errorMessage}`);
  }
};

// exported only for test
export const indexerDoneHandler = async (
  enableSyncInitJobs: boolean,
  languageClient: ApexLanguageClient,
  languageServerStatusBarItem: ApexLSPStatusBarItem
) => {
  Logger.startTiming('T01_1_2_0 Second Index Done Handler');
  // Listener is useful only in async mode
  if (!enableSyncInitJobs) {
    // The listener should be set after languageClient is ready
    // Language client will get notified once async init jobs are done
    languageClientUtils.setStatus(ClientStatus.Indexing, '');
    languageClient.onNotification(API.doneIndexing, () => {
      void extensionUtils.setClientReady(languageClient, languageServerStatusBarItem);
    });
  } else {
    // indexer must be running at the point
    await extensionUtils.setClientReady(languageClient, languageServerStatusBarItem);
  }
  Logger.endTiming('T01_1_2_0 Second Index Done Handler');
};
